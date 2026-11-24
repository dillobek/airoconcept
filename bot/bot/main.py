"""Ishga tushirish: uv run python -m bot.main"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.exceptions import TelegramRetryAfter
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiogram.types import MenuButtonWebApp, WebAppInfo
from aiohttp import web

from bot.backend import BackendClient
from bot.config import settings
from bot.handlers import router
from bot.middlewares import ThrottleMiddleware


def build() -> tuple[Bot, Dispatcher, BackendClient]:
    bot = Bot(settings.BOT_TOKEN.get_secret_value(), default=DefaultBotProperties(parse_mode=None))
    backend = BackendClient(settings.BACKEND_URL, settings.BACKEND_API_KEY.get_secret_value())
    dp = Dispatcher(backend=backend)  # handlerlarga `backend` argumenti sifatida uzatiladi
    dp.message.middleware(ThrottleMiddleware(min_interval=1.0))
    dp.include_router(router)
    return bot, dp, backend


async def configure_webapp(bot: Bot) -> None:
    if settings.WEBAPP_URL:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="AiroConcept", web_app=WebAppInfo(url=settings.WEBAPP_URL))
        )


async def run_polling() -> None:
    bot, dp, backend = build()
    await bot.delete_webhook(drop_pending_updates=False)
    await configure_webapp(bot)
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await backend.close()


def run_webhook() -> None:
    if not settings.WEBHOOK_BASE_URL or not settings.WEBHOOK_SECRET.get_secret_value():
        raise SystemExit("Webhook rejimi uchun WEBHOOK_BASE_URL va WEBHOOK_SECRET kerak")
    bot, dp, backend = build()
    secret = settings.WEBHOOK_SECRET.get_secret_value()

    async def on_startup() -> None:
        while True:
            try:
                await bot.set_webhook(
                    settings.WEBHOOK_BASE_URL.rstrip("/") + settings.WEBHOOK_PATH,
                    secret_token=secret,
                    allowed_updates=dp.resolve_used_update_types(),
                )
                break
            except TelegramRetryAfter as exc:
                logging.warning("Telegram webhook limiti: %s soniyadan keyin qayta urinish", exc.retry_after)
                await asyncio.sleep(exc.retry_after + 1)
        await configure_webapp(bot)

    async def on_shutdown() -> None:
        await backend.close()

    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)
    app = web.Application()
    # secret_token mos kelmagan so'rovlar avtomatik rad etiladi
    SimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=secret).register(app, path=settings.WEBHOOK_PATH)
    app.router.add_get("/health", lambda _: web.json_response({"status": "ok"}))
    setup_application(app, dp, bot=bot)
    web.run_app(app, host=settings.WEB_HOST, port=settings.WEB_PORT)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if settings.BOT_MODE == "webhook":
        run_webhook()
    else:
        asyncio.run(run_polling())


if __name__ == "__main__":
    main()
