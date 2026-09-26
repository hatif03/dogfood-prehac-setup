from __future__ import annotations

import logging
import threading
import time

from fastapi import HTTPException

from app.config import settings

log = logging.getLogger(__name__)

_memory: dict[str, tuple[int, float]] = {}
_lock = threading.Lock()
_redis = None


def _client():
    global _redis
    if not settings.redis_url:
        return None
    if _redis is None:
        try:
            import redis

            _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=1)
            _redis.ping()
        except Exception as exc:  # noqa: BLE001
            log.warning("redis unavailable: %s", exc)
            _redis = False
    return None if _redis is False else _redis


def allow(key: str, limit: int, window_seconds: int) -> bool:
    """Fixed-window counter. Redis when configured (fails closed if it is down), else in-process."""
    r = _client()
    if r is not None:
        try:
            n = r.incr(f"rl:{key}")
            if n == 1:
                r.expire(f"rl:{key}", window_seconds)
            return n <= limit
        except Exception as exc:  # noqa: BLE001
            log.warning("rate limit check failed closed: %s", exc)
            return False
    if settings.redis_url:
        return False
    t = time.monotonic()
    with _lock:
        count, reset = _memory.get(key, (0, t + window_seconds))
        if t > reset:
            count, reset = 0, t + window_seconds
        _memory[key] = (count + 1, reset)
    return count + 1 <= limit


def enforce(key: str, limit: int, window_seconds: int = 60) -> None:
    if not allow(key, limit, window_seconds):
        raise HTTPException(429, "Too many requests. Slow down and try again in a minute.")


def reset() -> None:
    with _lock:
        _memory.clear()
