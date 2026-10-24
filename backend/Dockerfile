# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/cache/huggingface \
    DATA_DIR=/data

RUN useradd --create-home app && mkdir -p /data /cache && chown app:app /data /cache

WORKDIR /srv
COPY requirements.txt .
# CPU-only torch wheels; pip download cache is preserved between builds via BuildKit cache mount.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY app ./app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
