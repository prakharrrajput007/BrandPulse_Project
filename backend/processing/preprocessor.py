from datetime import datetime, timezone
from processing.field_extractor import FieldExtractor
from processing.noise_remover import NoiseRemover
from processing.language_detector import LanguageDetector
from processing.normalizer import Normalizer
from processing.tokenizer import Tokenizer
from processing.entity_extractor import EntityExtractor

class Preprocessor:
    """Master orchestrator for the 6-stage NLP pipeline."""
    
    PIPELINE_VERSION = "1.0.0"

    @classmethod
    def process_document(cls, doc: dict) -> dict:
        # Stage 1: Field Extraction
        ext_result = FieldExtractor.process(doc)
        raw_text = ext_result["raw_text"]
        
        # Reject document early if it fails the null guard (too short)
        if not ext_result["is_valid"]:
            return cls._build_rejected_doc(doc, raw_text, "too_short")

        # Stage 2: Noise Removal
        clean_text = NoiseRemover.process(raw_text)

        # Stage 3: Language Detection
        language = LanguageDetector.process(clean_text)
        # Keep en and hinglish in main pipeline, flag others
        if language not in ["en", "hinglish"]:
            quality_flag = "non_english" if language != "unknown_language" else "unknown_language"
            return cls._build_rejected_doc(doc, raw_text, quality_flag, clean_text, language)

        # Stage 4: Normalization
        normalized_text = Normalizer.process(clean_text)

        # Stage 5: Tokenization
        tok_result = Tokenizer.process(normalized_text)

        # Stage 6: Entity Extraction
        entities = EntityExtractor.process(normalized_text, doc)

        # Build final Output document schema
        return {
            "source_id": str(doc.get("_id")),
            "post_id": doc.get("postId"),
            "subreddit": doc.get("subreddit"),
            "ecom_site": doc.get("ecomSite"),
            "keyword": doc.get("keyword"),
            "created_date": doc.get("createdDate"),
            
            "raw_text": raw_text,
            "clean_text": clean_text,
            "normalized_text": normalized_text,
            "tokens": tok_result["tokens"],
            "token_count": tok_result["token_count"],
            "language": language,
            
            "brand_mentions": entities["brand_mentions"],
            "product_mentions": entities["product_mentions"],
            "ner_entities": entities["ner_entities"],
            "price_values": entities["price_values"],
            "discount_pct": entities["discount_pct"],
            "engagement_score": entities["engagement_score"],
            "positive_signals": entities["positive_signals"],
            "negative_signals": entities["negative_signals"],
            
            "quality_flag": "ok",
            "preprocessed_at": datetime.now(timezone.utc).isoformat(),
            "pipeline_version": cls.PIPELINE_VERSION,
            # Placeholders for ML phase
            "sentiment_label": None,
            "sentiment_score": None
        }

    @classmethod
    def _build_rejected_doc(cls, doc, raw_text, flag, clean_text=None, language=None):
        """Helper to build schema for flagged/rejected documents."""
        return {
            "source_id": str(doc.get("_id")),
            "post_id": doc.get("postId"),
            "subreddit": doc.get("subreddit"),
            "ecom_site": doc.get("ecomSite"),
            "keyword": doc.get("keyword"),
            "created_date": doc.get("createdDate"),
            "raw_text": raw_text,
            "clean_text": clean_text,
            "language": language,
            "quality_flag": flag,
            "preprocessed_at": datetime.now(timezone.utc).isoformat(),
            "pipeline_version": cls.PIPELINE_VERSION,
            "sentiment_label": None,
            "sentiment_score": None
        }