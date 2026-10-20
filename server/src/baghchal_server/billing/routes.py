import uuid

from fastapi import APIRouter, BackgroundTasks

from baghchal_server.admin_check import Admin
from baghchal_server.billing import service
from baghchal_server.billing.plans import ANALYSES_PER_DAY, FEATURES, GAMES, NAMES, PRICES, Plan
from baghchal_server.billing.schemas import (
    GrantIn,
    GrantOut,
    MyPlanOut,
    PlanInfo,
    PlayerPlanOut,
    RevokeIn,
)
from baghchal_server.deps import DB, CurrentUser, State
from baghchal_server.lobby.schemas import UsernameQuery
from baghchal_server.mail import deliver
from baghchal_server.moderation.service import find_any

router = APIRouter(prefix="/api/v1")


@router.get("/plans")
async def plans() -> list[PlanInfo]:
    """What each plan includes and costs."""
    return [
        PlanInfo(
            plan=plan,
            name=NAMES[plan],
            features=sorted(FEATURES[plan]),
            monthly_paise=PRICES[plan].monthly_paise if plan in PRICES else None,
            yearly_paise=PRICES[plan].yearly_paise if plan in PRICES else None,
            games=GAMES[plan],
            analyses_per_day=ANALYSES_PER_DAY[plan],
        )
        for plan in Plan
    ]


@router.get("/me/plan")
async def my_plan(user: CurrentUser, state: State, db: DB) -> MyPlanOut:
    """My plan, what I can use, and the grants behind it."""
    return await service.my_plan(db, user.id, state.clock())


# ── For admins ────────────────────────────────────────────────────────────


@router.get("/admin/players/{username}/plan")
async def player_plan(username: UsernameQuery, _: Admin, state: State, db: DB) -> PlayerPlanOut:
    return await service.player_plan(db, await find_any(db, username), state.clock())


@router.post("/admin/players/{username}/grants", status_code=201)
async def grant(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    username: UsernameQuery,
    data: GrantIn,
    admin: Admin,
    state: State,
    db: DB,
    tasks: BackgroundTasks,
) -> GrantOut:
    """Give a player a plan or a single feature, for ``days`` or until revoked."""
    out, mail = await service.grant(db, state.clock(), admin, await find_any(db, username), data)
    tasks.add_task(deliver, state.mailer, mail)
    return out


@router.post("/admin/grants/{grant_id}/revoke")
async def revoke(  # noqa: PLR0913, PLR0917 - FastAPI dependencies
    grant_id: uuid.UUID, data: RevokeIn, admin: Admin, state: State, db: DB, tasks: BackgroundTasks
) -> GrantOut:
    out, mail = await service.revoke(db, state.clock(), admin, grant_id, data.reason)
    tasks.add_task(deliver, state.mailer, mail)
    return out
