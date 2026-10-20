FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/cache/huggingface \
    DATA_DIR=/data

RUN useradd --create-home app && mkdir -p /data /cache && chown app:app /data /cache

WORKDIR /srv
COPY requirements.txt .
# CPU-only torch wheels; falls back to PyPI for everything else.
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY app ./app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
