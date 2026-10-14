FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
# One uid for every service so the shared /data/jobs volume is writable by api, worker and sweeper.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /tmp --no-create-home app \
 && mkdir -p /data/jobs && chown app:app /data/jobs
WORKDIR /srv
COPY requirements-api.txt ./
RUN pip install -r requirements-api.txt

FROM base AS api
COPY pdftools ./pdftools
USER app
EXPOSE 8000
CMD ["uvicorn", "pdftools.api:build_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS worker
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress ghostscript \
      fonts-dejavu fonts-liberation fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*
COPY requirements-worker.txt ./
RUN pip install -r requirements-worker.txt
COPY pdftools ./pdftools
ENV HOME=/tmp
USER app
CMD ["python", "-m", "pdftools.worker"]

FROM worker AS test
USER root
COPY requirements-dev.txt pyproject.toml ./
RUN pip install -r requirements-dev.txt
COPY tests ./tests
USER app
CMD ["python", "-m", "pytest", "-q"]
