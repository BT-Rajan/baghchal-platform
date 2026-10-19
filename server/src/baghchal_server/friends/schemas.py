from typing import Literal

from pydantic import BaseModel

from baghchal_server.lobby.schemas import PlayerOut, PlayerStatusOut

Relation = Literal["none", "friends", "requested", "incoming"]
"""How the viewer stands with a player: friends, a request sent (``requested``) or received
(``incoming``), or none."""


class FriendsOut(BaseModel):
    friends: list[PlayerStatusOut]
    """Online first, then by name."""
    incoming: list[PlayerOut]
    """Requests to me, waiting for my answer."""
    outgoing: list[PlayerOut]
    """My requests, waiting for theirs."""


class RelationOut(BaseModel):
    relation: Relation
