from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.finance import (
    approve_entry_record,
    create_entry_record,
    debt_out,
    order_out,
    report_data,
)
from app.core.db import get_db
from app.core.deps import Principal, client_ip, require_scopes
from app.models import Debt, DebtStatus, Order, Role, User
from app.schemas import (
    DebtOut,
    FinanceEntryCreateIn,
    FinanceEntryOut,
    FinanceReportOut,
    OrderOut,
    TelegramApprovalIn,
    TelegramDebtIn,
    TelegramDebtPaymentIn,
    TelegramFinanceEntryIn,
    TelegramReportIn,
    TelegramStaffOut,
)
from app.services.audit import audit

router = APIRouter(prefix="/telegram/finance", tags=["telegram-finance"])
bot_only = require_scopes("agent:chat")


async def get_staff(db: AsyncSession, telegram_chat_id: str) -> User:
    user = (
        await db.execute(
            select(User).where(User.telegram_chat_id == telegram_chat_id, User.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(403, "Telegram hisobingiz CRM foydalanuvchisiga ulanmagan")
    return user


def require_staff_role(user: User, *roles: Role) -> None:
    if Role(user.role) not in roles:
        raise HTTPException(403, "Bu amal uchun rolingiz yetarli emas")


@router.get("/me/{telegram_chat_id}", response_model=TelegramStaffOut)
async def telegram_me(
    telegram_chat_id: str,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(bot_only),
):
    user = await get_staff(db, telegram_chat_id)
    require_staff_role(user, Role.OWNER, Role.ACCOUNTANT, Role.MANAGER)
    return TelegramStaffOut(full_name=user.full_name, role=user.role)


@router.post("/entries", response_model=FinanceEntryOut, status_code=201)
async def telegram_create_entry(
    data: TelegramFinanceEntryIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(bot_only),
):
    user = await get_staff(db, data.telegram_chat_id)
    require_staff_role(user, Role.OWNER, Role.ACCOUNTANT)
    entry_data = FinanceEntryCreateIn(**data.model_dump(exclude={"telegram_chat_id"}))
    entry = await create_entry_record(db, entry_data, user, "telegram")
    await audit(db, f"user:{user.id}", "finance.telegram_entry", "finance_entry", entry.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/debts", response_model=DebtOut, status_code=201)
async def telegram_create_debt(
    data: TelegramDebtIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(bot_only),
):
    user = await get_staff(db, data.telegram_chat_id)
    require_staff_role(user, Role.OWNER, Role.ACCOUNTANT)
    if data.order_id and not await db.get(Order, data.order_id):
        raise HTTPException(404, "Buyurtma topilmadi")
    debt = Debt(
        **data.model_dump(exclude={"telegram_chat_id"}),
        paid_amount=0,
        status=DebtStatus.OPEN,
        created_by_id=user.id,
    )
    db.add(debt)
    await db.flush()
    await audit(db, f"user:{user.id}", "finance.telegram_debt", "debt", debt.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(debt)
    return debt_out(debt)


@router.post("/debts/{debt_id}/payment", response_model=FinanceEntryOut, status_code=201)
async def telegram_debt_payment(
    debt_id: int,
    data: TelegramDebtPaymentIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(bot_only),
):
    user = await get_staff(db, data.telegram_chat_id)
    require_staff_role(user, Role.OWNER, Role.ACCOUNTANT)
    debt = await db.get(Debt, debt_id)
    if not debt or debt.status != DebtStatus.OPEN:
        raise HTTPException(404, "Ochiq qarz topilmadi")
    kind = "income" if debt.direction == "receivable" else "expense"
    entry_data = FinanceEntryCreateIn(
        kind=kind,
        amount=data.amount,
        category="Qarz to'lovi",
        description=data.description,
        payment_method=data.payment_method,
        order_id=debt.order_id,
        debt_id=debt.id,
    )
    entry = await create_entry_record(db, entry_data, user, "telegram")
    await audit(db, f"user:{user.id}", "finance.telegram_payment", "finance_entry", entry.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/report", response_model=FinanceReportOut)
async def telegram_report(
    data: TelegramReportIn,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(bot_only),
):
    user = await get_staff(db, data.telegram_chat_id)
    require_staff_role(user, Role.OWNER, Role.ACCOUNTANT, Role.MANAGER)
    return await report_data(db, data.period)


@router.get("/orders/{order_id}", response_model=OrderOut)
async def telegram_order(
    order_id: int,
    telegram_chat_id: str,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(bot_only),
):
    user = await get_staff(db, telegram_chat_id)
    require_staff_role(user, Role.OWNER, Role.ACCOUNTANT, Role.MANAGER)
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Buyurtma topilmadi")
    return await order_out(db, order)


@router.post("/entries/{entry_id}/approve", response_model=FinanceEntryOut)
async def telegram_approve(
    entry_id: int,
    data: TelegramApprovalIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(bot_only),
):
    user = await get_staff(db, data.telegram_chat_id)
    require_staff_role(user, Role.OWNER)
    entry = await approve_entry_record(db, entry_id, user)
    await audit(db, f"user:{user.id}", "finance.telegram_approved", "finance_entry", entry.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry
