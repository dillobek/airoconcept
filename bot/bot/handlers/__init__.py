from decimal import Decimal, InvalidOperation

from aiogram import F, Router
from aiogram.enums import ChatAction, ChatType
from aiogram.filters import Command, CommandStart
from aiogram.types import Message

from bot.backend import BackendClient
from bot.keyboards import contact_keyboard

router = Router()
# Bot faqat shaxsiy chatlarda ishlaydi (guruhlarda jim)
router.message.filter(F.chat.type == ChatType.PRIVATE)

WELCOME = (
    "Assalomu alaykum! 👋\n"
    "AiroConcept — buyurtma asosida mebel yasaymiz: oshxona, shkaf-kupe, garderob, yotoqxona, ofis.\n\n"
    "Sizga qanday mebel kerak? Qisqacha yozing — narx va bepul zamer haqida ma'lumot beraman."
)

FINANCE_HELP = (
    "💼 <b>Hisob-kitob buyruqlari</b>\n\n"
    "/kirim SUMMA IZOH [#BUYURTMA] - kirim kiritish\n"
    "/chiqim SUMMA IZOH [#BUYURTMA] - chiqim kiritish\n"
    "/qarz olish|berish SUMMA KONTRAGENT [YYYY-MM-DD] - qarz\n"
    "/tolov QARZ_ID SUMMA IZOH - qarz to'lovi\n"
    "/hisobot kun|hafta|oy - hisobot\n"
    "/buyurtma ID - buyurtma hisobi\n"
    "/tasdiq ID - yozuvni tasdiqlash (owner)\n\n"
    "Kiritilgan pul yozuvlari owner tasdig'idan keyin hisobotga qo'shiladi."
)


@router.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(WELCOME, reply_markup=contact_keyboard)


def _args(message: Message) -> str:
    parts = (message.text or "").split(maxsplit=1)
    return parts[1].strip() if len(parts) == 2 else ""


def _amount(value: str) -> str | None:
    normalized = value.replace(",", "").replace("_", "")
    try:
        amount = Decimal(normalized).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None
    return str(amount) if amount > 0 else None


def _money(value: object) -> str:
    try:
        return f"{float(str(value)):,.0f} so'm"
    except (TypeError, ValueError):
        return "0 so'm"


def _error(data: dict) -> str | None:
    value = data.get("error")
    return str(value) if value else None


@router.message(Command("hisob"))
async def finance_menu(message: Message, backend: BackendClient) -> None:
    result = await backend.finance_me(message.chat.id)
    error = _error(result)
    if error:
        await message.answer(f"{error}\n\nTelegram chat ID: <code>{message.chat.id}</code>", parse_mode="HTML")
        return
    await message.answer(
        f"Salom, {result['full_name']}! Rol: {result['role']}\n\n{FINANCE_HELP}",
        parse_mode="HTML",
    )


async def _create_entry(message: Message, backend: BackendClient, kind: str) -> None:
    raw = _args(message)
    parts = raw.split(maxsplit=1)
    amount = _amount(parts[0]) if parts else None
    if not amount or len(parts) < 2:
        await message.answer(f"Format: /{'kirim' if kind == 'income' else 'chiqim'} SUMMA IZOH [#BUYURTMA]")
        return
    description = parts[1]
    order_id = None
    words = description.split()
    if words and words[-1].startswith("#") and words[-1][1:].isdigit():
        order_id = int(words[-1][1:])
        description = " ".join(words[:-1]) or "Telegram orqali"
    result = await backend.create_finance_entry(
        message.chat.id,
        {
            "kind": kind,
            "amount": amount,
            "category": "Telegram kirim" if kind == "income" else "Telegram chiqim",
            "description": description,
            "payment_method": "cash",
            "order_id": order_id,
        },
    )
    if error := _error(result):
        await message.answer(f"❌ {error}")
        return
    await message.answer(
        f"✅ #{result['id']} yozildi: {_money(result['amount'])}. Holat: tasdiq kutilmoqda."
    )


@router.message(Command("kirim"))
async def income(message: Message, backend: BackendClient) -> None:
    await _create_entry(message, backend, "income")


@router.message(Command("chiqim"))
async def expense(message: Message, backend: BackendClient) -> None:
    await _create_entry(message, backend, "expense")


