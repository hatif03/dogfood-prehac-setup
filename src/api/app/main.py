from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.config import settings
from app.database import SessionLocal, engine
from app.models import Base
from app.routers import auth, events, exports, integrations, judging, projects, votes
from app.seed import seed_if_empty
from app.signing import load_or_create_key
from app.storage import ensure_bucket
from app.webhooks import start_worker

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        if engine.dialect.name == "postgresql":
            # Several workers boot at once; one creates the schema and seeds, the rest wait.
            db.execute(text("SELECT pg_advisory_lock(4242)"))
        try:
            Base.metadata.create_all(bind=db.connection())
            db.commit()
            load_or_create_key()
            if settings.seed_on_boot:
                seed_if_empty(db)
        finally:
            if engine.dialect.name == "postgresql":
                db.execute(text("SELECT pg_advisory_unlock(4242)"))
                db.commit()
    ensure_bucket()
    stop = threading.Event()
    if settings.webhook_worker:
        start_worker(stop)
    yield
    stop.set()


app = FastAPI(
    title="Portal API",
    version="1.0.0",
    summary="Self-hosted hackathon submission and judging portal.",
    description=(
        "Every screen in the portal is a call to this API. Authenticate with the `portal_session` "
        "cookie (set by `/v1/auth/login`), `Authorization: Bearer <session token>`, or `X-API-Key` "
        "for integrations. Event paths accept a UUID or the event slug, e.g. `/v1/events/sample-hack-2026`. "
        "Role isolation is enforced here, not in the UI: judges read only their own scores, "
        "participants and visitors read none. See docs/API.md."
    ),
    license_info={"name": "MIT", "identifier": "MIT"},
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, events, projects, judging, votes, exports, integrations):
    app.include_router(r.router)
app.include_router(integrations.wellknown)


@app.exception_handler(IntegrityError)
def integrity_conflict(request: Request, exc: IntegrityError) -> JSONResponse:
    """Two requests raced for the same unique row (a ballot, a team seat, a review). The loser gets 409."""
    return JSONResponse(status_code=409, content={"detail": "That changed at the same moment somewhere else. Reload and try again."})


@app.exception_handler(OperationalError)
def transient_conflict(request: Request, exc: OperationalError) -> JSONResponse:
    """Deadlocks and serialization failures: the database rolled back one side; it is safe to retry."""
    if "deadlock" in str(exc).lower() or "could not serialize" in str(exc).lower():
        return JSONResponse(status_code=409, content={"detail": "Busy with a simultaneous change. Try again."})
    raise exc


@app.get("/health", tags=["Meta"], summary="Liveness")
def health():
    return {"ok": True}
