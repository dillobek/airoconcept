"""Autentifikatsiya: admin sessiyasi (cookie) yoki API kalit (X-API-Key) va scope tekshiruvi."""

from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token, hash_api_key
from app.models import ROLE_SCOPES, ApiKey, Role, User

SESSION_COOKIE = "airo_session"


@dataclass
class Principal:
    kind: str  # "user" | "apikey"
    id: int
    name: str
    role: str | None = None
    scopes: set[str] = field(default_factory=set)
    user: User | None = None

    @property
    def actor(self) -> str:
        return f"{self.kind}:{self.id}"

    def has_scope(self, scope: str) -> bool:
        if "*" in self.scopes or scope in self.scopes:
            return True
        # "leads:*" kabi wildcard
        resource = scope.split(":", 1)[0]
        return f"{resource}:*" in self.scopes


def client_ip(request: Request) -> str:
    # Reverse proxy (Caddy) ortida ishlaganda haqiqiy IP X-Forwarded-For'da keladi.
    # uvicorn --proxy-headers --forwarded-allow-ips bilan request.client allaqachon to'g'rilangan bo'ladi.
    return request.client.host if request.client else "unknown"


async def get_principal(request: Request, db: AsyncSession = Depends(get_db)) -> Principal:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Avtorizatsiya talab qilinadi")

    # 1) API kalit
    raw_key = request.headers.get("X-API-Key")
    if raw_key:
        key = (await db.execute(select(ApiKey).where(ApiKey.key_hash == hash_api_key(raw_key)))).scalar_one_or_none()
        now = datetime.now(UTC)
        if not key or key.revoked:
            raise unauthorized
        if key.expires_at and key.expires_at.replace(tzinfo=key.expires_at.tzinfo or UTC) < now:
            raise unauthorized
        if key.allowed_ips and client_ip(request) not in key.allowed_ips:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu IP manzilga ruxsat yo'q")
        key.last_used_at = now
        await db.commit()
        return Principal(kind="apikey", id=key.id, name=key.name, scopes=set(key.scopes))

    # 2) Admin sessiyasi (httpOnly cookie) yoki Bearer token
    token = request.cookies.get(SESSION_COOKIE)
    auth = request.headers.get("Authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:]
    if not token:
        raise unauthorized
    payload = decode_access_token(token)
    if not payload:
        raise unauthorized
    user = await db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise unauthorized
    role = Role(user.role)
    return Principal(kind="user", id=user.id, name=user.full_name, role=role, scopes=ROLE_SCOPES[role], user=user)


def require_scopes(*scopes: str):
    async def checker(principal: Principal = Depends(get_principal)) -> Principal:
        missing = [s for s in scopes if not principal.has_scope(s)]
        if missing:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Ruxsat yetarli emas: {', '.join(missing)}")
        return principal

    return checker


def require_role(*roles: Role):
    async def checker(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.kind != "user" or principal.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu amal faqat ruxsat berilgan foydalanuvchilar uchun")
        return principal

    return checker
