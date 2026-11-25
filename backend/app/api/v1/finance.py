from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import Principal, client_ip, require_role, require_scopes
from app.models import (
    ApprovalStatus,
    Client,
    Debt,
    DebtDirection,
    DebtStatus,
    EntryKind,
    FinanceEntry,
    Lead,
    Order,
    OrderStatus,
    Role,
    User,
)
from app.models.base import utcnow
from app.schemas import (
    ApprovalDecisionIn,
    DebtCreateIn,
    DebtOut,
    FinanceDashboardOut,
    FinanceEntryCreateIn,
    FinanceEntryOut,
    FinanceReportOut,
    OrderCreateIn,
    OrderOut,
    OrderUpdateIn,
    ReportPoint,
)
from app.services.audit import audit

router = APIRouter(prefix="/finance", tags=["finance"])
owner_only = require_role(Role.OWNER)
ZERO = Decimal("0.00")


def period_range(period: str, anchor: date | None = None) -> tuple[date, date]:
    anchor = anchor or date.today()
    if period == "day":
        return anchor, anchor
    if period == "week":
        start = anchor - timedelta(days=anchor.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        start = anchor.replace(day=1)
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        return start, next_month - timedelta(days=1)
    raise HTTPException(422, "Davr day, week yoki month bo'lishi kerak")


def _money(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"))


def debt_out(debt: Debt) -> DebtOut:
    return DebtOut(
        **DebtOut.model_validate(debt).model_dump(exclude={"remaining_amount"}),
        remaining_amount=max(_money(debt.amount) - _money(debt.paid_amount), ZERO),
    )


async def order_out(db: AsyncSession, order: Order) -> OrderOut:
    income, expense = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(case((FinanceEntry.kind == EntryKind.INCOME, FinanceEntry.amount), else_=0)), 0
                ),
                func.coalesce(
                    func.sum(case((FinanceEntry.kind == EntryKind.EXPENSE, FinanceEntry.amount), else_=0)), 0
                ),
            ).where(
                FinanceEntry.order_id == order.id,
                FinanceEntry.status == ApprovalStatus.APPROVED,
            )
        )
    ).one()
    income_value, expense_value = _money(income), _money(expense)
    total = _money(order.total_amount)
    return OrderOut(
        **OrderOut.model_validate(order).model_dump(
            exclude={"income_total", "expense_total", "outstanding", "profit"}
        ),
        income_total=income_value,
        expense_total=expense_value,
        outstanding=max(total - income_value, ZERO),
        profit=income_value - expense_value,
    )


def order_out_with_totals(order: Order, income, expense) -> OrderOut:
    income_value, expense_value = _money(income), _money(expense)
    total = _money(order.total_amount)
    return OrderOut(
        **OrderOut.model_validate(order).model_dump(
            exclude={"income_total", "expense_total", "outstanding", "profit"}
        ),
        income_total=income_value,
        expense_total=expense_value,
        outstanding=max(total - income_value, ZERO),
        profit=income_value - expense_value,
    )


async def create_entry_record(
    db: AsyncSession,
    data: FinanceEntryCreateIn,
    user: User,
    source: str,
) -> FinanceEntry:
    if data.order_id and not await db.get(Order, data.order_id):
        raise HTTPException(404, "Buyurtma topilmadi")
    if data.debt_id:
        debt = await db.get(Debt, data.debt_id)
        if not debt or debt.status != DebtStatus.OPEN:
            raise HTTPException(404, "Ochiq qarz topilmadi")
        expected = EntryKind.INCOME if debt.direction == DebtDirection.RECEIVABLE else EntryKind.EXPENSE
        if data.kind != expected:
            raise HTTPException(422, "Qarz turi bilan kirim/chiqim turi mos emas")
        if _money(data.amount) > _money(debt.amount) - _money(debt.paid_amount):
            raise HTTPException(422, "To'lov qarz qoldig'idan katta")
    entry = FinanceEntry(
        **data.model_dump(),
        status=ApprovalStatus.PENDING,
        source=source,
        created_by_id=user.id,
    )
    db.add(entry)
    await db.flush()
    return entry


