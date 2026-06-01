import spacy

# Load spaCy model globally to avoid reloading on every single document
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    raise OSError("Missing model. Run: python -m spacy download en_core_web_sm")

class Tokenizer:
    """
    Stage 5: Tokenization
    spaCy tokenize, lemmatize, remove stopwords (including domain words), keep proper nouns.
    """
    
    # Custom domain stopword list for Reddit/deal community noise
    DOMAIN_STOPWORDS = {"post", "comment", "reddit", "sub", "thread"}

    @classmethod
    def process(cls, text: str) -> dict:
        doc = nlp(text)
        
        tokens = []
        for token in doc:
            # Always keep proper nouns (brand names) as-is
            if token.pos_ == "PROPN":
                tokens.append(token.text)
                continue
                
            # Remove standard stopwords, punctuation, and custom domain noise
            if not token.is_stop and not token.is_punct and token.text.lower() not in cls.DOMAIN_STOPWORDS:
                # Append the lemmatized version of the word
                tokens.append(token.lemma_)
                
        return {
            "tokens": tokens,
            "token_count": len(tokens)
        }