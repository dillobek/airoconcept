from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.api.webhooks import meta as meta_webhook
from app.core.config import settings
from app.core.logging import log, setup_logging
from app.core.ratelimit import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(settings.DEBUG)
    pool = None
    try:
        from arq import create_pool
        from arq.connections import RedisSettings

        redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
        redis_settings.conn_retries = 2  # Redis yo'q bo'lsa API ishga tushishini kechiktirmaslik uchun
        pool = await create_pool(redis_settings)

        async def enqueue(fn: str, *args):
            await pool.enqueue_job(fn, *args)

        app.state.enqueue = enqueue
    except Exception as e:  # Redis bo'lmasa API baribir ishlaydi, webhook esa 503 beradi
        log.error("redis.unavailable", error=str(e))

        async def enqueue_unavailable(fn: str, *args):
            from fastapi import HTTPException

            raise HTTPException(503, "Navbat (Redis) ishlamayapti")

        app.state.enqueue = enqueue_unavailable
    yield
    if pool is not None:
        await pool.aclose()


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description=(
        "AiroConcept AI agent tizimi API. Autentifikatsiya: admin panel uchun httpOnly cookie, "
        "tashqi dasturlar uchun `X-API-Key` header (scope'lar bilan)."
    ),
    lifespan=lifespan,
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


@app.get("/health", tags=["system"])
async def health() -> dict:
    return {"status": "ok"}


app.include_router(api_router)
app.include_router(meta_webhook.router)
