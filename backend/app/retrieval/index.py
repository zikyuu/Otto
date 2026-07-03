# index.py -> FAISS wrapper -> holds the in-memory vector index and handles add/search
import faiss
import numpy as np

class CorpusIndex:
    def __init__(self, dim: int):
        self.dim = dim
        self._ids = [] # so u know which string of numbers (encoded vector) corresponds to what
        self._index = faiss.IndexFlatIP(dim)

    def add(self, entry_id: str, vec: np.ndarray) -> None:
        vec = _normalize(vec) # so that everything is normalised, when computing dot product -> cosine similarity
        self._ids.append(entry_id) 
        self._index.add(vec.reshape(1, -1))

    def search(self, query_vec: np.ndarray, k: int) -> list[tuple[str, float]]:
        if not self._ids:
            return []
        k = min(k, len(self._ids))
        query_vec = _normalize(query_vec) # for cosine similarity
        # return shape: [ [query 1's top-k results], [query 2's top-k results], ... ]
        scores, idxs = self._index.search(query_vec.reshape(1, -1), k)
        # j pos to get score
        # i pos in the self._ids to get decoded res in pipeline.py
        return [(self._ids[i], float(scores[0][j])) for j, i in enumerate(idxs[0]) if i >= 0]

    def __len__(self) -> int:
        return len(self._ids)


def _normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm > 0 else v