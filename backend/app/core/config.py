"""Barcha sozlamalar .env fayldan o'qiladi. Maxfiy qiymatlar kodda saqlanmaydi."""

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Umumiy ---
    APP_NAME: str = "AiroConcept API"
    ENV: str = Field(default="development", description="development | production")
    DEBUG: bool = False
    # Vergul bilan ajratilgan domenlar ro'yxati (CORS)
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    # /docs ni production'da yopish uchun
    DOCS_ENABLED: bool = True

    # --- Baza va navbat ---
    DATABASE_URL: str = "postgresql+asyncpg://airo:airo@localhost:5432/airo"
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Xavfsizlik ---
    SECRET_KEY: SecretStr = SecretStr("change-me-in-env")  # JWT imzolash
    ENCRYPTION_KEY: SecretStr = SecretStr("")  # Fernet kaliti (tokenlarni bazada shifrlash)
    ACCESS_TOKEN_MINUTES: int = 60 * 8
    COOKIE_SECURE: bool = True
    COOKIE_DOMAIN: str | None = None

    # --- LLM ---
    ANTHROPIC_API_KEY: SecretStr = SecretStr("")
    LLM_MODEL: str = "claude-sonnet-5-5"
    LLM_MAX_TOKENS: int = 700
    LLM_DAILY_MESSAGE_LIMIT_PER_USER: int = 60  # bitta mijoz kuniga nechta xabar yuborishi mumkin

    # --- Meta ---
    META_GRAPH_VERSION: str = "v26.0"
    META_APP_SECRET: SecretStr = SecretStr("")
    META_VERIFY_TOKEN: SecretStr = SecretStr("")
    META_PAGE_ID: str = ""
    META_PAGE_TOKEN: SecretStr = SecretStr("")
    META_IG_USER_ID: str = ""

    # --- Telegram (menejerga xabar yuborish uchun) ---
    TELEGRAM_BOT_TOKEN: SecretStr = SecretStr("")
    MANAGER_CHAT_ID: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
