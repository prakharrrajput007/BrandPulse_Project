import re

class FieldExtractor:
    """
    Stage 1: Field extraction
    Combines title + body, strips [H]/[W] tags, and rejects if fewer than 4 words.
    """
    
    @staticmethod
    def process(doc: dict) -> dict:
        # Extract title and body, defaulting to empty strings if missing
        title = doc.get("title", "")
        body = doc.get("body", "")
        
        # Combine title and body into a single string
        combined = f"{title} {body}".strip()
        
        # Strip specific Reddit exchange tags like [H], [W], [OC] (case-insensitive)
        # FIX: Moved (?i) to the absolute start of the regex string for Python 3.11 compatibility
        combined = re.sub(r'(?i)\[(h|w|oc)\]', '', combined)
        
        # Clean up any double spaces created by removing the tags
        combined = " ".join(combined.split())
        
        # Null guard: count total words
        word_count = len(combined.split())
        
        return {
            "raw_text": combined,
            "word_count": word_count,
            # Reject if fewer than 4 words combined
            "is_valid": word_count >= 4 
        }