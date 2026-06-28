"""
push_keys.py — VAPID key management for Web Push.

Generates a NIST P-256 key pair on first run, persists it to the Nalaris
data directory, and exposes the public key in the formats the browser
(PushManager.subscribe) and pywebpush need.
"""

from __future__ import annotations

import base64
import logging
import os
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from . import paths

logger = logging.getLogger("gateway.push_keys")

# VAPID uses prime256v1 / secp256r1 / NIST P-256
_CURVE = ec.SECP256R1()


def vapid_key_path() -> Path:
    """Path to the persisted VAPID private key (PEM)."""
    return paths.data_dir() / "vapid.pem"


def _generate_key() -> ec.EllipticCurvePrivateKey:
    """Generate a fresh P-256 private key."""
    return ec.generate_private_key(_CURVE)


def _load_or_generate_key() -> ec.EllipticCurvePrivateKey:
    """Load the existing VAPID key or generate and persist a new one."""
    key_file = vapid_key_path()
    if key_file.exists():
        try:
            pem = key_file.read_bytes()
            key = serialization.load_pem_private_key(pem, password=None)
            if isinstance(key, ec.EllipticCurvePrivateKey):
                return key
        except Exception as e:
            logger.warning("Could not load existing VAPID key (%s); regenerating.", e)

    key = _generate_key()
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_bytes(pem)
    # Restrict permissions: only owner can read the private key.
    os.chmod(key_file, 0o600)
    logger.info("Generated and saved new VAPID key to %s", key_file)
    return key


class VapidKeys:
    """Holder for the server's VAPID key pair."""

    def __init__(self):
        self._private_key = _load_or_generate_key()
        self._public_key = self._private_key.public_key()

    @property
    def private_key(self) -> ec.EllipticCurvePrivateKey:
        return self._private_key

    @property
    def public_key(self) -> ec.EllipticCurvePublicKey:
        return self._public_key

    def public_key_bytes(self) -> bytes:
        """Raw uncompressed public key bytes (65 bytes for P-256)."""
        return self._public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )

    def public_key_b64url(self) -> str:
        """URL-safe base64 of the raw public key — the format PushManager expects."""
        return base64.urlsafe_b64encode(self.public_key_bytes()).rstrip(b"=").decode("ascii")


# Singleton, loaded lazily by modules that need it.
_keys: Optional[VapidKeys] = None


def get_keys() -> VapidKeys:
    """Return the singleton VapidKeys instance."""
    global _keys
    if _keys is None:
        _keys = VapidKeys()
    return _keys
