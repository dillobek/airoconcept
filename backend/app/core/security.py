"""Parollar, JWT, API kalitlar, imzolar va shifrlash."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_ph = PasswordHasher()
JWT_ALG = "HS256"
API_KEY_PREFIX = "aic_live_"


# ---------- Parollar ----------
def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, password)
    except VerifyMismatchError:
        return False


# ---------- JWT (admin panel sessiyasi) ----------
def create_access_token(user_id: int, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY.get_secret_value(), algorithm=JWT_ALG)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY.get_secret_value(), algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


# ---------- API kalitlar (tashqi dasturlar uchun) ----------
def generate_api_key() -> tuple[str, str, str]:
    """(to'liq_kalit, prefiks, hash) qaytaradi. To'liq kalit faqat bir marta ko'rsatiladi."""
    raw = API_KEY_PREFIX + secrets.token_urlsafe(32)
    return raw, raw[:16], hash_api_key(raw)


def hash_api_key(raw: str) -> str:
    # Kalit yuqori entropiyali tasodifiy qator, shuning uchun SHA-256 yetarli va tez.
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------- Webhook imzolari ----------
def verify_meta_signature(body: bytes, header_value: str | None, app_secret: str) -> bool:
    if not header_value or not app_secret or not header_value.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header_value, expected)


def sign_payload(body: bytes, secret: str) -> str:
    """Chiquvchi webhooklar uchun HMAC imzo."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ---------- Shifrlash (bazadagi tokenlar uchun) ----------
def _fernet() -> Fernet:
    key = settings.ENCRYPTION_KEY.get_secret_value()
    if not key:
        raise RuntimeError("ENCRYPTION_KEY sozlanmagan")
    return Fernet(key.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as e:
        raise ValueError("Shifrni ochib bo'lmadi") from e
