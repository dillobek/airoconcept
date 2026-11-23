import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import SESSION_COOKIE, Principal, client_ip, get_principal
from app.core.ratelimit import limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.models.base import utcnow
from app.schemas import LoginIn, TotpEnableIn, TotpSetupOut, UserOut
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])

# Foydalanuvchi bor-yo'qligini vaqt bo'yicha bilib bo'lmasligi uchun soxta hash
_DUMMY_HASH = hash_password("timing-attack-dummy")


@router.post("/login", response_model=UserOut)
@limiter.limit("5/minute")
async def login(request: Request, response: Response, data: LoginIn, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == data.email.lower()))).scalar_one_or_none()
    ok = verify_password(data.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok or not user.is_active:
        await audit(db, "anonymous", "auth.login_failed", data={"email": data.email}, ip=client_ip(request))
        await db.commit()
        raise HTTPException(401, "Email yoki parol noto'g'ri")

    if user.totp_enabled:
        if not data.totp_code:
            raise HTTPException(401, "2FA kod kerak")
        if not pyotp.TOTP(user.totp_secret).verify(data.totp_code, valid_window=1):
            await audit(db, f"user:{user.id}", "auth.totp_failed", ip=client_ip(request))
            await db.commit()
            raise HTTPException(401, "2FA kod noto'g'ri")

    user.last_login_at = utcnow()
    await audit(db, f"user:{user.id}", "auth.login", ip=client_ip(request))
    await db.commit()

    response.set_cookie(
        SESSION_COOKIE,
        create_access_token(user.id, user.role),
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="strict",
        domain=settings.COOKIE_DOMAIN,
        max_age=settings.ACCESS_TOKEN_MINUTES * 60,
        path="/",
    )
    return user


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", domain=settings.COOKIE_DOMAIN)


@router.get("/me", response_model=UserOut)
async def me(p: Principal = Depends(get_principal)):
    if p.user is None:
        raise HTTPException(403, "Faqat foydalanuvchi sessiyasi uchun")
    return p.user


@router.post("/2fa/setup", response_model=TotpSetupOut)
async def totp_setup(p: Principal = Depends(get_principal), db: AsyncSession = Depends(get_db)):
    if p.user is None:
        raise HTTPException(403)
    user = await db.get(User, p.user.id)
    assert user is not None
    if user.totp_enabled:
        raise HTTPException(400, "2FA allaqachon yoqilgan")
    user.totp_secret = pyotp.random_base32()
    await db.commit()
    url = pyotp.TOTP(user.totp_secret).provisioning_uri(name=user.email, issuer_name="AiroConcept")
    return TotpSetupOut(secret=user.totp_secret, otpauth_url=url)


@router.post("/2fa/enable", response_model=UserOut)
async def totp_enable(data: TotpEnableIn, p: Principal = Depends(get_principal), db: AsyncSession = Depends(get_db)):
    if p.user is None:
        raise HTTPException(403)
    user = await db.get(User, p.user.id)
    assert user is not None
    if not user.totp_secret or not pyotp.TOTP(user.totp_secret).verify(data.code, valid_window=1):
        raise HTTPException(400, "Kod noto'g'ri")
    user.totp_enabled = True
    await audit(db, p.actor, "auth.2fa_enabled")
    await db.commit()
    return user
