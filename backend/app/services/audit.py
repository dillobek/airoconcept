from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def audit(
    db: AsyncSession,
    actor: str,
    action: str,
    entity: str | None = None,
    entity_id: int | str | None = None,
    data: dict | None = None,
    ip: str | None = None,
    note: str | None = None,
) -> None:
    db.add(
        AuditLog(
            actor=actor,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            data=data or {},
            ip=ip,
            note=note,
        )
    )
