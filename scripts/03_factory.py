"""DAT-04·DAT-05: 등록공장·119안전센터 주소 지오코딩 → 건물 연결·거리 계산.

01_buildings.py, 02_industry.py 실행 뒤에 돌린다. 지오코딩 결과는 data/geocode/에 캐시한다.
입력  data/raw/factory.csv, data/raw/station119.csv, data/factory_industry.json, public/data/buildings.*
출력  public/data/buildings.json(회사·업종·119 거리 추가, 용도 결측 대상 재판정), buildings.geojson.gz,
      public/data/station.geojson, data/quality/factory.json
"""
import csv
import gzip
import json
import os
import re
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
CACHE = ROOT / "data" / "geocode"
RANK = {"HIGH": 2, "MFG": 1, None: 0}
SRC_FAC = "한국산업단지공단 전국등록공장현황(15105482, 2025-12-31)"
SRC_119 = "소방청 119안전센터 현황(15065056, 2026-07-01)"


def api_key():
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("NEXT_PUBLIC_VWORLD_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("NEXT_PUBLIC_VWORLD_KEY 없음")


def vworld(params):
    url = "https://api.vworld.kr/req/address?" + urllib.parse.urlencode({"service": "address", "format": "json", "crs": "epsg:4326", **params})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=10) as res:
                return json.load(res)["response"]
        except Exception:
            time.sleep(1 + attempt)
    return {"status": "ERROR"}


def clean(addr):
    """동·호·층 등 상세를 떼고 도로명+건물번호 또는 지번까지만 남긴다."""
    a = re.sub(r"\(.*?\)", " ", addr).split(",")[0]
    a = re.sub(r"\s+\d+층.*$|\s+\d+호.*$|\s+[A-Za-z가-힣]*동\s*\d*호?$", "", a)
    return re.sub(r"\s+", " ", a).strip()


class Geocoder:
    def __init__(self, name, key):
        self.path = CACHE / f"{name}.json"
        self.key = key
        self.cache = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}

    def coord(self, addr):
        q = clean(addr)
        if q not in self.cache:
            hit = None
            for kind in ("road", "parcel"):
                r = vworld({"request": "getcoord", "type": kind, "address": q, "key": self.key})
                if r.get("status") == "OK":
                    p = r["result"]["point"]
                    hit = {"lon": float(p["x"]), "lat": float(p["y"]), "type": kind}
                    break
            self.cache[q] = hit
            time.sleep(0.05)
        return self.cache[q]

    def parcel(self, lon, lat):
        """좌표 → 지번 주소(법정동명 + 지번). 같은 필지 건물을 찾는 데 쓴다."""
        k = f"rev:{lon:.6f},{lat:.6f}"
        if k not in self.cache:
            r = vworld({"request": "getAddress", "type": "parcel", "point": f"{lon},{lat}", "key": self.key})
            self.cache[k] = r["result"][0]["text"] if r.get("status") == "OK" else None
            time.sleep(0.05)
        return self.cache[k]

    def save(self):
        CACHE.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.cache, ensure_ascii=False, indent=0), encoding="utf-8")


def norm_lot(text):
    return re.sub(r"\s+", " ", (text or "").replace("번지", "")).strip()


