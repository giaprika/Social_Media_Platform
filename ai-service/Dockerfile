# AI Service Dockerfile - Content Moderation Agent
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port for ADK API server
EXPOSE 9000

# Environment variables (can be overridden)
ENV GOOGLE_API_KEY=""
ENV RABBITMQ_HOST="rabbitmq"
ENV RABBITMQ_PORT="5672"
ENV DB_HOST="postgres-ai"
ENV DB_PORT="5432"
ENV DB_NAME="ai_db"
ENV DB_USER="postgres"
ENV DB_PASSWORD="postgres"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

# Run ADK API server
CMD ["adk", "api_server", "--host", "0.0.0.0", "--port", "9000"]
