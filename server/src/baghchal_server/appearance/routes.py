from fastapi import APIRouter

from baghchal_server.appearance import service
from baghchal_server.appearance.schemas import AppearanceIn, AppearanceOut
from baghchal_server.deps import DB, CurrentUser, State

router = APIRouter(prefix="/api/v1")


@router.get("/me/appearance")
async def my_appearance(user: CurrentUser, state: State, db: DB) -> AppearanceOut:
    """My board, pieces and sounds, whether game sounds play, and whether others see my badge."""
    return await service.mine(db, user.id, state.clock())


@router.patch("/me/appearance")
async def choose_appearance(
    data: AppearanceIn, user: CurrentUser, state: State, db: DB
) -> AppearanceOut:
    """Change my board, pieces or sounds (beyond the first of each: Plus and Pro), whether game
    sounds play, or whether to show my badge; what is left out stays as it was."""
    return await service.choose(db, user.id, state.clock(), data)
