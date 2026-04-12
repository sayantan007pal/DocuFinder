"""
tests/eval/rag_eval.py — RAGAS RAG evaluation pipeline.
Uses local Gemma 4 via Ollama as the judge LLM.
"""
import json
import sys
import os
from datetime import datetime
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# Test questions for RAGAS evaluation
EVAL_QUESTIONS = [
    "What is the company's vacation policy?",
    "What are the data retention requirements?",
    "What is the procurement process for vendors over $10,000?",
    "What is the remote work policy?",
    "How does the performance review process work?",
]


async def build_eval_dataset(
    tenant_id: str,
    questions: list[str] | None = None,
) -> list[dict]:
    """
    Build evaluation dataset by:
    1. Running search for each question
    2. Collecting: question, answer, contexts, ground_truth (manual or empty)
    """
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))
    from src.retrieval.engine import search

    _questions = questions or EVAL_QUESTIONS
    dataset = []

    for question in _questions:
        try:
            result = await search(question, tenant_id, top_k=5)
            dataset.append({
                "question": question,
                "answer": result.answer,
                "contexts": [node.text for node in result.source_nodes],
                "ground_truth": "",    # Fill manually for ground-truth evaluation
                "latency_ms": result.latency_ms,
            })
        except Exception as exc:
            log.error("eval_question_failed", question=question, error=str(exc))
            dataset.append({
                "question": question,
                "answer": "",
                "contexts": [],
                "ground_truth": "",
                "error": str(exc),
            })

    return dataset


async def run_ragas_eval(
    tenant_id: str,
    questions: list[str] | None = None,
    output_path: str | None = None,
) -> dict:
    """
    Run RAGAS evaluation against the RAG system.
    Uses Gemma 4 via Ollama as the judge LLM.

    Metrics evaluated:
    - faithfulness: Are answers grounded in the retrieved context?
    - answer_relevancy: How relevant is the answer to the question?
    - context_precision: Precision of retrieved chunks
    - context_recall: Recall of retrieved chunks

    ⚠️ RAGAS calls the LLM many times. Budget ~30-60s per question with Gemma 4.
    """
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import (
        answer_faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
    )
    from ragas.llms import LangchainLLMWrapper
    from langchain_ollama import OllamaLLM
    from langchain_huggingface import HuggingFaceEmbeddings

    from src.core.config import get_settings

    settings = get_settings()

    log.info("ragas_eval_start",
             tenant_id=tenant_id,
             question_count=len(questions or EVAL_QUESTIONS))

    # Build dataset
    dataset_raw = await build_eval_dataset(tenant_id, questions)

    # Filter out errored entries
    valid = [d for d in dataset_raw if not d.get("error")]
    if not valid:
        raise RuntimeError("No valid eval samples — check that documents are ingested")

    eval_dataset = Dataset.from_list(valid)

    # Use Gemma 4 as judge
    judge_llm = LangchainLLMWrapper(
        OllamaLLM(model=settings.ollama_model, base_url=settings.ollama_base_url)
    )

    # Use BGE embeddings for embedding metrics
    judge_embeddings = HuggingFaceEmbeddings(
        model_name=settings.embed_model_name,
    )

    scores = evaluate(
        dataset=eval_dataset,
        metrics=[
            answer_faithfulness,
            answer_relevancy,
            context_precision,
            context_recall,
        ],
        llm=judge_llm,
        embeddings=judge_embeddings,
        raise_exceptions=False,
    )

    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "tenant_id": tenant_id,
        "model": settings.ollama_model,
        "parser": settings.parser_provider,
        "chunking": settings.chunking_strategy,
        "questions_evaluated": len(valid),
        "faithfulness": float(scores["faithfulness"]),
        "answer_relevancy": float(scores["answer_relevancy"]),
        "context_precision": float(scores["context_precision"]),
        "context_recall": float(scores["context_recall"]),
        "dataset": dataset_raw,
    }

    log.info("ragas_eval_done",
             faithfulness=results["faithfulness"],
             answer_relevancy=results["answer_relevancy"],
             context_precision=results["context_precision"],
             context_recall=results["context_recall"])

    # Save results
    output = output_path or f"tests/eval/results_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n── RAGAS Evaluation Results ──────────────────────")
    print(f"  Faithfulness:      {results['faithfulness']:.3f}")
    print(f"  Answer Relevancy:  {results['answer_relevancy']:.3f}")
    print(f"  Context Precision: {results['context_precision']:.3f}")
    print(f"  Context Recall:    {results['context_recall']:.3f}")
    print(f"  Results saved: {output}")

    return results


if __name__ == "__main__":
    import asyncio
    import argparse

    parser = argparse.ArgumentParser(description="Run RAGAS evaluation")
    parser.add_argument("--tenant-id", required=True, help="Tenant ID to evaluate")
    parser.add_argument("--output", help="Output JSON file path")
    args = parser.parse_args()

    asyncio.run(run_ragas_eval(tenant_id=args.tenant_id, output_path=args.output))
