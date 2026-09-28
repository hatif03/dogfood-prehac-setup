"""Postgres schema upgrades via Alembic (SQLite tests still use create_all)."""

from pathlib import Path

from alembic import command
from alembic.config import Config

from app.config import settings


def upgrade_head() -> None:
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    command.upgrade(cfg, "head")
