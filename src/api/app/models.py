from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON as GenericJSON


class Base(DeclarativeBase):
    type_annotation_map = {dict: GenericJSON, list: GenericJSON}


def uid() -> uuid.UUID:
    return uuid.uuid4()


def utcnow() -> datetime:
    return datetime.now(UTC)


class RoleName(str, Enum):
    participant = "participant"
    judge = "judge"
    organizer = "organizer"
    admin = "admin"


class JudgingMode(str, Enum):
    rubric = "rubric"
    pairwise = "pairwise"


class VotingAccess(str, Enum):
    open = "open"
    authenticated = "authenticated"
    email_gated = "email_gated"
    link = "link"


class VoteMode(str, Enum):
    one_person_one_vote = "one_person_one_vote"
    quadratic = "quadratic"


class SubmissionStatus(str, Enum):
    draft = "draft"
    submitted = "submitted"
    withdrawn = "withdrawn"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200))
    # "!" = unclaimed account (imported); cannot log in until claimed through an emailed invite.
    password_hash: Mapped[str] = mapped_column(String(255))
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    external_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    roles: Mapped[list[EventRole]] = relationship(back_populates="user")


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(40), default="login")  # login | demo
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    external_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(200))
    tagline: Mapped[str] = mapped_column(String(280), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submissions_open_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submissions_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    judging_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voting_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voting_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    results_published: Mapped[bool] = mapped_column(Boolean, default=False)
    # FIG.01 stage 10: an archived event is read-only for everyone, forever queryable and exportable.
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    judging_mode: Mapped[str] = mapped_column(String(20), default=JudgingMode.rubric.value)
    voting_access: Mapped[str] = mapped_column(String(30), default=VotingAccess.authenticated.value)
    vote_mode: Mapped[str] = mapped_column(String(30), default=VoteMode.one_person_one_vote.value)
    reviews_per_project: Mapped[int] = mapped_column(Integer, default=3)
    quadratic_budget: Mapped[int] = mapped_column(Integer, default=25)
    max_team_size: Mapped[int] = mapped_column(Integer, default=4)
    require_verified_email: Mapped[bool] = mapped_column(Boolean, default=True)
    widget_token: Mapped[str] = mapped_column(String(64), unique=True, default=lambda: uuid.uuid4().hex)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    tracks: Mapped[list[Track]] = relationship(back_populates="event", order_by="Track.name")
    prizes: Mapped[list[Prize]] = relationship(back_populates="event", order_by="Prize.sort_order")
    questions: Mapped[list[CustomQuestion]] = relationship(back_populates="event", order_by="CustomQuestion.sort_order")
    rubric: Mapped[Rubric | None] = relationship(back_populates="event", uselist=False)


class EventRole(Base):
    """Exactly one role per (event, user): a judge can never also be a participant."""

    __tablename__ = "event_roles"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_user_role"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(20), index=True)

    user: Mapped[User] = relationship(back_populates="roles")
    judge_tracks: Mapped[list[JudgeTrack]] = relationship(cascade="all, delete-orphan")


class JudgeTrack(Base):
    """Judges may cover several tracks. No rows = judge sees every track."""

    __tablename__ = "judge_tracks"
    __table_args__ = (UniqueConstraint("role_id", "track_id", name="uq_judge_track"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("event_roles.id"), index=True)
    track_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tracks.id"))


class Track(Base):
    __tablename__ = "tracks"
    __table_args__ = (UniqueConstraint("event_id", "slug", name="uq_event_track_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    external_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    slug: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")

    event: Mapped[Event] = relationship(back_populates="tracks")


class Prize(Base):
    __tablename__ = "prizes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    track_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tracks.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    event: Mapped[Event] = relationship(back_populates="prizes")


class CustomQuestion(Base):
    __tablename__ = "custom_questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    event: Mapped[Event] = relationship(back_populates="questions")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    external_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    memberships: Mapped[list[Membership]] = relationship(back_populates="team", order_by="Membership.joined_at", lazy="selectin")
    invites: Mapped[list[InviteLink]] = relationship(back_populates="team")


class Membership(Base):
    """One team per person per event, as a database guarantee: concurrent joins cannot double up."""

    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_user"),
        UniqueConstraint("event_id", "user_id", name="uq_event_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    is_captain: Mapped[bool] = mapped_column(Boolean, default=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    team: Mapped[Team] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(lazy="selectin")


class InviteLink(Base):
    __tablename__ = "invite_links"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    team: Mapped[Team] = relationship(back_populates="invites")


class Submission(Base):
    """A team normally has one live submission; imported duplicates are kept and flagged, not dropped."""

    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    team_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("teams.id"), index=True)
    track_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tracks.id"), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=SubmissionStatus.draft.value, index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    summary: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    demo_video_url: Mapped[str] = mapped_column(String(500), default="")
    repo_url: Mapped[str] = mapped_column(String(500), default="")
    live_link: Mapped[str] = mapped_column(String(500), default="")
    tech_tags: Mapped[list] = mapped_column(GenericJSON, default=list)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # selectin: gallery, results and exports touch these for every row; one batched query each, never N.
    team: Mapped[Team] = relationship(lazy="selectin")
    track: Mapped[Track | None] = relationship(lazy="selectin")
    assets: Mapped[list[SubmissionAsset]] = relationship(back_populates="submission", lazy="selectin")
    answers: Mapped[list[CustomAnswer]] = relationship(back_populates="submission")
    flags: Mapped[list[EligibilityFlag]] = relationship(
        back_populates="submission", foreign_keys="EligibilityFlag.submission_id", lazy="selectin"
    )


class SubmissionAsset(Base):
    __tablename__ = "submission_assets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # thumbnail | gallery
    object_key: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")

    submission: Mapped[Submission] = relationship(back_populates="assets")


class CustomAnswer(Base):
    __tablename__ = "custom_answers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("custom_questions.id"))
    body: Mapped[str] = mapped_column(Text, default="")

    submission: Mapped[Submission] = relationship(back_populates="answers")


class EligibilityFlag(Base):
    __tablename__ = "eligibility_flags"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    code: Mapped[str] = mapped_column(String(40))  # duplicate | ineligible | other
    reason: Mapped[str] = mapped_column(Text, default="")
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("submissions.id"), nullable=True)
    blocks_judging: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    submission: Mapped[Submission] = relationship(back_populates="flags", foreign_keys=[submission_id])


class Rubric(Base):
    __tablename__ = "rubrics"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), unique=True)
    name: Mapped[str] = mapped_column(String(200), default="Default rubric")
    scale_min: Mapped[int] = mapped_column(Integer, default=1)
    scale_max: Mapped[int] = mapped_column(Integer, default=5)

    event: Mapped[Event] = relationship(back_populates="rubric")
    criteria: Mapped[list[Criterion]] = relationship(back_populates="rubric", order_by="Criterion.sort_order")


