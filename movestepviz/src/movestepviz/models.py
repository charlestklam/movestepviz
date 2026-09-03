from typing import Dict, List, Optional
from pydantic import BaseModel

class Label(BaseModel):
    id: str
    name: str
    color: str

class LabelSet(BaseModel):
    id: str
    name: str
    labels: List[Label]
    multiLabel: bool

class Segment(BaseModel):
    id: int
    text: str

class AiMetadata(BaseModel):
    confidence: float
    evidence: str

class Annotation(BaseModel):
    segmentId: int
    labelIds: Dict[str, List[str]] # { labelSetId: [labelId, ...] }
    aiMetadata: Optional[Dict[str, Dict[str, AiMetadata]]] = None

class FullAnnotation(Annotation):
    annotatorType: str # 'human' or 'ai'
    timestamp: str
    segmentText: str
    articleTitle: Optional[str] = None
    pmid: Optional[str] = None