async def approve_entry_record(db: AsyncSession, entry_id: int, owner: User) -> FinanceEntry:
    entry = (
        await db.execute(select(FinanceEntry).where(FinanceEntry.id == entry_id).with_for_update())
    ).scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Hisob yozuvi topilmadi")
    if entry.status != ApprovalStatus.PENDING:
        raise HTTPException(409, "Bu yozuv allaqachon ko'rib chiqilgan")
    if entry.debt_id:
        debt = (
            await db.execute(select(Debt).where(Debt.id == entry.debt_id).with_for_update())
        ).scalar_one_or_none()
        if not debt or debt.status != DebtStatus.OPEN:
            raise HTTPException(409, "Qarz yopilgan yoki topilmadi")
        new_paid = _money(debt.paid_amount) + _money(entry.amount)
        if new_paid > _money(debt.amount):
            raise HTTPException(409, "Tasdiqlansa qarz miqdoridan oshib ketadi")
        debt.paid_amount = new_paid
        if new_paid == _money(debt.amount):
            debt.status = DebtStatus.PAID
    entry.status = ApprovalStatus.APPROVED
    entry.approved_by_id = owner.id
    entry.approved_at = utcnow()
    return entry


async def report_data(db: AsyncSession, period: str, anchor: date | None = None) -> FinanceReportOut:
    start, end = period_range(period, anchor)
    rows = (
        await db.execute(
            select(FinanceEntry)
            .where(
                FinanceEntry.status == ApprovalStatus.APPROVED,
                FinanceEntry.occurred_on >= start,
                FinanceEntry.occurred_on <= end,
            )
            .order_by(FinanceEntry.occurred_on, FinanceEntry.id)
        )
    ).scalars().all()
    daily: dict[date, list[Decimal]] = defaultdict(lambda: [ZERO, ZERO])
    income = expense = ZERO
    for row in rows:
        amount = _money(row.amount)
        if row.kind == EntryKind.INCOME:
            income += amount
            daily[row.occurred_on][0] += amount
        else:
            expense += amount
            daily[row.occurred_on][1] += amount
    points = [
        ReportPoint(label=day.isoformat(), income=values[0], expense=values[1], profit=values[0] - values[1])
        for day, values in sorted(daily.items())
    ]
    return FinanceReportOut(
        period=period,
        period_start=start,
        period_end=end,
        income=income,
        expense=expense,
        profit=income - expense,
        points=points,
    )


@router.get("/dashboard", response_model=FinanceDashboardOut)
async def dashboard(
    period: str = "month",
    anchor: date | None = None,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("finance:read")),
):
    report = await report_data(db, period, anchor)
    receivable, payable = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (Debt.direction == DebtDirection.RECEIVABLE, Debt.amount - Debt.paid_amount),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (Debt.direction == DebtDirection.PAYABLE, Debt.amount - Debt.paid_amount),
                            else_=0,
                        )
                    ),
                    0,
                ),
            ).where(Debt.status == DebtStatus.OPEN)
        )
    ).one()
    pending_stmt = (
        select(func.count()).select_from(FinanceEntry).where(FinanceEntry.status == ApprovalStatus.PENDING)
    )
    pending = (await db.execute(pending_stmt)).scalar_one()
    active_orders = (
        await db.execute(
            select(func.count()).select_from(Order).where(Order.status.in_([OrderStatus.NEW, OrderStatus.IN_PROGRESS]))
        )
    ).scalar_one()
    return FinanceDashboardOut(
        period=period,
        period_start=report.period_start,
        period_end=report.period_end,
        income=report.income,
        expense=report.expense,
        profit=report.profit,
        receivable=_money(receivable),
        payable=_money(payable),
        pending_approvals=pending,
        active_orders=active_orders,
    )


@router.get("/entries", response_model=list[FinanceEntryOut])
async def list_entries(
    status: str | None = None,
    kind: str | None = None,
    order_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("finance:read")),
):
    stmt = select(FinanceEntry)
    if status:
        stmt = stmt.where(FinanceEntry.status == status)
    if kind:
        stmt = stmt.where(FinanceEntry.kind == kind)
    if order_id:
        stmt = stmt.where(FinanceEntry.order_id == order_id)
    stmt = stmt.order_by(FinanceEntry.occurred_on.desc(), FinanceEntry.id.desc()).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@router.post("/entries", response_model=FinanceEntryOut, status_code=201)
