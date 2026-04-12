"""
src/api/routes/search.py — Semantic search endpoint.
"""
import time

import structlog
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from src.api.routes.auth import get_current_user_dep
from src.models.db import User

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(8, ge=1, le=20)
    doc_ids: list[str] | None = None     # Filter to specific documents


class SearchHit(BaseModel):
    doc_id: str
    filename: str
    page_number: int | None
    chunk_text: str
    score: float


class SearchResponse(BaseModel):
    answer: str
    results: list[SearchHit]
    total: int
    took_ms: float
    cached: bool
    provider_used: str


@router.post("", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> SearchResponse:
    """
    Hybrid semantic search across all ingested documents for the tenant.
    Returns both a synthesized answer and ranked source chunks.
    """
    user, tenant_id = auth

    from src.retrieval.engine import search as retrieval_search

    result = await retrieval_search(
        query=body.query,
        tenant_id=tenant_id,
        top_k=body.top_k,
    )

    hits = [
        SearchHit(
            doc_id=node.doc_id,
            filename=node.filename,
            page_number=node.page_number,
            chunk_text=node.text,
            score=round(node.score, 4),
        )
        for node in result.source_nodes
    ]

    return SearchResponse(
        answer=result.answer,
        results=hits,
        total=len(hits),
        took_ms=result.latency_ms,
        cached=result.cached,
        provider_used=result.provider_used,
    )


@router.get("", response_model=SearchResponse)
async def search_get(
    q: str = Query(..., min_length=1, max_length=2000),
    top_k: int = Query(8, ge=1, le=20),
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> SearchResponse:
    """GET variant for search — useful for frontend quick searches."""
    user, tenant_id = auth
    body = SearchRequest(query=q, top_k=top_k)
    return await search(body, auth)
