import re
import contractions

class Normalizer:
    """
    Stage 4: Normalization
    Lowercases, expands contractions, removes commas from numbers, 
    converts price shorthands, and expands Indian slang.
    """
    
    # Custom domain dictionary for Indian E-commerce slang
    SLANG_DICT = {
        "loot": "great deal",
        "bakwas": "terrible",
        "sasta": "cheap",
        "mast": "excellent",
        "gc": "gift card",
        "upi": "unified payments interface"
    }

    @classmethod
    def strip_number_commas(cls, text: str) -> str:
        # Removes commas that are surrounded by digits (e.g., "1,500" -> "1500" or "1,50,000" -> "150000")
        # (?<=\d) looks behind for a digit, and (?=\d) looks ahead for a digit.
        return re.sub(r'(?<=\d),(?=\d)', '', text)

    @classmethod
    def expand_price_shorthands(cls, text: str) -> str:
        # Convert shorthands like 1k or 6k to 1000 or 6000
        def k_repl(match):
            val = float(match.group(1))
            return str(int(val * 1000))
            
        # Convert shorthands like 1.5L to 150000
        def l_repl(match):
            val = float(match.group(1))
            return str(int(val * 100000))

        # Apply the regex substitutions
        text = re.sub(r'\b(\d+(?:\.\d+)?)[kK]\b', k_repl, text)
        text = re.sub(r'\b(\d+(?:\.\d+)?)[lL]\b', l_repl, text)
        return text

    @classmethod
    def process(cls, text: str) -> str:
        # 1. Lowercase all text
        text = text.lower()
        
        # 2. Expand English contractions (e.g., "don't" -> "do not")
        text = contractions.fix(text)
        
        # 3. Strip commas specifically from explicitly typed numbers
        text = cls.strip_number_commas(text)
        
        # 4. Convert price shorthands (1k->1000, 1.5L->150000)
        text = cls.expand_price_shorthands(text)
        
        # 5. Expand Indian e-commerce slang using custom dictionary
        words = text.split()
        expanded_words = [cls.SLANG_DICT.get(word, word) for word in words]
        
        return " ".join(expanded_words)