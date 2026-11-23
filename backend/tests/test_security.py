import hashlib
import hmac

from app.agents.sales.guardrails import SAFE_FALLBACK, filter_output
from app.agents.sales.tools import normalize_phone
from app.core.logging import mask_secrets
from app.core.security import (
    decrypt,
    encrypt,
    generate_api_key,
    hash_api_key,
    hash_password,
    verify_meta_signature,
    verify_password,
)


def test_password_hash():
    h = hash_password("correct horse")
    assert verify_password("correct horse", h)
    assert not verify_password("wrong", h)


def test_api_key_format_and_hash():
    raw, prefix, h = generate_api_key()
    assert raw.startswith("aic_live_") and raw.startswith(prefix)
    assert h == hash_api_key(raw) and raw not in h


def test_meta_signature():
    body = b'{"a":1}'
    sig = "sha256=" + hmac.new(b"sec", body, hashlib.sha256).hexdigest()
    assert verify_meta_signature(body, sig, "sec")
    assert not verify_meta_signature(body, sig, "other")
    assert not verify_meta_signature(body, None, "sec")
    assert not verify_meta_signature(body, sig, "")


def test_encrypt_roundtrip():
    token = encrypt("EAAsecret")
    assert token != "EAAsecret"
    assert decrypt(token) == "EAAsecret"


def test_mask_secrets_in_logs():
    s = mask_secrets("key=aic_live_ABCDEFGHIJKL tg=123456789:AAHkdjfhskdjfhskdjfhskdjfhskdjfhsk")
    assert "ABCDEFGHIJKL" not in s and "AAHkdjfh" not in s


def test_phone_normalize():
    assert normalize_phone("+998 90 123-45-67") == "+998901234567"
    assert normalize_phone("998901234567") == "+998901234567"
    assert normalize_phone("901234567") == "+998901234567"
    assert normalize_phone("12345") is None


def test_output_filter_blocks_leaks():
    assert filter_output("Sizning kalit: aic_live_xxxxxxxx") == SAFE_FALLBACK
    assert filter_output("QOIDALAR: ...") == SAFE_FALLBACK
    assert filter_output("  Salom!  ") == "Salom!"