@router.message(Command("qarz"))
async def debt(message: Message, backend: BackendClient) -> None:
    parts = _args(message).split()
    if len(parts) < 3 or parts[0] not in {"olish", "berish"}:
        await message.answer("Format: /qarz olish|berish SUMMA KONTRAGENT [YYYY-MM-DD]")
        return
    amount = _amount(parts[1])
    if not amount:
        await message.answer("Summa noto'g'ri")
        return
    due_date = parts[-1] if len(parts[-1]) == 10 and parts[-1][4:5] == "-" else None
    party_parts = parts[2:-1] if due_date else parts[2:]
    if not party_parts:
        await message.answer("Kontragent nomini yozing")
        return
    result = await backend.create_debt(
        message.chat.id,
        {
            "direction": "receivable" if parts[0] == "olish" else "payable",
            "counterparty": " ".join(party_parts),
            "amount": amount,
            "due_date": due_date,
        },
    )
    if error := _error(result):
        await message.answer(f"❌ {error}")
        return
    await message.answer(f"✅ Qarz #{result['id']} yaratildi: {_money(result['amount'])}")


@router.message(Command("tolov"))
async def debt_payment(message: Message, backend: BackendClient) -> None:
    parts = _args(message).split(maxsplit=2)
    if len(parts) < 2 or not parts[0].isdigit() or not (amount := _amount(parts[1])):
        await message.answer("Format: /tolov QARZ_ID SUMMA IZOH")
        return
    result = await backend.create_debt_payment(
        message.chat.id,
        int(parts[0]),
        {"amount": amount, "description": parts[2] if len(parts) == 3 else "Telegram orqali to'lov"},
    )
    if error := _error(result):
        await message.answer(f"❌ {error}")
        return
    await message.answer(f"✅ To'lov #{result['id']} yozildi. Owner tasdig'i kutilmoqda.")


@router.message(Command("hisobot"))
async def finance_report(message: Message, backend: BackendClient) -> None:
    names = {"kun": "day", "hafta": "week", "oy": "month", "day": "day", "week": "week", "month": "month"}
    period = names.get(_args(message).lower() or "kun")
    if not period:
        await message.answer("Format: /hisobot kun|hafta|oy")
        return
    result = await backend.finance_report(message.chat.id, period)
    if error := _error(result):
        await message.answer(f"❌ {error}")
        return
    await message.answer(
        f"📊 {result['period_start']} - {result['period_end']}\n"
        f"Kirim: {_money(result['income'])}\n"
        f"Chiqim: {_money(result['expense'])}\n"
        f"Foyda: {_money(result['profit'])}"
    )


@router.message(Command("buyurtma"))
async def order_finance(message: Message, backend: BackendClient) -> None:
    raw = _args(message)
    if not raw.isdigit():
        await message.answer("Format: /buyurtma ID")
        return
    result = await backend.order_finance(message.chat.id, int(raw))
    if error := _error(result):
        await message.answer(f"❌ {error}")
        return
    await message.answer(
        f"🧾 Buyurtma #{result['id']} - {result['title']}\n"
        f"Mijoz: {result['customer_name']}\n"
        f"Jami: {_money(result['total_amount'])}\n"
        f"To'langan: {_money(result['income_total'])}\n"
        f"Xarajat: {_money(result['expense_total'])}\n"
        f"Qoldiq: {_money(result['outstanding'])}\n"
        f"Foyda: {_money(result['profit'])}"
    )


@router.message(Command("tasdiq"))
async def approve_entry(message: Message, backend: BackendClient) -> None:
    raw = _args(message)
    if not raw.isdigit():
        await message.answer("Format: /tasdiq YOZUV_ID")
        return
    result = await backend.approve_finance_entry(message.chat.id, int(raw))
    if error := _error(result):
        await message.answer(f"❌ {error}")
        return
    await message.answer(f"✅ #{result['id']} tasdiqlandi: {_money(result['amount'])}")


async def _forward(message: Message, backend: BackendClient, text: str) -> None:
    user = message.from_user
    if user is None:
        return
    await message.bot.send_chat_action(message.chat.id, ChatAction.TYPING)
    reply = await backend.ask_agent(user.id, text, user.full_name, user.username)
    if reply:
        await message.answer(reply)


@router.message(F.contact)
async def contact(message: Message, backend: BackendClient) -> None:
    c = message.contact
    # Faqat o'zining raqamini qabul qilamiz (boshqa odamning kontaktini emas)
    if c is None or (message.from_user and c.user_id != message.from_user.id):
        await message.answer("Iltimos, tugma orqali o'zingizning raqamingizni yuboring.")
        return
    await _forward(message, backend, f"Mening telefon raqamim: {c.phone_number}")


@router.message(F.text)
async def text(message: Message, backend: BackendClient) -> None:
    await _forward(message, backend, message.text or "")


@router.message(F.photo | F.video | F.document)
async def media(message: Message, backend: BackendClient) -> None:
    caption = message.caption or ""
    await _forward(message, backend, f"[mijoz rasm/fayl yubordi] {caption}".strip())


@router.message(F.voice)
async def voice(message: Message) -> None:
    await message.answer("Ovozli xabarlarni hozircha qabul qila olmayman. Iltimos, matn bilan yozing 🙏")
