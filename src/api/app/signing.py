"""Ed25519 signing for certificates and judge participation records.

Signed message = canonical JSON of the payload (sorted keys, no whitespace, UTF-8).
Payloads hold only strings and integers so any JSON implementation reproduces the bytes.
"""

from __future__ import annotations

import base64
import hashlib
import json
import time
from functools import lru_cache
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from app.config import settings


def canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


@lru_cache(maxsize=1)
def load_or_create_key() -> Ed25519PrivateKey:
    path = Path(settings.signing_key_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    try:
        with open(path, "xb") as f:  # exclusive create: of several booting workers, exactly one writes
            f.write(pem)
    except FileExistsError:
        for _ in range(50):  # another worker may be mid-write
            data = path.read_bytes()
            if data.strip().endswith(b"-----END PRIVATE KEY-----"):
                return serialization.load_pem_private_key(data, password=None)  # type: ignore[return-value]
            time.sleep(0.1)
        raise
    path.with_suffix(".pub").write_bytes(
        key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    )
    return key


def _raw_public() -> bytes:
    return load_or_create_key().public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def public_pem() -> str:
    return (
        load_or_create_key()
        .public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )


def key_id() -> str:
    return hashlib.sha256(_raw_public()).hexdigest()[:16]


def public_jwk() -> dict:
    x = base64.urlsafe_b64encode(_raw_public()).rstrip(b"=").decode()
    return {"kty": "OKP", "crv": "Ed25519", "x": x, "kid": key_id(), "use": "sig", "alg": "EdDSA"}


def sign(payload: dict) -> str:
    return load_or_create_key().sign(canonical(payload).encode()).hex()


def verify(payload: dict, signature_hex: str, public_key: Ed25519PublicKey | None = None) -> bool:
    pub = public_key or load_or_create_key().public_key()
    try:
        pub.verify(bytes.fromhex(signature_hex), canonical(payload).encode())
        return True
    except (InvalidSignature, ValueError):
        return False


def main() -> None:
    """Offline verification: python -m app.signing record.json portal-signing-key.pem"""
    import argparse

    ap = argparse.ArgumentParser(description="Verify a signed Portal record without trusting the server")
    ap.add_argument("record", help="JSON file from GET /v1/records/{id}")
    ap.add_argument("public_key", help="PEM from /.well-known/portal-signing-key.pem")
    args = ap.parse_args()
    record = json.loads(Path(args.record).read_text(encoding="utf-8"))
    pub = serialization.load_pem_public_key(Path(args.public_key).read_bytes())
    ok = verify(record["payload"], record["signature"], pub)  # type: ignore[arg-type]
    print("valid" if ok else "INVALID")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
