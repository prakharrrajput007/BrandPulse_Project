import os
import sys
import json
import subprocess
from datetime import datetime, timedelta

from fastapi import FastAPI, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import json_util

# Load environment variables from your .env file
load_dotenv()

app = FastAPI(title="BrandPulse API")

# IMPORTANT: Configure CORS so your Next.js UI can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://brand-pulse-project.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect to MongoDB Atlas
client = MongoClient(os.getenv("MONGO_URI"))
db = client[os.getenv("DB_NAME", "brandpulse")]
collection = db["preprocessed_reddit_score"]


@app.get("/api/dashboard")
def get_dashboard_metrics(
        brand: str = "Flipkart",
        days: int = Query(30, description="Number of days to look back"),
        start_date: str = None,
        end_date: str = None
):
    """
    Dynamically filters MongoDB based on the exact date range and brand selected in the UI.
    """

    # 1. Build the dynamic date query
    date_query = {}
    if start_date and end_date:
        date_query = {"$gte": start_date, "$lte": end_date}
    else:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
        date_query = {"$gte": cutoff_date}

    # 2. Build the main MongoDB filter
    mongo_filter = {"created_date": date_query}
    if brand.lower() != "all":
        mongo_filter["brand_mentions"] = brand.lower()

    # 3. KPI Calculations & Data Feeds
    # Bump to 300 so the frontend has a deep pool to search for Trending Topics
    recent_posts = list(collection.find(mongo_filter, {"_id": 0}).sort("created_date", -1).limit(300))

    # Fetch a dedicated list of 100 Negative posts specifically for the Alerts Tab
    alerts_feed = list(collection.find({**mongo_filter, "sentiment_label": "Negative"}, {"_id": 0}).sort("created_date", -1).limit(100))

    total_mentions = collection.count_documents(mongo_filter)
    pos_mentions = collection.count_documents({**mongo_filter, "sentiment_label": "Positive"})
    neg_mentions = collection.count_documents({**mongo_filter, "sentiment_label": "Negative"})

    pos_pct = round((pos_mentions / total_mentions) * 100) if total_mentions > 0 else 0
    neg_pct = round((neg_mentions / total_mentions) * 100) if total_mentions > 0 else 0

    # DYNAMIC: Active Alerts (Triggers based on negative mention volume)
    active_alerts = neg_mentions

    # 4. DYNAMIC: Sentiment Trend Chart (MongoDB Aggregation)
    pipeline = [
        {"$match": mongo_filter},
        {"$project": {
            "date": {"$substr": [{"$toString": "$created_date"}, 0, 10]},  # Extracts YYYY-MM-DD
            "sentiment": "$sentiment_label"
        }},
        {"$group": {
            "_id": "$date",
            "positive": {"$sum": {"$cond": [{"$eq": ["$sentiment", "Positive"]}, 1, 0]}},
            "negative": {"$sum": {"$cond": [{"$eq": ["$sentiment", "Negative"]}, 1, 0]}}
        }},
        {"$sort": {"_id": 1}}  # Sort chronologically
    ]
    trend_agg = list(collection.aggregate(pipeline))

    # Format date as MM-DD for the Recharts UI
    trend_data = [{"name": item["_id"][-5:], "positive": item["positive"], "negative": item["negative"]} for item in
                  trend_agg]

    # 5. DYNAMIC: Trending Topics Extraction
    topic_keywords = ["delivery", "refund", "quality", "service", "price", "scam", "return", "discount", "app", "fake",
                      "offer"]
    trending_topics = []

    for kw in topic_keywords:
        kw_filter = {**mongo_filter, "normalized_text": {"$regex": kw, "$options": "i"}}
        kw_count = collection.count_documents(kw_filter)

        if kw_count > 0:
            pos = collection.count_documents({**kw_filter, "sentiment_label": "Positive"})
            neg = collection.count_documents({**kw_filter, "sentiment_label": "Negative"})

            # Determine majority sentiment for the topic
            sentiment = "Neutral"
            if pos > neg:
                sentiment = "Positive"
            elif neg > pos:
                sentiment = "Negative"

            trending_topics.append({
                "topic": kw.capitalize(),
                "mentions": kw_count,
                "sentiment": sentiment
            })

    # Sort topics by highest mentions and grab the top 100
    trending_topics = sorted(trending_topics, key=lambda x: x["mentions"], reverse=True)[:100]

    # 6. Format the response
    response_data = {
        "kpis": {
            "total_mentions": total_mentions,
            "positive_pct": pos_pct,
            "negative_pct": neg_pct,
            "active_alerts": active_alerts
        },
        "live_feed": recent_posts,
        "alerts_feed": alerts_feed,
        "trend_data": trend_data,
        "trending_topics": trending_topics
    }

    # Safely parse BSON to standard JSON
    return json.loads(json_util.dumps(response_data))


@app.post("/api/trigger-pipeline")
async def trigger_pipeline(background_tasks: BackgroundTasks):
    def run_scripts():
        print("🚀 [Trigger] Starting NLP Pipeline...")
        # sys.executable makes this completely cross-platform!
        subprocess.run([sys.executable, "-m", "processing.run_pipeline"], check=True)

        print("🧠 [Trigger] Starting Machine Learning Score...")
        subprocess.run([sys.executable, "-m", "processing.ml_analyzer"], check=True)

        print("✅ [Trigger] All pipelines complete! Dashboard is updated.")

    background_tasks.add_task(run_scripts)
    return {"message": "BrandPulse pipeline triggered in the background!"}