"""Role isolation (FIG.02). Every read and write of judging data goes through an Actor.

    Visitor / participant : no scores at all            -> 401 / 403
    Judge                 : own reviews, own tracks only -> peer = 403, peer object by id = 404
    Organizer / admin     : everything in their event
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from fastapi import HTTPException, status

from app.models import Event, User

ORGANIZER_ROLES = frozenset({"organizer", "admin"})


@dataclass(frozen=True)
class Actor:
    event: Event
    user: User | None
    role: str  # visitor | participant | judge | organizer | admin
    track_ids: frozenset[uuid.UUID] = field(default_factory=frozenset)
    team_id: uuid.UUID | None = None

    @property
    def is_organizer(self) -> bool:
        return self.role in ORGANIZER_ROLES

    @property
    def is_judge(self) -> bool:
        return self.role == "judge"

    def require_login(self) -> User:
        if self.user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required")
        return self.user

    def require_organizer(self) -> User:
        user = self.require_login()
        if not self.is_organizer:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Organizer or admin role required")
        return user

    def require_judge(self) -> User:
        user = self.require_login()
        if not self.is_judge:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Judge role required")
        return user

    def require_score_reader(self) -> User:
        """Judges and organizers only. Participants are not judges, whatever the UI shows."""
        user = self.require_login()
        if not (self.is_judge or self.is_organizer):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only judges and organizers can read scores")
        return user

    def may_read_judge(self, judge_id: uuid.UUID) -> bool:
        return self.is_organizer or (self.is_judge and self.user is not None and self.user.id == judge_id)

    def sees_track(self, track_id: uuid.UUID | None) -> bool:
        return self.is_organizer or not self.track_ids or track_id in self.track_ids
