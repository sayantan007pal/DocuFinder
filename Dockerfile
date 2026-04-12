# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Base stage — Python 3.11 slim + system deps + Node.js 20 LTS
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# Install system dependencies + Node.js 20 LTS (required for LiteParse CLI)
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libmagic1 \
    poppler-utils \
    tesseract-ocr \
    # mongodump for backups
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS + LiteParse CLI
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @llamaindex/liteparse \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Verify installations
RUN python --version && node --version && npm --version

# Install uv (10-100x faster than pip)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first (better layer caching)
COPY pyproject.toml .

# Install dependencies with uv (much faster than pip)
RUN uv pip install --system -e .

COPY src/ src/
COPY scripts/ scripts/

# Create necessary directories
RUN mkdir -p /app/uploads /app/watch_root /app/backups

# ─────────────────────────────────────────────────────────────
# API server runs on port 8001
# ─────────────────────────────────────────────────────────────
EXPOSE 8001

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
