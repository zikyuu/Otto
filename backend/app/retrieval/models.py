# models.py: defines 2 dataclasses 
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Literal
import uuid

ResourceType = Literal["article", "video", "problem", "course"]

# one corpus (document) in the recommendation corpus (data from exa or existing from vector database)
# input side of pipeline
@dataclass
class CorpusEntry:
    title: str
    url: str
    description: str
    skill: str # which gap this serves -> eg: system design, sql etc
    resource_type: ResourceType
    difficulty: int # 1=beginner, 2=intermediate, 3=advanced
    est_minutes: int # how long it takes to consume
    source_quality: float 
    tags: list[str] = field(default_factory=list)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    fetched_at: str = ""
    embedding: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("embedding", None)
        return d
    
# output side of the pipeline
@dataclass
class RankedResource:
    entry: CorpusEntry
    score: float
    cosine_sim: float
    time_fit: float
    difficulty_fit: float

    def to_dict(self) -> dict:
        return {**self.entry.to_dict(), 
                "score": round(self.score, 4), 
                "cosine_sim": round(self.cosine_sim, 4),
                "time_fit": round(self.time_fit, 4),
                "difficulty_fit": round(self.difficulty_fit, 4),
                }
    

