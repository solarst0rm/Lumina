"""Gunicorn configuration for Docker deployments."""

from __future__ import annotations

import os


bind = f"{os.environ.get('HOST', '0.0.0.0')}:{os.environ.get('PORT', '7860')}"
workers = int(os.environ.get("WEB_CONCURRENCY", "1"))
threads = int(os.environ.get("WEB_THREADS", "1"))
timeout = int(os.environ.get("WEB_TIMEOUT", "300"))

accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info")

