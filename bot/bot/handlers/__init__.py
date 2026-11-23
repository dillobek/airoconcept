from aiogram import F, Router
from aiogram.enums import ChatAction, ChatType
from aiogram.filters import CommandStart
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


@router.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(WELCOME, reply_markup=contact_keyboard)


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
