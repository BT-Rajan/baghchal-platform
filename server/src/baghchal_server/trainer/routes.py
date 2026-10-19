from typing import Annotated, Final

from fastapi import APIRouter, Path

from baghchal_server.deps import DB, CurrentUser, State, enforce_limit
from baghchal_server.ratelimit import Limit
from baghchal_server.trainer import service
from baghchal_server.trainer.schemas import AnswerIn, AnswerOut, Kind, TrainerOut

router = APIRouter(prefix="/api/v1")

ANSWERS_PER_USER: Final = Limit("trainer-answer", 600, 3600)


@router.get("/trainer")
async def trainer(user: CurrentUser, state: State, db: DB, kind: Kind = Kind.OPENING) -> TrainerOut:
    """My next puzzle of this kind (Pro), and how I am doing."""
    return await service.next_puzzle(db, user.id, state.clock(), kind)


@router.post("/trainer/{puzzle_id}/answer")
async def answer(
    puzzle_id: Annotated[str, Path(pattern=r"^[a-z0-9]{1,8}$")],
    data: AnswerIn,
    user: CurrentUser,
    state: State,
    db: DB,
) -> AnswerOut:
    """Was this the best move? The answer says which was."""
    await enforce_limit(state, ANSWERS_PER_USER, str(user.id))
    return await service.answer(db, user.id, state.clock(), puzzle_id, data.move)
