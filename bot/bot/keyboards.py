from aiogram.types import KeyboardButton, ReplyKeyboardMarkup, WebAppInfo

from bot.config import settings

keyboard_rows = []
if settings.WEBAPP_URL:
    keyboard_rows.append([KeyboardButton(text="🛋 Katalogni ochish", web_app=WebAppInfo(url=settings.WEBAPP_URL))])
keyboard_rows.append([KeyboardButton(text="📞 Raqamni yuborish", request_contact=True)])

contact_keyboard = ReplyKeyboardMarkup(
    keyboard=keyboard_rows,
    resize_keyboard=True,
    one_time_keyboard=True,
)
