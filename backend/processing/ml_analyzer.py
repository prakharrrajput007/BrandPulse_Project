import os
import logging
from pymongo import MongoClient
from dotenv import load_dotenv
from transformers import pipeline

# Setup Terminal Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class SentimentAnalyzer:
    def __init__(self):
        logger.info("Loading Hugging Face RoBERTa model... (This takes a moment)")
        # Initialize the Hugging Face pipeline for sentiment analysis
        self.analyzer = pipeline(
            task="sentiment-analysis",
            model="cardiffnlp/twitter-roberta-base-sentiment-latest",
            tokenizer="cardiffnlp/twitter-roberta-base-sentiment-latest",
            max_length=512,
            truncation=True
        )

        # Standardize the output labels for our React Dashboard
        self.label_mapping = {
            "positive": "Positive",
            "neutral": "Neutral",
            "negative": "Negative"
        }

    def analyze(self, text: str) -> dict:
        """Runs the normalized text through the Hugging Face model."""
        if not text:
            return {"label": "Neutral", "score": 0.0}

        try:
            result = self.analyzer(text)[0]
            raw_label = result['label'].lower()
            return {
                "label": self.label_mapping.get(raw_label, "Neutral"),
                "score": round(result['score'], 4)
            }
        except Exception as e:
            logger.error(f"Inference error: {str(e)}")
            return {"label": "Neutral", "score": 0.0}


def run_ml_pipeline():
    load_dotenv()
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME")

    if not mongo_uri or not db_name:
        logger.error("MongoDB configuration missing in .env file.")
        return

    logger.info("Connecting to MongoDB Atlas...")
    client = MongoClient(mongo_uri)
    db = client[db_name]

    # 1. Define Source and Target Collections
    source_collection = db["processed_posts"]
    target_collection = db["preprocessed_reddit_score"]

    # Initialize the AI Model
    sentiment_model = SentimentAnalyzer()

    # 2. Fetch IDs of documents ALREADY in the target collection.
    # This prevents running the heavy ML model on the same post twice if the script is restarted.
    existing_ids = set([doc["_id"] for doc in target_collection.find({}, {"_id": 1})])

    # 3. Read from the source collection
    cursor = source_collection.find({})

    processed_count = 0
    logger.info("Starting Machine Learning Sentiment Scoring & Migration...")

    for doc in cursor:
        doc_id = doc["_id"]

        # Skip if this document has already been scored and moved to the new collection
        if doc_id in existing_ids:
            continue

        # Get the clean, normalized text from the NLP pipeline
        text_to_analyze = doc.get("normalized_text", "")

        # Run ML inference
        ai_result = sentiment_model.analyze(text_to_analyze)

        # Update the document with the ML results
        doc["sentiment_label"] = ai_result["label"]
        doc["sentiment_score"] = ai_result["score"]

        try:
            # 4. Insert the fully scored document into the NEW collection
            target_collection.insert_one(doc)
            processed_count += 1

            if processed_count % 10 == 0:
                logger.info(f"Scored & Migrated {processed_count} documents...")
        except Exception as e:
            logger.error(f"Error migrating document {doc_id}: {str(e)}")

    logger.info(
        f"ML Pipeline complete. Successfully scored and migrated {processed_count} documents to 'preprocessed_reddit_score'.")


if __name__ == "__main__":
    run_ml_pipeline()