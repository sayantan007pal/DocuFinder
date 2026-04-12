"""
src/retrieval/summarizer.py — Document and topic summarization.
"""
import structlog
from llama_index.core import DocumentSummaryIndex, VectorStoreIndex
from llama_index.core.schema import Document as LIDocument

from src.retrieval.engine import get_llm_singleton, search

log = structlog.get_logger(__name__)

DOCUMENT_CATEGORIES = ["contract", "policy", "report", "invoice", "proposal", "other"]


async def summarize_document(doc_id: str, tenant_id: str) -> str:
    """
    Summarize a single document by retrieving all its nodes from Qdrant
    and running a tree_summarize synthesis.

    [SWAP] If EXTRACT_PROVIDER=llamaextract, uses LlamaCloud LlamaExtract.
    """
    from src.core.config import get_settings
    settings = get_settings()

    if settings.extract_provider == "llamaextract":
        return await _summarize_via_llamaextract(doc_id, tenant_id)

    # Default: local DocumentSummaryIndex via Ollama
    from src.core.qdrant_client import get_async_qdrant_client, get_sync_qdrant_client
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue

    # Retrieve all Qdrant nodes for this doc
    client = get_sync_qdrant_client()
    settings_obj = get_settings()

    scroll_filter = Filter(
        must=[
            FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
            FieldCondition(key="doc_id", match=MatchValue(value=doc_id)),
        ]
    )

    records, _ = client.scroll(
        collection_name=settings_obj.collection_name,
        scroll_filter=scroll_filter,
        limit=500,
        with_payload=True,
        with_vectors=False,
    )

    if not records:
        log.warning("summarize_no_nodes_found", doc_id=doc_id, tenant_id=tenant_id)
        return "No content found for this document."

    # Reconstruct LlamaIndex Documents from stored payloads
    docs = []
    for record in records:
        payload = record.payload or {}
        text = payload.get("_node_content", "")
        if isinstance(text, str) and text.strip():
            docs.append(LIDocument(text=text, metadata=payload))

    if not docs:
        return "Could not extract text from stored document nodes."

    log.info("summarize_building_index", doc_id=doc_id, node_count=len(docs))

    index = DocumentSummaryIndex.from_documents(
        docs,
        llm=get_llm_singleton(),
        show_progress=False,
    )
    summary_engine = index.as_query_engine(response_mode="tree_summarize")
    response = summary_engine.query(
        "Provide a comprehensive executive summary of this document. "
        "Cover the main topics, key findings, and important conclusions."
    )
    return str(response)


async def summarize_topic(query: str, tenant_id: str, top_k: int = 20) -> str:
    """
    Cross-document topic summarization.
    Retrieves nodes across all documents matching the query,
    synthesizes a unified summary.
    """
    result = await search(query, tenant_id, top_k=top_k)

    if not result.source_nodes:
        return f"No documents found related to: {query}"

    # Build a mini corpus from retrieved nodes
    docs = [
        LIDocument(
            text=node.text,
            metadata={"filename": node.filename, "doc_id": node.doc_id},
        )
        for node in result.source_nodes
    ]

    index = DocumentSummaryIndex.from_documents(
        docs,
        llm=get_llm_singleton(),
        show_progress=False,
    )
    summary_engine = index.as_query_engine(response_mode="tree_summarize")
    response = summary_engine.query(
        f"Synthesize a comprehensive summary across all documents about: {query}"
    )
    return str(response)


async def classify_document(doc_id: str, tenant_id: str) -> str:
    """
    Classify a document into a predefined category.
    [SWAP] If CLASSIFY_PROVIDER=llamaclassify, uses LlamaCloud.
    Otherwise: prompt Gemma 4 with document summary.
    """
    from src.core.config import get_settings
    settings = get_settings()

    if settings.classify_provider == "llamaclassify":
        return await _classify_via_llamaclassify(doc_id, tenant_id)

    # Local classification via summary + LLM
    summary = await summarize_document(doc_id, tenant_id)

    llm = get_llm_singleton()
    prompt = (
        f"Classify the following document summary into one of these categories: "
        f"{', '.join(DOCUMENT_CATEGORIES)}.\n\n"
        f"Document summary:\n{summary[:2000]}\n\n"
        f"Reply with ONLY the category name, nothing else."
    )

    from llama_index.core.llms import ChatMessage
    response = await llm.acomplete(prompt)
    category = str(response).strip().lower()

    # Validate
    if category not in DOCUMENT_CATEGORIES:
        category = "other"

    log.info("document_classified", doc_id=doc_id, category=category, provider="local")
    return category


async def _summarize_via_llamaextract(doc_id: str, tenant_id: str) -> str:
    """[SWAP] LlamaExtract cloud summarization placeholder."""
    log.info("llamaextract_summarize", doc_id=doc_id)
    # TODO: implement LlamaExtract schema-based extraction when needed
    raise NotImplementedError(
        "LlamaExtract summarization not yet implemented. "
        "Set EXTRACT_PROVIDER=local."
    )


async def _classify_via_llamaclassify(doc_id: str, tenant_id: str) -> str:
    """[SWAP] LlamaClassify cloud classification placeholder."""
    log.info("llamaclassify_classify", doc_id=doc_id)
    raise NotImplementedError(
        "LlamaClassify not yet implemented. "
        "Set CLASSIFY_PROVIDER=local."
    )
