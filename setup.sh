#!/bin/bash
# ============================================================
# DocuFinder v2 — Local Development Setup Script (using uv)
# ============================================================
# This script sets up the complete DocuFinder dev environment.
# Uses uv for 10-100x faster Python dependency installation.
# Run from the project root: ./setup.sh
# ============================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}▸ $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "pyproject.toml" ]; then
    print_error "Please run this script from the DocuFinder project root directory"
    exit 1
fi

PROJECT_ROOT=$(pwd)

# ────────────────────────────────────────────────────────────────
# Step 1: Install uv (ultra-fast Python package manager)
# ────────────────────────────────────────────────────────────────
print_step "Step 1/10: Installing uv package manager"

if command -v uv &> /dev/null; then
    print_warning "uv already installed: $(uv --version)"
else
    print_success "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # Add to current shell
    export PATH="$HOME/.local/bin:$PATH"
    if command -v uv &> /dev/null; then
        print_success "uv installed: $(uv --version)"
    else
        print_error "Failed to install uv. Install manually: curl -LsSf https://astral.sh/uv/install.sh | sh"
        exit 1
    fi
fi

# ────────────────────────────────────────────────────────────────
# Step 2: Create venv and install dependencies with uv
# ────────────────────────────────────────────────────────────────
print_step "Step 2/10: Creating venv and installing dependencies (using uv)"

# uv sync creates venv and installs all dependencies in one fast step
uv sync --dev
print_success "Dependencies installed with uv (10-100x faster than pip!)"

# ────────────────────────────────────────────────────────────────
# Step 3: Configure environment variables
# ────────────────────────────────────────────────────────────────
print_step "Step 3/10: Configuring environment variables"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_warning ".env created from .env.example — please configure QDRANT_URL, QDRANT_API_KEY, JWT_SECRET_KEY, HF_TOKEN"
    else
        print_error ".env.example not found. Please create .env manually."
        exit 1
    fi
else
    print_success ".env file exists"
fi

# Load environment variables from .env
set -a
source .env
set +a
print_success "Environment variables loaded from .env"

# Verify critical variables
if [ -z "$QDRANT_URL" ] || [ "$QDRANT_URL" = "https://your-cluster.qdrant.io:6333" ]; then
    print_warning "QDRANT_URL not configured in .env"
fi

if [ -z "$HF_TOKEN" ] || [ "$HF_TOKEN" = "your_huggingface_token" ]; then
    print_warning "HF_TOKEN not configured in .env — embedding model downloads may fail"
fi

# ────────────────────────────────────────────────────────────────
# Step 4: Create upload directories
# ────────────────────────────────────────────────────────────────
print_step "Step 4/10: Creating upload directories"

mkdir -p /tmp/docufinder/uploads
mkdir -p /tmp/docufinder/watch_root
mkdir -p /tmp/docufinder-mongo
print_success "Directories created"

# ────────────────────────────────────────────────────────────────
# Step 5: Start MongoDB
# ────────────────────────────────────────────────────────────────
print_step "Step 5/10: Starting MongoDB"

if pgrep -x "mongod" > /dev/null; then
    print_warning "MongoDB is already running"
else
    if command -v mongod &> /dev/null; then
        mongod --dbpath /tmp/docufinder-mongo --port 27017 --fork --logpath /tmp/docufinder-mongo/mongod.log
        sleep 2
        if pgrep -x "mongod" > /dev/null; then
            print_success "MongoDB started on port 27017"
        else
            print_error "MongoDB failed to start. Check /tmp/docufinder-mongo/mongod.log"
        fi
    else
        print_error "MongoDB not installed. Install with: brew install mongodb-community"
        print_warning "Continuing without MongoDB..."
    fi
fi

# ────────────────────────────────────────────────────────────────
# Step 6: Start Valkey (Redis-compatible broker)
# ────────────────────────────────────────────────────────────────
print_step "Step 6/10: Starting Valkey (Redis broker)"

