"""Messages on the WebSocket. Every message is a JSON object with a ``type``.

Client to server: ``ping``.
Server to client: ``hello`` (once, on connect), ``pong``, ``challenge`` (a challenge involving
you was created or changed; match on ``challenge.id``), ``error``.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, TypeAdapter

from baghchal_server.lobby.schemas import ChallengeOut, PlayerOut


class Ping(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["ping"]


ClientMessage = Ping
client_message: TypeAdapter[ClientMessage] = TypeAdapter(ClientMessage)


class Hello(BaseModel):
    type: Literal["hello"] = "hello"
    user: PlayerOut


class Pong(BaseModel):
    type: Literal["pong"] = "pong"


class ChallengeEvent(BaseModel):
    type: Literal["challenge"] = "challenge"
    challenge: ChallengeOut


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
