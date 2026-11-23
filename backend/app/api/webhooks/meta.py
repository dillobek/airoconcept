"""Meta webhook: GET — tasdiqlash, POST — imzo tekshiruvi va navbatga qo'yish."""

import hmac
import json

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.core.config import settings
from app.core.logging import log
from app.core.security import verify_meta_signature

router = APIRouter(prefix="/webhooks/meta", tags=["webhooks"])


@router.get("", include_in_schema=False)
async def verify(
    mode: str = Query(alias="hub.mode"),
    token: str = Query(alias="hub.verify_token"),
    challenge: str = Query(alias="hub.challenge"),
) -> Response:
    expected = settings.META_VERIFY_TOKEN.get_secret_value()
    if mode == "subscribe" and expected and hmac.compare_digest(token, expected):
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(403, "Verify token noto'g'ri")


@router.post("", include_in_schema=False)
async def receive(request: Request) -> dict:
    body = await request.body()
    if not verify_meta_signature(
        body, request.headers.get("X-Hub-Signature-256"), settings.META_APP_SECRET.get_secret_value()
    ):
        log.warning("meta_webhook.bad_signature")
        raise HTTPException(403, "Imzo noto'g'ri")

    payload = json.loads(body)
    # Meta'ga darhol 200 qaytaramiz, og'ir ish (LLM) workerda bajariladi
    await request.app.state.enqueue("process_meta_event", payload)
    return {"ok": True}
