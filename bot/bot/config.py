from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    BOT_TOKEN: SecretStr
    # Backend API manzili va "agent:chat" scope'li API kalit
    BACKEND_URL: str = "http://localhost:8000"
    BACKEND_API_KEY: SecretStr

    # polling — lokal ishlab chiqish uchun, webhook — serverda
    BOT_MODE: str = "polling"
    WEBHOOK_BASE_URL: str = ""  # masalan https://bot.airoconcept.uz
    WEBHOOK_PATH: str = "/tg/webhook"
    WEBHOOK_SECRET: SecretStr = SecretStr("")  # Telegram X-Telegram-Bot-Api-Secret-Token
    WEB_HOST: str = "0.0.0.0"  # konteyner ichida barcha interfeyslar
    WEB_PORT: int = 8081


settings = Settings()  # type: ignore[call-arg]
