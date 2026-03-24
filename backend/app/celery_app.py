"""Celery application configuration with Redis broker."""

import os

from celery import Celery

# Redis URL from environment variable (matches docker-compose service name)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

app = Celery(
    "runvs",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# Alias for imports elsewhere
celery_app = app

app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    # Timezone
    timezone="UTC",
    enable_utc=True,
    # Task behavior
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Result expiration (24 hours)
    result_expires=86400,
)

# Explicitly include task modules so they register with this app
app.conf.include = ["app.tasks.celery_tasks"]
