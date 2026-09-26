from __future__ import annotations

import io
import logging
import uuid

from app.config import settings

log = logging.getLogger(__name__)


def _client():
    from minio import Minio
    import urllib3

    http = urllib3.PoolManager(timeout=urllib3.Timeout(connect=1.0, read=2.0), retries=False)
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
        http_client=http,
    )


def ensure_bucket() -> None:
    if not settings.minio_endpoint:
        return
    try:
        client = _client()
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
    except Exception as exc:  # noqa: BLE001
        log.warning("minio bucket skipped: %s", exc)


def put_bytes(data: bytes, content_type: str, suffix: str = "bin") -> str:
    key = f"{uuid.uuid4().hex}.{suffix}"
    client = _client()
    client.put_object(
        settings.minio_bucket,
        key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return key


def get_bytes(key: str) -> bytes:
    client = _client()
    resp = client.get_object(settings.minio_bucket, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()