class Criterion(Base):
    __tablename__ = "criteria"
    __table_args__ = (UniqueConstraint("rubric_id", "key", name="uq_rubric_criterion_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    rubric_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rubrics.id"), index=True)
    key: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[float] = mapped_column(Float)  # normalized so a rubric's weights sum to 1
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    rubric: Mapped[Rubric] = relationship(back_populates="criteria")


class JudgeInvite(Base):
    __tablename__ = "judge_invites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    email: Mapped[str] = mapped_column(String(320))
    token: Mapped[str] = mapped_column(String(64), unique=True)
    track_ids: Mapped[list] = mapped_column(GenericJSON, default=list)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AssignmentBatch(Base):
    __tablename__ = "assignment_batches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="generated")  # generated | top_up | imported
    reviews_per_project: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    assignments: Mapped[list[Assignment]] = relationship(back_populates="batch")


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("event_id", "judge_id", "submission_id", name="uq_event_judge_project"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignment_batches.id"), index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    judge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    batch: Mapped[AssignmentBatch] = relationship(back_populates="assignments")
    submission: Mapped[Submission] = relationship(lazy="selectin")


class Score(Base):
    """One review = one judge's scores for one project. Cells hold per-criterion values."""

    __tablename__ = "scores"
    __table_args__ = (UniqueConstraint("judge_id", "submission_id", name="uq_judge_submission_score"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id"), index=True)
    judge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    raw_weighted: Mapped[float | None] = mapped_column(Float, nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    cells: Mapped[list[ScoreCell]] = relationship(back_populates="score", cascade="all, delete-orphan", lazy="selectin")
    judge: Mapped[User] = relationship(lazy="selectin")
    submission: Mapped[Submission] = relationship(lazy="selectin")


class ScoreCell(Base):
    __tablename__ = "score_cells"
    __table_args__ = (UniqueConstraint("score_id", "criterion_id", name="uq_score_criterion"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    score_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scores.id"), index=True)
    criterion_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("criteria.id"))
    value: Mapped[float] = mapped_column(Float)

    score: Mapped[Score] = relationship(back_populates="cells")


class NormalizationRun(Base):
    __tablename__ = "normalization_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    method: Mapped[str] = mapped_column(String(80))
    params: Mapped[dict] = mapped_column(GenericJSON, default=dict)
    notes: Mapped[dict] = mapped_column(GenericJSON, default=dict)  # judge offsets, flags, diagnostics
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    rows: Mapped[list[NormalizedScore]] = relationship(back_populates="run", order_by="NormalizedScore.rank")


class NormalizedScore(Base):
    __tablename__ = "normalized_scores"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("normalization_runs.id"), index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    n_reviews: Mapped[int] = mapped_column(Integer)
    raw_mean: Mapped[float] = mapped_column(Float)
    adjusted: Mapped[float] = mapped_column(Float)
    std_error: Mapped[float] = mapped_column(Float)
    raw_rank: Mapped[int] = mapped_column(Integer)
    rank: Mapped[int] = mapped_column(Integer)
    rank_delta: Mapped[int] = mapped_column(Integer)  # raw_rank - rank; positive = moved up

    run: Mapped[NormalizationRun] = relationship(back_populates="rows")


class Ballot(Base):
    """One per voter per event. voter_key is canonical (user id, normalized email, or link token)."""

    __tablename__ = "ballots"
    __table_args__ = (UniqueConstraint("event_id", "voter_key", name="uq_event_voter"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    voter_key: Mapped[str] = mapped_column(String(200))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    order: Mapped[list] = mapped_column(GenericJSON, default=list)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    ip_hash: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("ballot_id", "submission_id", name="uq_ballot_project"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    ballot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ballots.id"), index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    units: Mapped[int] = mapped_column(Integer, default=1)  # quadratic votes; cost = units²
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    author: Mapped[User] = relationship(lazy="selectin")


class PairwiseComparison(Base):
    __tablename__ = "pairwise_comparisons"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    judge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    winner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    loser_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("submissions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PairwiseRun(Base):
    __tablename__ = "pairwise_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    method: Mapped[str] = mapped_column(String(80), default="bradley_terry_mm")
    params: Mapped[dict] = mapped_column(GenericJSON, default=dict)
    ranking: Mapped[list] = mapped_column(GenericJSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ApiKey(Base):
    """Acts as the organizer who minted it, scoped to one event."""

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(120))
    prefix: Mapped[str] = mapped_column(String(16), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Webhook(Base):
    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    secret: Mapped[str] = mapped_column(String(64))
    actions: Mapped[list] = mapped_column(GenericJSON, default=list)  # empty = all
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    webhook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("webhooks.id"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(GenericJSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|delivered|failed
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SignedRecord(Base):
    """Certificates and judge participation records. Ed25519 over canonical JSON of `payload`."""

    __tablename__ = "signed_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))  # judge | participant | winner
    payload: Mapped[dict] = mapped_column(GenericJSON)
    signature: Mapped[str] = mapped_column(Text)
    key_id: Mapped[str] = mapped_column(String(64))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="done")
    stats: Mapped[dict] = mapped_column(GenericJSON, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    """Append-only, hash-chained: hash = sha256(prev_hash || canonical row). Editing any row breaks the chain."""

    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uid)
    seq: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    actor_name: Mapped[str] = mapped_column(String(200), default="system")
    action: Mapped[str] = mapped_column(String(80), index=True)
    resource: Mapped[str] = mapped_column(String(200), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    ip_hash: Mapped[str] = mapped_column(String(64), default="")
    payload: Mapped[dict] = mapped_column(GenericJSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
