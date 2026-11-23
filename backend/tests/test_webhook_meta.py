import hashlib
import hmac
import json

from app.channels.meta import meta_adapter


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(b"meta-secret", body, hashlib.sha256).hexdigest()


async def test_verify_ok(client):
    r = await client.get(
        "/webhooks/meta", params={"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345"}
    )
    assert r.status_code == 200 and r.text == "12345"


async def test_verify_wrong_token(client):
    r = await client.get(
        "/webhooks/meta", params={"hub.mode": "subscribe", "hub.verify_token": "bad", "hub.challenge": "1"}
    )
    assert r.status_code == 403


async def test_post_rejects_bad_signature(client, enqueued):
    r = await client.post("/webhooks/meta", content=b"{}", headers={"X-Hub-Signature-256": "sha256=abc"})
    assert r.status_code == 403 and enqueued == []


async def test_post_enqueues_valid(client, enqueued):
    payload = {
        "object": "instagram",
        "entry": [{"messaging": [{"sender": {"id": "42"}, "message": {"text": "Salom"}}]}],
    }
    body = json.dumps(payload).encode()
    r = await client.post("/webhooks/meta", content=body, headers={"X-Hub-Signature-256": _sign(body)})
    assert r.status_code == 200
    assert enqueued[0][0] == "process_meta_event"


def test_parse_skips_echo_and_unknown():
    payload = {
        "object": "page",
        "entry": [
            {
                "messaging": [
                    {"sender": {"id": "1"}, "message": {"text": "Narxi qancha?"}},
                    {"sender": {"id": "2"}, "message": {"text": "bizniki", "is_echo": True}},
                    {"sender": {"id": "3"}, "message": {"attachments": [{"type": "image"}]}},
                ]
            }
        ],
    }
    msgs = meta_adapter.parse(payload)
    assert [(m.channel, m.sender_id) for m in msgs] == [("messenger", "1"), ("messenger", "3")]
    assert meta_adapter.parse({"object": "whatsapp_business_account"}) == []
