from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# Production'da hisoblagich Redis'da saqlanadi (bir nechta worker bo'lsa ham to'g'ri ishlaydi)
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL if settings.is_production else "memory://",
    default_limits=["300/minute"],
)
