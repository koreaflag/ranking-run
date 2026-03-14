"""Push notification service using Firebase Cloud Messaging + in-app inbox."""

import logging
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.config import Settings
from app.models.device_token import DeviceToken
from app.models.notification import Notification
from app.models.user import User

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
    # In-app notification inbox
    # ------------------------------------------------------------------

    async def create_and_send(
        self,
        db: AsyncSession,
        user_id: UUID,
        notification_type: str,
        actor_id: UUID,
        title: str,
        body: str,
        target_id: str | None = None,
        target_type: str | None = None,
        data: dict | None = None,
    ) -> None:
        """Persist an in-app notification AND send a push notification."""
        notif = Notification(
            user_id=user_id,
            type=notification_type,
            actor_id=actor_id,
            target_id=target_id,
            target_type=target_type,
            data=data,
        )
        db.add(notif)
        await db.flush()

        push_data = {"type": notification_type}
        if target_id:
            push_data["target_id"] = target_id
        if target_type:
            push_data["target_type"] = target_type

        try:
            await self.send_to_user(db, user_id, title, body, push_data)
        except Exception:
            logger.warning(
                "Push failed for notification %s to user %s",
                notification_type,
                user_id,
            )

    async def get_notifications(
        self,
        db: AsyncSession,
        user_id: UUID,
        page: int = 0,
        per_page: int = 20,
    ) -> tuple[list[dict], int, int]:
        """Return (items, total_count, unread_count) for user's inbox."""
        Actor = aliased(User)

        # Total count
        count_result = await db.execute(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == user_id
            )
        )
        total_count = count_result.scalar_one()

        # Unread count
        unread_count = await self.get_unread_count(db, user_id)

        # Items with actor join
        result = await db.execute(
            select(Notification, Actor.nickname, Actor.avatar_url)
            .join(Actor, Notification.actor_id == Actor.id)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .offset(page * per_page)
            .limit(per_page)
        )

        items = []
        for notif, actor_nickname, actor_avatar in result.all():
            items.append({
                "id": str(notif.id),
                "type": notif.type,
                "actor": {
                    "id": str(notif.actor_id),
                    "nickname": actor_nickname,
                    "avatar_url": actor_avatar,
                },
                "target_id": notif.target_id,
                "target_type": notif.target_type,
                "data": notif.data,
                "is_read": notif.is_read,
                "created_at": notif.created_at,
            })

        return items, total_count, unread_count

    async def get_unread_count(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> int:
        result = await db.execute(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == user_id,
                Notification.is_read == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    async def mark_as_read(
        self,
        db: AsyncSession,
        notification_id: UUID,
        user_id: UUID,
    ) -> None:
        await db.execute(
            update(Notification)
            .where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
            .values(is_read=True)
        )
        await db.flush()

    async def mark_all_as_read(
        self,
        db: AsyncSession,
        user_id: UUID,
    ) -> None:
        await db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read == False,  # noqa: E712
            )
            .values(is_read=True)
        )
        await db.flush()

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