async def create_entry(
    data: FinanceEntryCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(require_scopes("finance:write")),
):
    assert p.user is not None
    entry = await create_entry_record(db, data, p.user, "admin")
    await audit(db, p.actor, "finance.entry_created", "finance_entry", entry.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/entries/{entry_id}/approve", response_model=FinanceEntryOut)
async def approve_entry(
    entry_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(owner_only),
):
    assert p.user is not None
    entry = await approve_entry_record(db, entry_id, p.user)
    await audit(db, p.actor, "finance.entry_approved", "finance_entry", entry.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/entries/{entry_id}/reject", response_model=FinanceEntryOut)
async def reject_entry(
    entry_id: int,
    data: ApprovalDecisionIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(owner_only),
):
    entry = (
        await db.execute(select(FinanceEntry).where(FinanceEntry.id == entry_id).with_for_update())
    ).scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Hisob yozuvi topilmadi")
    if entry.status != ApprovalStatus.PENDING:
        raise HTTPException(409, "Bu yozuv allaqachon ko'rib chiqilgan")
    entry.status = ApprovalStatus.REJECTED
    entry.approved_by_id = p.id
    entry.approved_at = utcnow()
    entry.rejection_reason = data.reason
    await audit(db, p.actor, "finance.entry_rejected", "finance_entry", entry.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/orders", response_model=list[OrderOut])
async def list_orders(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("orders:read")),
):
    totals = (
        select(
            FinanceEntry.order_id.label("order_id"),
            func.sum(case((FinanceEntry.kind == EntryKind.INCOME, FinanceEntry.amount), else_=0)).label("income"),
            func.sum(case((FinanceEntry.kind == EntryKind.EXPENSE, FinanceEntry.amount), else_=0)).label("expense"),
        )
        .where(FinanceEntry.status == ApprovalStatus.APPROVED)
        .group_by(FinanceEntry.order_id)
        .subquery()
    )
    stmt = select(
        Order,
        func.coalesce(totals.c.income, 0),
        func.coalesce(totals.c.expense, 0),
    ).outerjoin(totals, totals.c.order_id == Order.id)
    if status:
        stmt = stmt.where(Order.status == status)
    rows = (await db.execute(stmt.order_by(Order.id.desc()).limit(200))).all()
    return [order_out_with_totals(order, income, expense) for order, income, expense in rows]


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("orders:read")),
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Buyurtma topilmadi")
    return await order_out(db, order)


@router.post("/orders", response_model=OrderOut, status_code=201)
async def create_order(
    data: OrderCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(require_scopes("orders:write")),
):
    client_id = None
    customer_name = data.customer_name
    if data.lead_id:
        lead = await db.get(Lead, data.lead_id)
        if not lead:
            raise HTTPException(404, "Lead topilmadi")
        client_id = lead.client_id
        client = await db.get(Client, lead.client_id)
        if client and client.name and not customer_name.strip():
            customer_name = client.name
    order = Order(
        **data.model_dump(exclude={"customer_name"}),
        customer_name=customer_name,
        client_id=client_id,
        created_by_id=p.id,
    )
    db.add(order)
    await db.flush()
    await audit(db, p.actor, "finance.order_created", "order", order.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(order)
    return await order_out(db, order)


@router.patch("/orders/{order_id}", response_model=OrderOut)
async def update_order(
    order_id: int,
    data: OrderUpdateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(require_scopes("orders:write")),
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Buyurtma topilmadi")
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(order, key, value)
    await audit(db, p.actor, "finance.order_updated", "order", order.id, changes, client_ip(request))
    await db.commit()
    await db.refresh(order)
    return await order_out(db, order)


@router.get("/debts", response_model=list[DebtOut])
async def list_debts(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("finance:read")),
):
    stmt = select(Debt)
    if status:
        stmt = stmt.where(Debt.status == status)
    debts = (await db.execute(stmt.order_by(Debt.id.desc()).limit(200))).scalars().all()
    return [debt_out(debt) for debt in debts]


@router.post("/debts", response_model=DebtOut, status_code=201)
async def create_debt(
    data: DebtCreateIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    p: Principal = Depends(require_scopes("finance:write")),
):
    if data.order_id and not await db.get(Order, data.order_id):
        raise HTTPException(404, "Buyurtma topilmadi")
    debt = Debt(**data.model_dump(), paid_amount=ZERO, status=DebtStatus.OPEN, created_by_id=p.id)
    db.add(debt)
    await db.flush()
    await audit(db, p.actor, "finance.debt_created", "debt", debt.id, ip=client_ip(request))
    await db.commit()
    await db.refresh(debt)
    return debt_out(debt)


@router.get("/report", response_model=FinanceReportOut)
async def report(
    period: str = "month",
    anchor: date | None = None,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("finance:read")),
):
    return await report_data(db, period, anchor)


async def _export_rows(db: AsyncSession, period: str, anchor: date | None):
    start, end = period_range(period, anchor)
    rows = (
        await db.execute(
            select(FinanceEntry)
            .where(
                FinanceEntry.status == ApprovalStatus.APPROVED,
                FinanceEntry.occurred_on >= start,
                FinanceEntry.occurred_on <= end,
            )
            .order_by(FinanceEntry.occurred_on, FinanceEntry.id)
        )
    ).scalars().all()
    return start, end, rows, await report_data(db, period, anchor)


@router.get("/export.xlsx")
async def export_xlsx(
    period: str = "month",
    anchor: date | None = None,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("finance:read")),
):
    start, end, rows, summary = await _export_rows(db, period, anchor)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Hisobot"
    sheet.append(["AiroConcept moliyaviy hisobot"])
    sheet.append(["Davr", f"{start.isoformat()} - {end.isoformat()}"])
    sheet.append(["Kirim", float(summary.income)])
    sheet.append(["Chiqim", float(summary.expense)])
    sheet.append(["Foyda", float(summary.profit)])
    sheet.append([])
    sheet.append(["ID", "Sana", "Turi", "Kategoriya", "Summa", "To'lov", "Buyurtma", "Izoh"])
    for cell in sheet[7]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2B1D14")
    for row in rows:
        sheet.append(
            [
                row.id,
                row.occurred_on.isoformat(),
                "Kirim" if row.kind == EntryKind.INCOME else "Chiqim",
                row.category,
                float(row.amount),
                row.payment_method,
                row.order_id or "",
                row.description or "",
            ]
        )
    for width, column in zip([8, 14, 12, 20, 16, 14, 12, 40], "ABCDEFGH", strict=True):
        sheet.column_dimensions[column].width = width
    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    filename = f"airoconcept-finance-{period}-{start.isoformat()}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export.pdf")
