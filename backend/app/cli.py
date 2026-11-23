"""Boshqaruv buyruqlari.

uv run python -m app.cli create-user --email owner@airoconcept.uz --name "Ega" --role owner
uv run python -m app.cli create-api-key --name "Telegram bot" --scopes agent:chat
uv run python -m app.cli gen-keys
uv run python -m app.cli export-openapi > openapi.json
"""

import argparse
import asyncio
import getpass
import json
import secrets
import sys

from cryptography.fernet import Fernet


async def create_user(email: str, name: str, role: str) -> None:
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.core.security import hash_password
    from app.models import Role, User

    Role(role)  # tekshiruv
    password = getpass.getpass("Parol (kamida 12 belgi): ")
    if len(password) < 12:
        sys.exit("Parol juda qisqa")
    if password != getpass.getpass("Parolni takrorlang: "):
        sys.exit("Parollar mos emas")
    async with SessionLocal() as db:
        if (await db.execute(select(User).where(User.email == email.lower()))).scalar_one_or_none():
            sys.exit("Bu email bilan foydalanuvchi bor")
        db.add(User(email=email.lower(), full_name=name, role=role, password_hash=hash_password(password)))
        await db.commit()
    print(f"✅ Foydalanuvchi yaratildi: {email} ({role})")


async def create_api_key(name: str, scopes: list[str]) -> None:
    from app.core.db import SessionLocal
    from app.core.security import generate_api_key
    from app.models import ApiKey
    from app.schemas import ALLOWED_SCOPES

    bad = set(scopes) - ALLOWED_SCOPES
    if bad:
        sys.exit(f"Noto'g'ri scope: {bad}. Ruxsat etilganlar: {sorted(ALLOWED_SCOPES)}")
    raw, prefix, key_hash = generate_api_key()
    async with SessionLocal() as db:
        db.add(ApiKey(name=name, prefix=prefix, key_hash=key_hash, scopes=scopes))
        await db.commit()
    print("✅ API kalit yaratildi. U FAQAT HOZIR ko'rsatiladi, darhol saqlang:\n")
    print(raw)


def gen_keys() -> None:
    print(f"SECRET_KEY={secrets.token_urlsafe(48)}")
    print(f"ENCRYPTION_KEY={Fernet.generate_key().decode()}")
    print(f"META_VERIFY_TOKEN={secrets.token_urlsafe(24)}")


def export_openapi() -> None:
    from app.main import app

    print(json.dumps(app.openapi(), ensure_ascii=False, indent=2))


def main() -> None:
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    u = sub.add_parser("create-user")
    u.add_argument("--email", required=True)
    u.add_argument("--name", required=True)
    u.add_argument("--role", default="manager", choices=["owner", "manager", "accountant", "worker"])
    k = sub.add_parser("create-api-key")
    k.add_argument("--name", required=True)
    k.add_argument("--scopes", required=True, help="vergul bilan: agent:chat,leads:write")
    sub.add_parser("gen-keys")
    sub.add_parser("export-openapi")
    a = p.parse_args()

    if a.cmd == "create-user":
        asyncio.run(create_user(a.email, a.name, a.role))
    elif a.cmd == "create-api-key":
        asyncio.run(create_api_key(a.name, [s.strip() for s in a.scopes.split(",") if s.strip()]))
    elif a.cmd == "gen-keys":
        gen_keys()
    elif a.cmd == "export-openapi":
        export_openapi()


if __name__ == "__main__":
    main()
