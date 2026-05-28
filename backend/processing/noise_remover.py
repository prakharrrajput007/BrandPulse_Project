import re
from bs4 import BeautifulSoup

class NoiseRemover:
    """
    Stage 2: Noise removal
    Strips angle-bracket URLs, standard URLs, HTML entities, and Reddit mentions.
    """
    
    @staticmethod
    def process(text: str) -> str:
        if not text:
            return text
            
        # 1. Strip HTML entities using BeautifulSoup
        text = BeautifulSoup(text, "html.parser").get_text()
        
        # 2. Strip angle-bracket URLs specific to this dataset: <https://...>
        text = re.sub(r'<https?://[^>]+>', '', text)
        
        # 3. Strip standard URLs
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        
        # 4. Strip r/ subreddit mentions and u/ user mentions
        text = re.sub(r'\b[ru]/[A-Za-z0-9_-]+\b', '', text)
        
        # 5. Strip [deleted] and [removed] tags commonly found on Reddit
        text = re.sub(r'\[deleted\]|\[removed\]', '', text, flags=re.IGNORECASE)
        
        # Clean up any leftover extra spaces
        return " ".join(text.split())