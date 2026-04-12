"""
src/core/tracing.py — Arize Phoenix OTEL tracing + LlamaIndex instrumentation.
Every Qdrant query, Ollama call, and embedding operation is traced automatically.
"""
import structlog

log = structlog.get_logger(__name__)


def setup_tracing() -> None:
    """
    Configure OpenTelemetry + Arize Phoenix tracing.
    LlamaIndex instrumentation is automatic once the provider is set.
    """
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from openinference.instrumentation.llama_index import LlamaIndexInstrumentor
        from src.core.config import get_settings

        settings = get_settings()

        provider = TracerProvider()
        exporter = OTLPSpanExporter(
            endpoint=settings.phoenix_endpoint,
            insecure=True,
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Auto-instrument LlamaIndex — captures every query, embedding, LLM call
        LlamaIndexInstrumentor().instrument()

        log.info("tracing_initialized",
                 exporter="arize_phoenix",
                 endpoint=settings.phoenix_endpoint)

    except Exception as exc:
        # Non-fatal — tracing is optional observability
        log.warning("tracing_setup_failed", error=str(exc),
                    hint="Ensure Phoenix container is running at PHOENIX_ENDPOINT")
