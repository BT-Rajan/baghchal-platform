from fastapi import APIRouter

from baghchal_server.appearance import service
from baghchal_server.appearance.schemas import AppearanceIn, AppearanceOut
from baghchal_server.deps import DB, CurrentUser, State

router = APIRouter(prefix="/api/v1")


@router.get("/me/appearance")
async def my_appearance(user: CurrentUser, state: State, db: DB) -> AppearanceOut:
    """My board, pieces and sounds, and whether others see my badge."""
    return await service.mine(db, user.id, state.clock())


@router.put("/me/appearance")
async def choose_appearance(
    data: AppearanceIn, user: CurrentUser, state: State, db: DB
) -> AppearanceOut:
    """Choose a board, pieces and sounds (beyond the first of each: Plus and Pro), and whether
    to show my badge."""
    return await service.choose(db, user.id, state.clock(), data)
