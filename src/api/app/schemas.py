from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, AliasChoices, BaseModel, Field, HttpUrl, field_validator

Role = Literal["participant", "judge", "organizer", "admin"]


def _email(v: str) -> str:
    # Deliberately permissive: self-hosted events use internal domains (.local, .internal) that
    # strict validators reject. Deliverability is proven by the emailed links, not by syntax.
    v = v.strip().lower()
    if len(v) > 320 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
        raise ValueError("not a valid email address")
    return v


EmailStr = Annotated[str, AfterValidator(_email)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=200)
    website: str = Field(default="", max_length=200)  # honeypot; must stay empty


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    is_platform_admin: bool

    model_config = {"from_attributes": True}


class TrackIn(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class PrizeIn(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    track_id: uuid.UUID | None = None


class QuestionIn(BaseModel):
    id: uuid.UUID | None = None
    prompt: str = Field(min_length=1, max_length=5000)
    required: bool = False


class CriterionIn(BaseModel):
    id: uuid.UUID | None = None
    key: str | None = None
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    weight: float = Field(gt=0)


class RubricIn(BaseModel):
    scale_min: int = Field(default=1, ge=0)
    scale_max: int = Field(default=5, le=100)
    criteria: list[CriterionIn] = Field(min_length=1, max_length=20)


class EventFields(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    tagline: str | None = Field(default=None, max_length=280)
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    submissions_open_at: datetime | None = None
    submissions_deadline: datetime | None = None
    judging_deadline: datetime | None = None
    voting_opens_at: datetime | None = None
    voting_closes_at: datetime | None = None
    judging_mode: Literal["rubric", "pairwise"] | None = None
    voting_access: Literal["open", "authenticated", "email_gated", "link"] | None = None
    vote_mode: Literal["one_person_one_vote", "quadratic"] | None = None
    reviews_per_project: int | None = Field(default=None, ge=1, le=20)
    quadratic_budget: int | None = Field(default=None, ge=1, le=1000)
    max_team_size: int | None = Field(default=None, ge=1, le=20)
    require_verified_email: bool | None = None


class EventCreate(EventFields):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{1,78}$")
    tracks: list[TrackIn] = Field(default_factory=list)
    prizes: list[PrizeIn] = Field(default_factory=list)
    rubric: RubricIn | None = None


class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SubmissionIn(BaseModel):
    """Accepts the fixture vocabulary (title/summary); name/tagline are tolerated aliases."""

    title: str = Field(default="", max_length=200, validation_alias=AliasChoices("title", "name"))
    summary: str = Field(default="", max_length=500, validation_alias=AliasChoices("summary", "tagline"))
    description: str = Field(default="", max_length=20000)
    demo_video_url: str = Field(default="", max_length=500)
    repo_url: str = Field(default="", max_length=500)
    live_link: str = Field(default="", max_length=500)
    tech_tags: list[str] = Field(default_factory=list, max_length=20)
    track_id: uuid.UUID | None = None
    answers: list[dict] = Field(default_factory=list)

    @field_validator("demo_video_url", "repo_url", "live_link")
    @classmethod
    def _url(cls, v: str) -> str:
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("must start with http:// or https://")
        return v


class CellIn(BaseModel):
    criterion_id: uuid.UUID | None = None
    key: str | None = None
    value: float


class ScoreIn(BaseModel):
    cells: list[CellIn]
    comment: str = Field(default="", max_length=5000)
    submitted: bool = False


class RoleIn(BaseModel):
    user_email: EmailStr
    role: Role
    track_ids: list[uuid.UUID] = Field(default_factory=list)


class JudgeInviteIn(BaseModel):
    emails: list[EmailStr] = Field(min_length=1, max_length=200)
    track_ids: list[uuid.UUID] = Field(default_factory=list)


class InviteAcceptIn(BaseModel):
    password: str | None = Field(default=None, min_length=8, max_length=200)
    display_name: str | None = Field(default=None, max_length=200)


class AssignIn(BaseModel):
    reviews_per_project: int | None = Field(default=None, ge=1, le=20)


class NormalizeIn(BaseModel):
    lambda_judge: float = Field(default=2.0, gt=0, le=100)
    lambda_project: float = Field(default=1.0, gt=0, le=100)
    drop_constant_raters: bool = True


class PublishIn(BaseModel):
    published: bool = True


class ArchiveIn(BaseModel):
    archived: bool = True


class PairwiseIn(BaseModel):
    winner_id: uuid.UUID
    loser_id: uuid.UUID


class BallotIn(BaseModel):
    email: EmailStr | None = None
    link_token: str | None = None
    website: str = Field(default="", max_length=200)  # honeypot; must stay empty


class VoteIn(BaseModel):
    submission_id: uuid.UUID
    units: int = Field(default=1, ge=0, le=100)


class VoteLinksIn(BaseModel):
    count: int = Field(default=10, ge=1, le=500)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class WebhookIn(BaseModel):
    url: HttpUrl
    actions: list[str] = Field(default_factory=list)


class ApiKeyIn(BaseModel):
    name: str = Field(default="integration", max_length=120)


class RecordsIn(BaseModel):
    kind: Literal["judge", "participant", "winner"]
    user_emails: list[EmailStr] = Field(default_factory=list)  # empty = everyone eligible for this kind


class VerifyIn(BaseModel):
    payload: dict
    signature: str
