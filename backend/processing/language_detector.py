from langdetect import detect, LangDetectException

class LanguageDetector:
    """
    Stage 3: Language detection
    Detects en / hinglish / hi / other using langdetect and a custom Hinglish word list.
    """
    
    # Custom Hinglish word list commonly found in Indian e-commerce subreddits
    HINGLISH_VOCAB = {
        "hai", "kiya", "nahi", "bhai", "sasta", "mahenga", "bakwas", 
        "mast", "loot", "kya", "koi", "accha", "acha", "kharab", "lelo", 
        "mat", "karo", "ka", "ki", "ke", "se", "pe"
    }

    @classmethod
    def process(cls, text: str) -> str:
        text_lower = text.lower()
        words = set(text_lower.split())
        
        # Check against custom Hinglish vocabulary first
        # This prevents langdetect from mistaking romanized Hindi for other languages
        if len(words.intersection(cls.HINGLISH_VOCAB)) >= 1:
            return "hinglish"
            
        try:
            # Fall back to langdetect for standard detection
            detected_lang = detect(text)
            if detected_lang in ['en', 'hi']:
                return detected_lang
            else:
                return "other"
        except LangDetectException:
            # Failsafe if langdetect throws an error on completely broken text
            return "unknown_language"