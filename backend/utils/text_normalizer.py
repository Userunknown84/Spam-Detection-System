import unicodedata
import re

class TextNormalizer:
    """Text normalization pipeline to prevent homoglyph/obfuscation evasion."""
    
    def __init__(self):
        # Common homoglyph mappings (extend as needed)
        self.homoglyph_map = {
            'а': 'a',  # Cyrillic a
            'е': 'e',  # Cyrillic e
            'р': 'p',  # Cyrillic p
            'с': 'c',  # Cyrillic c
            'о': 'o',  # Cyrillic o
            'х': 'x',  # Cyrillic x
            'у': 'y',  # Cyrillic y
            'ѕ': 's',  # Cyrillic dze
            'і': 'i',  # Cyrillic i
            'ї': 'i',  # Cyrillic yi
            'ґ': 'g',  # Cyrillic ghe
        }
    
    def normalize(self, text: str) -> str:
        """Apply full normalization pipeline."""
        if not text or not isinstance(text, str):
            return text
        
        # 1. Unicode normalization (NFKC)
        text = unicodedata.normalize('NFKC', text)
        
        # 2. Apply homoglyph mapping
        text = self._replace_homoglyphs(text)
        
        # 3. Remove zero-width and unprintable characters
        text = self._remove_zero_width(text)
        
        # 4. Remove excessive whitespace
        text = self._normalize_whitespace(text)
        
        # 5. De-obfuscate spaced words (e.g., "f r e e")
        text = self._deobfuscate_spaced_words(text)
        
        return text.strip()
    
    def _replace_homoglyphs(self, text: str) -> str:
        """Replace Cyrillic homoglyphs with Latin equivalents."""
        for cyrillic, latin in self.homoglyph_map.items():
            text = text.replace(cyrillic, latin)
        return text
    
    def _remove_zero_width(self, text: str) -> str:
        """Remove zero-width and unprintable characters."""
        # Zero-width characters
        zero_width = [
            '\u200b',  # Zero-width space
            '\u200c',  # Zero-width non-joiner
            '\u200d',  # Zero-width joiner
            '\u200e',  # Left-to-right mark
            '\u200f',  # Right-to-left mark
            '\ufeff',  # Byte order mark
            '\u0000',  # Null
            '\u000b',  # Vertical tab
            '\u000c',  # Form feed
        ]
        for char in zero_width:
            text = text.replace(char, '')
        
        # Remove other unprintable characters
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        
        return text
    
    def _normalize_whitespace(self, text: str) -> str:
        """Condense multiple spaces and normalize whitespace."""
        # Replace multiple spaces with single
        text = re.sub(r'\s+', ' ', text)
        # Remove spaces at start/end
        text = text.strip()
        return text
    
    def _deobfuscate_spaced_words(self, text: str) -> str:
        """Remove spaces between single characters (e.g., 'f r e e' -> 'free')."""
        # Find patterns like "f r e e" (spaces between single chars)
        pattern = r'(?<=\b)([a-zA-Z])\s+(?=[a-zA-Z]\s+[a-zA-Z])'
        while re.search(pattern, text):
            text = re.sub(pattern, r'\1', text)
        return text

# Global instance
normalizer = TextNormalizer()