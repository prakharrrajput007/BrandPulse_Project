import re
from processing.tokenizer import nlp 

class EntityExtractor:
    """
    Stage 6: Entity extraction
    Extracts brand mentions, product mentions, NER, prices, discounts, engagement, and signals.
    """
    
    # Known target brands
    BRANDS = {"flipkart", "amazon", "meesho", "myntra", "tata cliq", "nykaa", "ajio", "zepto", "blinkit"}
    POSITIVE_WORDS = {"good", "great", "excellent", "deal", "cheap", "mast", "best"}
    NEGATIVE_WORDS = {"bad", "terrible", "worst", "bakwas", "scam", "fake", "delayed"}

    @classmethod
    def process(cls, doc_text: str, doc_data: dict) -> dict:
        text_lower = doc_text.lower()
        
        # 1. Extract brand mentions from known brand list
        brand_mentions = [brand for brand in cls.BRANDS if brand in text_lower]
        
        # 2. Extract spaCy NER entities (ORG, PRODUCT)
        doc = nlp(doc_text)
        ner_entities = [{"text": ent.text, "label": ent.label_} for ent in doc.ents if ent.label_ in ["ORG", "PRODUCT"]]
        
        # Extract product mentions specifically from the NER output
        product_mentions = [ent["text"] for ent in ner_entities if ent["label"] == "PRODUCT"]
        
        # 3. Extract price values (e.g., matching 'rs. 1000' or '₹1000')
        price_matches = re.findall(r'(?:₹|rs\.? ?)(\d+)', text_lower)
        price_values = [int(p) for p in price_matches]
        
        # 4. Extract discount percentages
        discount_matches = re.findall(r'(\d+)%', text_lower)
        discount_pct = [int(d) for d in discount_matches]
        
        # 5. Calculate engagement score: upvotes + (comments * 2)
        upvotes = doc_data.get("upvotes", 0)
        comments = doc_data.get("comments", 0)
        engagement_score = upvotes + (comments * 2)
        
        # 6. Extract positive/negative signal counts
        words = set(text_lower.split())
        positive_signals = len(words.intersection(cls.POSITIVE_WORDS))
        negative_signals = len(words.intersection(cls.NEGATIVE_WORDS))
        
        return {
            "brand_mentions": brand_mentions,
            "product_mentions": product_mentions,
            "ner_entities": ner_entities,
            "price_values": price_values,
            "discount_pct": discount_pct,
            "engagement_score": engagement_score,
            "positive_signals": positive_signals,
            "negative_signals": negative_signals
        }