async def export_pdf(
    period: str = "month",
    anchor: date | None = None,
    db: AsyncSession = Depends(get_db),
    _: Principal = Depends(require_scopes("finance:read")),
):
    start, end, rows, summary = await _export_rows(db, period, anchor)
    stream = BytesIO()
    document = SimpleDocTemplate(
        stream,
        pagesize=landscape(A4),
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title="AiroConcept moliyaviy hisobot",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("AiroConcept moliyaviy hisobot", styles["Title"]),
        Paragraph(f"Davr: {start.isoformat()} - {end.isoformat()}", styles["Normal"]),
        Spacer(1, 5 * mm),
        Table(
            [
                ["Kirim", "Chiqim", "Foyda"],
                [f"{summary.income:,.2f} UZS", f"{summary.expense:,.2f} UZS", f"{summary.profit:,.2f} UZS"],
            ],
            colWidths=[75 * mm, 75 * mm, 75 * mm],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2B1D14")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D6D3D1")),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        ),
        Spacer(1, 6 * mm),
    ]
    table_data = [["ID", "Sana", "Turi", "Kategoriya", "Summa", "Buyurtma", "Izoh"]]
    for row in rows:
        table_data.append(
            [
                str(row.id),
                row.occurred_on.isoformat(),
                "Kirim" if row.kind == EntryKind.INCOME else "Chiqim",
                row.category[:24],
                f"{row.amount:,.2f}",
                str(row.order_id or "-"),
                (row.description or "-")[:50],
            ]
        )
    entries_table = Table(table_data, repeatRows=1, colWidths=[12*mm, 25*mm, 20*mm, 40*mm, 32*mm, 22*mm, 90*mm])
    entries_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F6B52")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D6D3D1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFAF9")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(entries_table)
    document.build(story)
    stream.seek(0)
    filename = f"airoconcept-finance-{period}-{start.isoformat()}.pdf"
    return StreamingResponse(
        stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
