import os
from datetime import datetime, timedelta
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import json_util
import json

# Load environment variables from your .env file
load_dotenv()

app = FastAPI(title="BrandPulse API")

# IMPORTANT: Configure CORS so your Next.js UI (Port 3000) can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
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
    brand: str = "All", 
    days: int = Query(7, description="Number of days to look back"),
    start_date: str = None, 
    end_date: str = None
):
    """
    Dynamically filters MongoDB based on the exact date range and brand selected in the UI.
    """
    
    # 1. Build the dynamic date query
    date_query = {}
    
    # If the user selects a custom date range:
    if start_date and end_date:
        date_query = {
            "$gte": start_date,  
            "$lte": end_date     
        }
    # If the user selects a standard dropdown (7 days, 15 days, etc.):
    else:
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
        date_query = {"$gte": cutoff_date}

    # 2. Build the main MongoDB filter
    mongo_filter = {"created_date": date_query}
    
    # Add the brand filter if they didn't select "All"
    if brand != "All":
        # Searches the brand_mentions array we created in NLP Stage 6
        mongo_filter["brand_mentions"] = brand.lower()

    # 3. Fetch the dynamically filtered data!
    recent_posts = list(collection.find(mongo_filter, {"_id": 0}).sort("_id", -1).limit(15))
    total_mentions = collection.count_documents(mongo_filter)
    pos_mentions = collection.count_documents({**mongo_filter, "sentiment_label": "Positive"})
    neg_mentions = collection.count_documents({**mongo_filter, "sentiment_label": "Negative"})
    
    # Calculate percentages safely
    pos_pct = round((pos_mentions / total_mentions) * 100) if total_mentions > 0 else 0
    neg_pct = round((neg_mentions / total_mentions) * 100) if total_mentions > 0 else 0

    # 4. Format the response exactly how the React UI expects it
    response_data = {
        "kpis": {
            "total_mentions": total_mentions,
            "positive_pct": pos_pct,
            "negative_pct": neg_pct,
            "active_alerts": 2 # Placeholder for future alerting logic
        },
        "live_feed": recent_posts,
        # Mock trend data for the chart (can be updated to dynamic aggregation later)
        "trend_data": [
            {"name": "Mon", "positive": 40, "negative": 24},
            {"name": "Tue", "positive": 30, "negative": 13},
            {"name": "Wed", "positive": 20, "negative": 58},
            {"name": "Thu", "positive": 27, "negative": 39},
            {"name": "Fri", "positive": 18, "negative": 48},
            {"name": "Sat", "positive": 23, "negative": 38},
            {"name": "Sun", "positive": 34, "negative": 43},
        ]
    }
    
    # Safely parse BSON to standard JSON
    return json.loads(json_util.dumps(response_data))