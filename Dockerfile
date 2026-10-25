# The CAD service (FastAPI + cadquery) as one container, for hosts like Render or Fly. Vercel proxies /geometry/* to it.
FROM python:3.12-slim

# OpenCascade needs these system libraries at import time.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglu1-mesa libxrender1 libxext6 libsm6 libx11-6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Model generation shells out to node (scripts/generate-model.mjs).
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

# scripts/generate-model.mjs calls .venv/bin/python; point it at this image's python.
RUN mkdir -p .venv/bin && ln -s /usr/local/bin/python .venv/bin/python

COPY server server
COPY scripts scripts
COPY data/parts.json data/parts.json
COPY public/generated public/generated
COPY public/parts public/parts

# CLAUDE_API_KEY (or ANTHROPIC_API_KEY) must be set on the host for new-model generation.
ENV PORT=8001
EXPOSE 8001
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT}"]
