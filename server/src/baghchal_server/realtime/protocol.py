"""Messages on the WebSocket. Every message is a JSON object with a ``type``.

Client to server: ``ping``, and ``probe`` (echoing the server's).
Server to client: ``hello`` (once, on connect), ``pong``, ``probe`` (answer at once with the
same ``id``: it measures the round trip, which is not charged to the player's clock),
``challenge`` (a challenge involving you was created or changed; match on ``challenge.id``),
``game`` (a game you play in started or changed: the full state; match on ``game.id`` and keep
the highest ``game.ply``), ``error``.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from baghchal_server.games.schemas import GameOut
from baghchal_server.lobby.schemas import ChallengeOut, PlayerOut


class Ping(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["ping"]


class Probe(BaseModel):
    """Sent by the server; the client echoes it back unchanged."""

    model_config = ConfigDict(extra="forbid")
    type: Literal["probe"] = "probe"
    id: Annotated[int, Field(ge=0, le=2**31)]


ClientMessage = Annotated[Ping | Probe, Field(discriminator="type")]
client_message: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)


class Hello(BaseModel):
    type: Literal["hello"] = "hello"
    user: PlayerOut


class Pong(BaseModel):
    type: Literal["pong"] = "pong"


class ChallengeEvent(BaseModel):
    type: Literal["challenge"] = "challenge"
    challenge: ChallengeOut


class GameEvent(BaseModel):
    type: Literal["game"] = "game"
    game: GameOut


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
