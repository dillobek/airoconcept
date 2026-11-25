from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import Principal, client_ip, require_role
from app.core.security import hash_password
from app.models import Role, User
from app.schemas import UserAdminOut, UserCreateIn, UserUpdateIn
from app.services.audit import audit

router = APIRouter(prefix="/users", tags=["users"])
owner_only = require_role(Role.OWNER)


@router.get("", response_model=list[UserAdminOut])
async def list_users(db: AsyncSession = Depends(get_db), _: Principal = Depends(owner_only)):
    return (await db.execute(select(User).order_by(User.id))).scalars().all()


@router.post("", response_model=UserAdminOut, status_code=201)
async def create_user(
    data: UserCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(owner_only),
):
    duplicate = (
        await db.execute(select(User.id).where(or_(User.username == data.username, User.email == data.email.lower())))
    ).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(409, "Username yoki email band")
    if data.telegram_chat_id:
        linked = (
            await db.execute(select(User.id).where(User.telegram_chat_id == data.telegram_chat_id))
        ).scalar_one_or_none()
        if linked is not None:
            raise HTTPException(409, "Telegram chat ID boshqa foydalanuvchiga ulangan")
    user = User(
        username=data.username,
        email=data.email.lower(),
        full_name=data.full_name,
        role=data.role,
        password_hash=hash_password(data.password),
        telegram_chat_id=data.telegram_chat_id or None,
    )
    db.add(user)
    await db.flush()
    await audit(db, p.actor, "user.created", "user", user.id, {"role": user.role}, client_ip(request))
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserAdminOut)
async def update_user(
    user_id: int,
    data: UserUpdateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(owner_only),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    changes = data.model_dump(exclude_unset=True)
    if user_id == p.id and (changes.get("role") not in {None, Role.OWNER} or changes.get("is_active") is False):
        raise HTTPException(422, "O'zingizning owner huquqingizni olib tashlay olmaysiz")
    chat_id = changes.get("telegram_chat_id")
    if chat_id:
        linked = (
            await db.execute(select(User.id).where(User.telegram_chat_id == chat_id, User.id != user_id))
        ).scalar_one_or_none()
        if linked is not None:
            raise HTTPException(409, "Telegram chat ID boshqa foydalanuvchiga ulangan")
    password = changes.pop("new_password", None)
    if password:
        user.password_hash = hash_password(password)
    if "telegram_chat_id" in changes:
        changes["telegram_chat_id"] = changes["telegram_chat_id"] or None
    for key, value in changes.items():
        setattr(user, key, value)
    await audit(
        db,
        p.actor,
        "user.updated",
        "user",
        user.id,
        {key: value for key, value in changes.items() if key != "new_password"},
        client_ip(request),
    )
    await db.commit()
    await db.refresh(user)
    return user
