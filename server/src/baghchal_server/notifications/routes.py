from fastapi import APIRouter, status

from baghchal_server.deps import DB, CurrentUser, State
from baghchal_server.notifications import service
from baghchal_server.notifications.schemas import NotificationList

router = APIRouter(prefix="/api/v1")


@router.get("/notifications")
async def notifications(user: CurrentUser, db: DB) -> NotificationList:
    """My latest notifications, newest first, and how many are unread."""
    return await service.mine(db, user.id)


@router.post("/notifications/read", status_code=status.HTTP_204_NO_CONTENT)
async def read_notifications(user: CurrentUser, state: State, db: DB) -> None:
    """Mark them all read."""
    await service.read_all(db, user.id, state.clock())