if docker ps --format '{{.Names}}' | grep -q '^valkey$'; then
    print_warning "Valkey container is already running"
elif docker ps -a --format '{{.Names}}' | grep -q '^valkey$'; then
    docker start valkey
    print_success "Valkey container started"
else
    if command -v docker &> /dev/null; then
        docker run -d --name valkey -p 6379:6379 valkey/valkey:8-alpine
        sleep 2
        print_success "Valkey started on port 6379"
    else
        print_error "Docker not installed. Valkey requires Docker."
        print_warning "Continuing without Valkey..."
    fi
fi

# ────────────────────────────────────────────────────────────────
# Step 7: Start Ollama
# ────────────────────────────────────────────────────────────────
print_step "Step 7/10: Starting Ollama"

if pgrep -x "ollama" > /dev/null || curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    print_warning "Ollama is already running"
else
    if command -v ollama &> /dev/null; then
        ollama serve > /tmp/ollama.log 2>&1 &
        sleep 3
        print_success "Ollama started"
    else
        print_error "Ollama not installed. Install with: brew install ollama"
        print_warning "Continuing without Ollama..."
    fi
fi

# Pull the configured model if not already present
if command -v ollama &> /dev/null; then
    OLLAMA_MODEL=${OLLAMA_MODEL:-gemma4:31b-cloud}
    if ! ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
        print_warning "Pulling Ollama model: $OLLAMA_MODEL (this may take a while...)"
        ollama pull "$OLLAMA_MODEL" || print_warning "Failed to pull model $OLLAMA_MODEL"
    else
        print_success "Model $OLLAMA_MODEL already available"
    fi
fi

# ────────────────────────────────────────────────────────────────
# Step 8: Install liteparse (PDF parser)
# ────────────────────────────────────────────────────────────────
print_step "Step 8/10: Installing liteparse (PDF parser)"

if command -v liteparse &> /dev/null; then
    print_warning "liteparse already installed"
else
    if command -v npm &> /dev/null; then
        npm install -g @llamaindex/liteparse 2>/dev/null || sudo npm install -g @llamaindex/liteparse
        print_success "liteparse installed"
    else
        print_error "npm not installed. Install Node.js first."
        print_warning "Continuing without liteparse..."
    fi
fi

# ────────────────────────────────────────────────────────────────
# Step 9: Initialize Qdrant collection
# ────────────────────────────────────────────────────────────────
print_step "Step 9/10: Initializing Qdrant collection"

if [ -n "$QDRANT_URL" ] && [ "$QDRANT_URL" != "https://your-cluster.qdrant.io:6333" ]; then
    uv run python scripts/init_qdrant.py
    print_success "Qdrant collection initialized"
else
    print_warning "Skipping Qdrant init — QDRANT_URL not configured"
fi

# ────────────────────────────────────────────────────────────────
# Step 10: Summary and next steps
# ────────────────────────────────────────────────────────────────
print_step "Setup Complete! 🎉"

echo -e "${GREEN}All services are ready. Here's how to start the application:${NC}\n"

echo -e "${YELLOW}Terminal 1 — API Server:${NC}"
echo -e "  uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8001 --reload\n"

echo -e "${YELLOW}Terminal 2 — Celery Worker:${NC}"
echo -e "  uv run celery -A src.ingestion.tasks worker --loglevel=info -Q ingest,default\n"

echo -e "${YELLOW}Terminal 3 — Frontend (optional):${NC}"
echo -e "  cd frontend && npm install && npm run dev\n"

echo -e "${GREEN}API Docs:${NC} http://localhost:8001/docs"
echo -e "$\{GREEN\}Frontend:$\{NC\} http://localhost:3000"
echo -e "$\{GREEN\}Metrics:$\{NC\}  http://localhost:8001/metrics\n"

echo -e "$\{BLUE\}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$\{NC\}"
echo -e "$\{YELLOW\}Quick Start (run in this terminal):${NC}"
echo -e "  uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8001 --reload"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
