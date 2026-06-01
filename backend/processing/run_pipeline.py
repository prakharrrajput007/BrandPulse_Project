import os
import logging
from pymongo import MongoClient
from dotenv import load_dotenv
from processing.preprocessor import Preprocessor

# Setup Terminal Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def run_pipeline():
    # Load credentials from .env
    load_dotenv()
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME")
    
    if not mongo_uri or not db_name:
        logger.error("MongoDB configuration missing in .env file.")
        return

    logger.info("Connecting to MongoDB Atlas...")
    client = MongoClient(mongo_uri)
    db = client[db_name]
    
    # Define source and target collections
    source_collection = db["reddit_posts"]
    target_collection = db["processed_posts"]
    
    # Fetch posts that have already been processed to avoid duplicates
    processed_ids = set([doc["source_id"] for doc in target_collection.find({}, {"source_id": 1})])
    
    cursor = source_collection.find({})
    
    processed_count = 0
    logger.info("Starting preprocessing pipeline...")
    
    for doc in cursor:
        doc_id = str(doc["_id"])
        
        # Skip if already processed
        if doc_id in processed_ids:
            continue
            
        try:
            # Pass document through orchestrator
            processed_doc = Preprocessor.process_document(doc)
            # Insert into processed_posts
            target_collection.insert_one(processed_doc)
            
            processed_count += 1
            if processed_count % 50 == 0:
                logger.info(f"Processed {processed_count} documents...")
        except Exception as e:
            logger.error(f"Error processing document {doc_id}: {str(e)}")
            
    logger.info(f"Pipeline complete. Successfully processed {processed_count} new documents.")

if __name__ == "__main__":
    run_pipeline()