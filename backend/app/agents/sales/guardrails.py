"""Kirish va chiqish filtrlari."""

import re

MAX_INPUT_CHARS = 2000
MAX_OUTPUT_CHARS = 1500

_LEAK_PATTERNS = [
    re.compile(r"aic_live_[A-Za-z0-9_\-]+"),
    re.compile(r"EAA[A-Za-z0-9]{20,}"),
    re.compile(r"sk-ant-[A-Za-z0-9_\-]+"),
    re.compile(r"\d{8,10}:[A-Za-z0-9_\-]{30,}"),
]
_PROMPT_LEAK_MARKERS = ["ASOSIY MAQSAD:", "SUHBAT TARTIBI:", "QOIDALAR:", "input_schema"]

SAFE_FALLBACK = "Rahmat! Savolingizni menejerimizga yetkazdim, tez orada siz bilan bog'lanadi."


def clean_input(text: str) -> str | None:
    text = (text or "").strip()
    if not text:
        return None
    return text[:MAX_INPUT_CHARS]


def filter_output(text: str) -> str:
    """Javobda maxfiy narsa yoki tizim ko'rsatmalari bo'lsa — xavfsiz javob bilan almashtiriladi."""
    if any(m in text for m in _PROMPT_LEAK_MARKERS):
        return SAFE_FALLBACK
    for p in _LEAK_PATTERNS:
        if p.search(text):
            return SAFE_FALLBACK
    return text.strip()[:MAX_OUTPUT_CHARS]
