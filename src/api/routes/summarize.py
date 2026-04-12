"""
src/api/routes/summarize.py — Document and topic summarization endpoints.
"""
import structlog
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.routes.auth import get_current_user_dep
from src.models.db import DocRecord, User

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/summarize", tags=["summarize"])


class SummaryResponse(BaseModel):
    doc_id: str
    filename: str
    summary: str
    provider_used: str


class TopicSummaryRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(20, ge=5, le=50)


class TopicSummaryResponse(BaseModel):
    topic: str
    summary: str
    provider_used: str


class ClassifyResponse(BaseModel):
    doc_id: str
    filename: str
    category: str
    provider_used: str


@router.post("/document/{doc_id}", response_model=SummaryResponse)
async def summarize_document(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> SummaryResponse:
    """Summarize a specific document using tree-summarize synthesis."""
    user, tenant_id = auth
    from src.core.config import get_settings

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if doc.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Document not ready for summarization (status: {doc.status})",
        )

    from src.retrieval.summarizer import summarize_document as do_summarize

    summary = await do_summarize(doc_id=doc_id, tenant_id=tenant_id)
    settings = get_settings()

    return SummaryResponse(
        doc_id=doc_id,
        filename=doc.filename,
        summary=summary,
        provider_used=settings.extract_provider,
    )


@router.post("/topic", response_model=TopicSummaryResponse)
async def summarize_topic(
    body: TopicSummaryRequest,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> TopicSummaryResponse:
    """Cross-document topic summarization across all tenant documents."""
    user, tenant_id = auth
    from src.core.config import get_settings
    from src.retrieval.summarizer import summarize_topic as do_summarize

    summary = await do_summarize(
        query=body.topic,
        tenant_id=tenant_id,
        top_k=body.top_k,
    )

    settings = get_settings()
    return TopicSummaryResponse(
        topic=body.topic,
        summary=summary,
        provider_used=f"{settings.index_provider}+{settings.llm_provider}",
    )


@router.post("/classify/{doc_id}", response_model=ClassifyResponse)
async def classify_document(
    doc_id: str,
    auth: tuple[User, str] = Depends(get_current_user_dep),
) -> ClassifyResponse:
    """Classify a document into a predefined category."""
    user, tenant_id = auth
    from src.core.config import get_settings

    doc = await DocRecord.get(PydanticObjectId(doc_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if str(doc.tenant_id) != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")

    from src.retrieval.summarizer import classify_document as do_classify

    category = await do_classify(doc_id=doc_id, tenant_id=tenant_id)
    settings = get_settings()

    # Update the document record
    await doc.update({"$set": {"pdf_type": category}})

    return ClassifyResponse(
        doc_id=doc_id,
        filename=doc.filename,
        category=category,
        provider_used=settings.classify_provider,
    )