def main():
    key = api_key()
    data = json.loads((OUT / "buildings.json").read_text(encoding="utf-8"))
    blds = data["buildings"]
    by_id = {b["bld_id"]: b for b in blds}
    with gzip.open(OUT / "buildings.geojson.gz", "rt", encoding="utf-8") as f:
        geo = json.load(f)
    geoms = [shape(ft["geometry"]) for ft in geo["features"]]
    ids = [ft["properties"]["bld_id"] for ft in geo["features"]]
    tree = STRtree(geoms)
    by_lot = {}
    for b in blds:
        by_lot.setdefault(norm_lot(b["addr"]), []).append(b["bld_id"])
        b["companies"], b["industry"], b["dist_119_m"] = [], None, None

    # --- 등록공장
    industry = {x["seq"]: x for x in json.loads((ROOT / "data" / "factory_industry.json").read_text(encoding="utf-8"))}
    with open(RAW / "factory.csv", encoding="cp949", newline="") as f:
        factories = [r for r in csv.DictReader(f) if "오창" in r["공장주소"] or "오창" in r["단지명"]]
    g = Geocoder("factory", key)
    stats, search = Counter(), []
    for i, r in enumerate(factories):
        ind = industry.get(r["순번"], {})
        entry = {"company": r["회사명"].strip(), "product": r["생산품"].strip() or None, "complex": r["단지명"].strip() or None,
                 "addr": clean(r["공장주소"]), "industry": ind.get("industry"), "group": ind.get("group"), "match": "NONE", "bld_ids": []}
        pt = g.coord(r["공장주소"])
        if pt is None:
            stats["geocode_fail"] += 1
        else:
            entry["lon"], entry["lat"] = round(pt["lon"], 6), round(pt["lat"], 6)
            p = Point(pt["lon"], pt["lat"])
            inside = [ids[j] for j in tree.query(p) if geoms[j].contains(p)]
            if inside:
                # 좌표가 떨어진 동 + 같은 필지의 다른 동(공장은 필지 단위로 쓰므로 함께 연결, 동 구분 불가)
                mates = [i for i in by_lot.get(norm_lot(by_id[inside[0]]["addr"]), []) if i != inside[0]]
                entry["match"], entry["bld_ids"] = "CONTAIN", inside[:1] + mates
            else:
                lot = by_lot.get(norm_lot(g.parcel(pt["lon"], pt["lat"])), [])
                if lot:
                    entry["match"], entry["bld_ids"] = "PNU", lot
        stats[entry["match"]] += 1
        for bid in entry["bld_ids"]:
            b = by_id[bid]
            own = entry["match"] == "CONTAIN" and bid == entry["bld_ids"][0]
            b["companies"].append({**{k: entry[k] for k in ("company", "product", "industry", "group")}, "match": "CONTAIN" if own else "PNU",
                                   "mate": entry["match"] == "CONTAIN" and not own})
            if RANK[entry["industry"]] > RANK[b["industry"]]:
                b["industry"] = entry["industry"]
        search.append(entry)
        if i % 100 == 99:
            g.save()
    g.save()

    # --- BR-D1: 용도 결측이어도 등록공장이 연결되면 대상
    promoted = 0
    for b in blds:
        # 같은 필지라는 이유만으로 붙은 회사(mate)는 대상 승격 근거로 쓰지 않는다(소형 부속 건물로 대상 수가 부풀지 않게)
        if not b["target"] and b["use"] is None and any(not c["mate"] for c in b["companies"]):
            b["target"] = True
            promoted += 1
    target = {b["bld_id"]: b["target"] for b in blds}
    for ft in geo["features"]:
        ft["properties"]["target"] = target[ft["properties"]["bld_id"]]

    # --- 119안전센터(충북)
    with open(RAW / "station119.csv", encoding="cp949", newline="") as f:
        stations = [r for r in csv.DictReader(f) if r["시도본부"].strip() == "충청북도"]
    gs = Geocoder("station119", key)
    to5186 = Transformer.from_crs(4326, 5186, always_xy=True).transform
    pts, feats, failed = [], [], []
    for r in stations:
        pt = gs.coord(r["주소"])
        if pt is None:
            failed.append(r["119안전센터명"])
            continue
        pts.append(to5186(pt["lon"], pt["lat"]))
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(pt["lon"], 6), round(pt["lat"], 6)]},
                      "properties": {"name": r["119안전센터명"].strip(), "station": r["소방서명"].strip(), "addr": clean(r["주소"]), "source": SRC_119}})
    gs.save()
    for b, geom in zip([by_id[i] for i in ids], geoms):
        c = geom.representative_point()
        x, y = to5186(c.x, c.y)
        if pts:
            b["dist_119_m"] = round(min(((x - px) ** 2 + (y - py) ** 2) ** 0.5 for px, py in pts))

    data["meta"]["factory_source"] = SRC_FAC
    (OUT / "buildings.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with gzip.open(OUT / "buildings.geojson.gz", "wt", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))
    (OUT / "station.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    (OUT / "factories.json").write_text(json.dumps({"source": SRC_FAC, "factories": search}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    tgt = [b for b in blds if b["target"]]
    q = {
        "factories": len(factories), "match": {k: stats[k] for k in ("CONTAIN", "PNU", "NONE")}, "geocode_fail": stats["geocode_fail"],
        "buildings_with_company": sum(1 for b in blds if b["companies"]),
        "target": len(tgt), "target_with_company": sum(1 for b in tgt if b["companies"]),
        "target_industry": dict(Counter(b["industry"] or "미매칭" for b in tgt)),
        "promoted_use_null": promoted, "target_use_null": sum(1 for b in tgt if b["use"] is None),
        "stations": {"total": len(stations), "geocoded": len(feats), "failed": failed},
        "dist_119_ok": sum(1 for b in blds if b["dist_119_m"] is not None),
    }
    (ROOT / "data" / "quality" / "factory.json").write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(q, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
