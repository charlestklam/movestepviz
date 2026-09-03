import re
from typing import List
from movestepviz.models import Segment

def segment_text(text: str) -> List[str]:
    """
    Sentence segmentation preserving punctuation and structural boundaries.
    """
    text = text.strip()
    if not text:
        return []
    
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in sentences if s.strip()]
