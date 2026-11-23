from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import Principal, client_ip, require_role
from app.core.security import generate_api_key
from app.models import ApiKey, Role
from app.schemas import ALLOWED_SCOPES, ApiKeyCreatedOut, ApiKeyCreateIn, ApiKeyOut
from app.services.audit import audit

router = APIRouter(prefix="/api-keys", tags=["api-keys"])
owner_only = require_role(Role.OWNER)


@router.get("", response_model=list[ApiKeyOut])
async def list_keys(db: AsyncSession = Depends(get_db), _: Principal = Depends(owner_only)):
    return (await db.execute(select(ApiKey).order_by(ApiKey.id.desc()))).scalars().all()


@router.post("", response_model=ApiKeyCreatedOut, status_code=201)
async def create_key(
    data: ApiKeyCreateIn, request: Request, db: AsyncSession = Depends(get_db), p: Principal = Depends(owner_only)
):
    bad = set(data.scopes) - ALLOWED_SCOPES
    if bad or not data.scopes:
        raise HTTPException(422, f"Noto'g'ri scope: {', '.join(sorted(bad)) or 'bo`sh'}")
    raw, prefix, key_hash = generate_api_key()
    key = ApiKey(
        name=data.name,
        prefix=prefix,
        key_hash=key_hash,
        scopes=sorted(set(data.scopes)),
        allowed_ips=data.allowed_ips,
        expires_at=data.expires_at,
        created_by_id=p.id,
    )
    db.add(key)
    await db.flush()
    await audit(db, p.actor, "api_key.create", "api_key", key.id, {"scopes": key.scopes}, client_ip(request))
    await db.commit()
    await db.refresh(key)
    return ApiKeyCreatedOut(**ApiKeyOut.model_validate(key).model_dump(), key=raw)


@router.post("/{key_id}/revoke", response_model=ApiKeyOut)
async def revoke_key(
    key_id: int, request: Request, db: AsyncSession = Depends(get_db), p: Principal = Depends(owner_only)
):
    key = await db.get(ApiKey, key_id)
    if not key:
        raise HTTPException(404, "Kalit topilmadi")
    key.revoked = True
    await audit(db, p.actor, "api_key.revoke", "api_key", key.id, ip=client_ip(request))
    await db.commit()
    return key
