"""Sentry error tracking integration."""
import logging

logger = logging.getLogger(__name__)


def init_sentry(dsn: str, environment: str = "development") -> None:
    """Initialize Sentry SDK if DSN is provided."""
    if not dsn:
        logger.info("Sentry DSN not configured, skipping initialization")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            traces_sample_rate=0.1 if environment == "production" else 1.0,
            profiles_sample_rate=0.1 if environment == "production" else 0.0,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
            ],
            send_default_pii=False,
        )
        logger.info("Sentry initialized for environment: %s", environment)
    except ImportError:
        logger.warning("sentry-sdk not installed, skipping Sentry initialization")
