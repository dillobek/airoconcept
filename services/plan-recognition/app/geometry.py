"""
Uy rejasi geometriyasi — tashqi kutubxonalarsiz, alohida test qilinadi.

Kirish: yopiq poliliniyalar (xona konturlari) va matn yorliqlari (xona nomlari), chizma birligida.
Chiqish: metrdagi xonalar — maydon, o'lcham, nom.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

Point = tuple[float, float]

# DXF $INSUNITS kodi -> metrga ko'paytuvchi
UNIT_TO_M: dict[int, float] = {
    0: 0.001,  # birlik ko'rsatilmagan: O'zbekistondagi chizmalarda odatda millimetr
    1: 0.0254,  # dyuym
    2: 0.3048,  # fut
    4: 0.001,  # mm
    5: 0.01,  # sm
    6: 1.0,  # m
}

MIN_ROOM_M2 = 1.0
MAX_ROOM_M2 = 300.0
MAX_POLYGONS = 5000
MAX_VERTICES = 2000


@dataclass
class Label:
    text: str
    at: Point


@dataclass
class Room:
    name: str
    area_m2: float
    length_m: float
    width_m: float
    polygon_m: list[Point] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "areaM2": round(self.area_m2, 2),
            "lengthM": round(self.length_m, 2),
            "widthM": round(self.width_m, 2),
            "polygon": [[round(x, 3), round(y, 3)] for x, y in self.polygon_m],
        }


def polygon_area(pts: Sequence[Point]) -> float:
    """Shoelace formulasi, mutlaq qiymat."""
    n = len(pts)
    if n < 3:
        return 0.0
    s = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def bbox(pts: Sequence[Point]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def point_in_polygon(pt: Point, poly: Sequence[Point]) -> bool:
    """Nur tashlash (ray casting) usuli."""
    x, y = pt
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def _clean_label(text: str) -> str:
    t = " ".join(text.replace("\\P", " ").split())
    return t[:60]


def rooms_from_polygons(polygons: Iterable[Sequence[Point]], labels: Iterable[Label], unit_code: int) -> list[Room]:
    """
    Yopiq konturlardan xonalarni ajratadi:
      - birlikni metrga o'tkazadi;
      - juda kichik (kolonna, shaxta) va juda katta (butun qavat konturi) shakllarni tashlaydi;
      - takror konturlarni (bir xil maydon va markaz) bitta qiladi;
      - kontur ichidagi matnni xona nomi sifatida oladi.
    """
    k = UNIT_TO_M.get(unit_code, 0.001)
    labels = list(labels)
    rooms: list[Room] = []
    seen: set[tuple[int, int, int]] = set()
    for count, raw in enumerate(polygons):
        if count >= MAX_POLYGONS:
            break
        if len(raw) < 3 or len(raw) > MAX_VERTICES:
            continue
        pts = [(float(x) * k, float(y) * k) for x, y in raw]
        area = polygon_area(pts)
        if not (MIN_ROOM_M2 <= area <= MAX_ROOM_M2):
            continue
        x0, y0, x1, y1 = bbox(pts)
        key = (round(area * 10), round((x0 + x1) * 5), round((y0 + y1) * 5))
        if key in seen:
            continue
        seen.add(key)
        name = ""
        for lb in labels:
            if point_in_polygon((lb.at[0] * k, lb.at[1] * k), pts):
                name = _clean_label(lb.text)
                break
        w, h = x1 - x0, y1 - y0
        rooms.append(Room(name=name or f"Xona {len(rooms) + 1}", area_m2=area, length_m=max(w, h), width_m=min(w, h), polygon_m=pts))
    # Ichma-ich konturlar: agar kichik xona kattasining ichida bo'lsa va kattasi ~ yig'indisiga teng bo'lsa — kattasini (kvartira konturi) tashlaymiz
    result = []
    for r in rooms:
        inner = [o for o in rooms if o is not r and o.area_m2 < r.area_m2 and point_in_polygon(_centroid(o.polygon_m), r.polygon_m)]
        if len(inner) >= 2 and sum(o.area_m2 for o in inner) >= 0.7 * r.area_m2:
            continue
        result.append(r)
    result.sort(key=lambda r: -r.area_m2)
    return result


def _centroid(pts: Sequence[Point]) -> Point:
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
