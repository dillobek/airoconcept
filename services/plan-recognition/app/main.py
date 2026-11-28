"""
Chizmani tanish servisi (ichki). Faqat API serveri INTERNAL_SERVICE_TOKEN bilan chaqiradi.

  POST /v1/plans/dxf   — DXF fayldan xonalar (aniq)
  POST /v1/plans/image — rasm/PDF (2-bosqich: neyron tarmoq) — hozircha 501
"""
from __future__ import annotations

import hmac
import io
import os
import tempfile

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

from .geometry import Label, rooms_from_polygons

MAX_BYTES = 20 * 1024 * 1024
TOKEN = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
if len(TOKEN) < 32:
    raise RuntimeError("INTERNAL_SERVICE_TOKEN kamida 32 belgi bo'lishi kerak")

app = FastAPI(title="plan-recognition", docs_url=None, redoc_url=None, openapi_url=None)


def _auth(token: str | None) -> None:
    if not token or not hmac.compare_digest(token.encode(), TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Ruxsat yo'q")


async def _read_limited(file: UploadFile) -> bytes:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Fayl 20 MB dan katta")
    if not data:
        raise HTTPException(status_code=400, detail="Fayl bo'sh")
    return data


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/v1/plans/dxf")
async def parse_dxf(file: UploadFile = File(...), x_internal_token: str | None = Header(default=None)) -> dict:
    _auth(x_internal_token)
    data = await _read_limited(file)
    if data[:6] == b"AC1027" or data[:4] == b"AC10":
        raise HTTPException(status_code=415, detail="Bu DWG fayl. Avval DXF ga o'tkazing (ODA File Converter)")

    try:
        import ezdxf
        from ezdxf import recover
    except ImportError as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail="ezdxf o'rnatilmagan") from e

    # Fayl faqat vaqtinchalik papkaga yoziladi va darhol o'chiriladi; nom bizniki (foydalanuvchi nomi ishlatilmaydi)
    with tempfile.NamedTemporaryFile(suffix=".dxf", dir="/tmp", delete=True) as tmp:
        tmp.write(data)
        tmp.flush()
        try:
            doc, auditor = recover.readfile(tmp.name)
        except (OSError, ezdxf.DXFStructureError):
            raise HTTPException(status_code=422, detail="DXF faylni o'qib bo'lmadi")

    unit = int(doc.header.get("$INSUNITS", 0) or 0)
    msp = doc.modelspace()
    polygons: list[list[tuple[float, float]]] = []
    for e in msp.query("LWPOLYLINE POLYLINE"):
        try:
            closed = bool(e.closed) if e.dxftype() == "LWPOLYLINE" else bool(e.is_closed)
            if not closed:
                continue
            pts = [(p[0], p[1]) for p in (e.get_points("xy") if e.dxftype() == "LWPOLYLINE" else e.points())]
            polygons.append(pts)
        except Exception:  # noqa: BLE001 — buzilgan obyekt o'tkazib yuboriladi
            continue

    labels: list[Label] = []
    for t in msp.query("TEXT MTEXT"):
        try:
            text = t.plain_text() if t.dxftype() == "MTEXT" else t.dxf.text
            ins = t.dxf.insert
            labels.append(Label(text=str(text), at=(ins[0], ins[1])))
        except Exception:  # noqa: BLE001
            continue

    rooms = rooms_from_polygons(polygons, labels, unit)
    return {
        "unitCode": unit,
        "rooms": [r.as_dict() for r in rooms],
        "totalAreaM2": round(sum(r.area_m2 for r in rooms), 2),
        "warnings": [str(m) for m in auditor.errors][:20] if auditor.has_errors else [],
        "needsReview": True,
    }


@app.post("/v1/plans/image")
async def parse_image(file: UploadFile = File(...), x_internal_token: str | None = Header(default=None)) -> dict:
    _auth(x_internal_token)
    await _read_limited(file)
    raise HTTPException(status_code=501, detail="Rasm va PDF rejalarni tanish 2-bosqichda qo'shiladi. Hozircha DXF yuklang yoki rejani qo'lda chizing.")
