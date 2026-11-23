import logging
import re

import structlog

# Loglarga token va kalitlar tushib qolmasligi uchun
_SECRET_PATTERNS = [
    re.compile(r"(aic_live_)[A-Za-z0-9_\-]{6,}"),
    re.compile(r"(EAA)[A-Za-z0-9]{10,}"),  # Meta tokenlari
    re.compile(r"(sk-ant-)[A-Za-z0-9_\-]{6,}"),
    re.compile(r"(\d{8,10}:)[A-Za-z0-9_\-]{30,}"),  # Telegram bot token
]


def mask_secrets(text: str) -> str:
    for p in _SECRET_PATTERNS:
        text = p.sub(r"\1***", text)
    return text


def _mask_processor(_logger, _name, event_dict):
    for k, v in list(event_dict.items()):
        if isinstance(v, str):
            event_dict[k] = mask_secrets(v)
    return event_dict


def setup_logging(debug: bool = False) -> None:
    logging.basicConfig(level=logging.DEBUG if debug else logging.INFO, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _mask_processor,
            structlog.processors.JSONRenderer(),
        ]
    )


log = structlog.get_logger()
