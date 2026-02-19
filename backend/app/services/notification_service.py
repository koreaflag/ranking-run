"""Push notification service using Firebase Cloud Messaging."""

import logging
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.device_token import DeviceToken

logger = logging.getLogger(__name__)


class NotificationService:
    """Handles device token management and push notification sending."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._firebase_initialised = False

    # ------------------------------------------------------------------
    # Token CRUD
    # ------------------------------------------------------------------

    async def register_token(
        self,
        db: AsyncSession,
        user_id: UUID,
        device_token: str,
        platform: str,
    ) -> None:
        """Register or update a device token for push notifications.

        Uses an upsert strategy: remove any existing row that holds the same
        token (it may belong to a different user after a re-login), then insert
        a fresh row for the current user.
        """
        await db.execute(
            delete(DeviceToken).where(DeviceToken.device_token == device_token)
        )
        token = DeviceToken(
            user_id=user_id,
            device_token=device_token,
            platform=platform,
        )
        db.add(token)
        await db.flush()

    async def unregister_token(
        self,
        db: AsyncSession,
        device_token: str,
    ) -> None:
        """Remove a device token."""
        await db.execute(
            delete(DeviceToken).where(DeviceToken.device_token == device_token)
        )
        await db.flush()

    async def get_user_tokens(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> list[str]:
        """Get all device tokens for a user."""
        result = await db.execute(
            select(DeviceToken.device_token).where(DeviceToken.user_id == user_id)
        )
        return [row[0] for row in result.all()]

    # ------------------------------------------------------------------
    # Sending
    # ------------------------------------------------------------------

    async def send_to_user(
        self,
        db: AsyncSession,
        user_id: UUID,
        title: str,
        body: str,
        data: dict | None = None,
    ) -> int:
        """Send a push notification to all of a user's devices.

        Returns the number of notifications successfully sent.  Tokens that
        FCM reports as invalid are automatically removed.
        """
        tokens = await self.get_user_tokens(db, user_id)
        if not tokens:
            return 0

        sent = 0
        for token in tokens:
            success = await self._send_fcm(token, title, body, data)
            if success:
                sent += 1
            else:
                await self.unregister_token(db, token)

        return sent

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_firebase_app(self) -> None:
        """Lazily initialise the Firebase Admin SDK (once per process)."""
        if self._firebase_initialised:
            return

        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            cred = credentials.Certificate(self._settings.FCM_SERVICE_ACCOUNT_PATH)
            firebase_admin.initialize_app(cred)

        self._firebase_initialised = True

    async def _send_fcm(
        self,
        device_token: str,
        title: str,
        body: str,
        data: dict | None = None,
    ) -> bool:
        """Send a single FCM message. Returns True on success."""
        if not self._settings.FCM_SERVICE_ACCOUNT_PATH:
            logger.debug("FCM not configured, skipping push to %s...", device_token[:20])
            return True  # Pretend success when not configured

        try:
            from firebase_admin import messaging

            self._ensure_firebase_app()

            message = messaging.Message(
                notification=messaging.Notification(title=title, body=body),
                data=data or {},
                token=device_token,
            )

            messaging.send(message)
            return True
        except Exception as e:
            error_str = str(e)
            if any(code in error_str for code in ("NOT_FOUND", "INVALID_ARGUMENT", "UNREGISTERED")):
                logger.info("FCM token invalid, removing: %s...", device_token[:20])
                return False
            logger.exception("FCM send failed for token %s...", device_token[:20])
            return False
