"""DAT-14: 대상 건물이 속한 산업단지 '유치업종 구역'에 발전업(KSIC D35)이 들어 있는지 판정한다.

구역 원본(둘 중 하나, data/raw/zoning — gitignore)
  1) DAM_YUCH.shp : 브이월드 '산업단지 유치업종도면'(data.go.kr 3069836). 로그인해야 받을 수 있어 사람이 받아 넣는다. 있으면 이것을 쓴다.
  2) LT_C_DAMYUCH.json : 브이월드 2D데이터 API '단지유치업종'(data.go.kr 15058209, LINK형)을 건물 범위(BOX)로 조회한 캐시. SHP가 없으면 이것을 쓴다.
구역 하나 = (단지명, 업종분류명, 유치업종명) + 도형. 같은 땅에 여러 업종 구역이 겹쳐 있으므로 건물 대표점이 들어가는 구역을 모두 모은다.
판정  유치업종 원문에 '전기, 가스' '전기업' '발전업' '태양력' 이 있거나 KSIC 코드 35·351·3511·35113(D 접두 허용)이 있으면 d35=true.
      '전기장비'(C28)는 걸리지 않는다. 구역 밖 건물은 zone=null, d35=false.
출력  data/zoning.json (판정 결과만 — 구역 도형은 저장하지 않는다)
"""
import gzip
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "zoning"
CACHE = RAW / "LT_C_DAMYUCH.json"
URL = "https://api.vworld.kr/req/data"
DOMAIN = "https://dasel-weld.vercel.app"  # 브이월드 인증키에 등록된 도메인
SRC_API = "국토교통부 단지유치업종(브이월드 2D데이터 API LT_C_DAMYUCH, data.go.kr 15058209)"
SRC_SHP = "국토교통부 산업단지 유치업종도면(브이월드 DAM_YUCH, data.go.kr 3069836)"
BASE_DATE = "2026-04-08"  # 브이월드 레퍼런스에 적힌 갱신일(도면 파일 갱신일은 2026-04-07)

D35_TEXT = re.compile(r"전기\s*,\s*가스|전기업|발전업|태양력")
D35_CODE = re.compile(r"(?<![0-9A-Za-z])(?:D\s*)?(?:35113|3511|351|35)(?![0-9])")
KSIC = re.compile(r"(?<![0-9A-Za-z])[A-U]?\d{2,5}(?![0-9])")


def api_key():
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("NEXT_PUBLIC_VWORLD_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("NEXT_PUBLIC_VWORLD_KEY 없음")


def is_d35(text):
    return bool(D35_TEXT.search(text) or D35_CODE.search(text))


def zones_from_api(box):
    """건물 범위 안의 구역을 조회한다. 캐시가 있으면 캐시를 쓴다."""
    if CACHE.exists():
        c = json.loads(CACHE.read_text(encoding="utf-8"))
        return c["features"], c["fetched"]
    key, feats, page = api_key(), [], 1
    while True:
        q = {"service": "data", "request": "GetFeature", "data": "LT_C_DAMYUCH", "key": key, "domain": DOMAIN, "format": "json",
             "crs": "EPSG:4326", "size": "1000", "page": str(page), "geomFilter": "BOX(%f,%f,%f,%f)" % box}
        with urllib.request.urlopen(f"{URL}?{urllib.parse.urlencode(q)}", timeout=30) as res:
            r = json.load(res)["response"]
        if r["status"] != "OK":
            raise SystemExit(f"단지유치업종 API: {r['status']} {r.get('error')}")
        feats += r["result"]["featureCollection"]["features"]
        if page >= int(r["page"]["total"]):
            break
        page += 1
        time.sleep(0.2)
    fetched = date.today().isoformat()
    RAW.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps({"fetched": fetched, "bbox": box, "features": feats}, ensure_ascii=False), encoding="utf-8")
    return feats, fetched


def zones_from_shp(path, box):
    """DAM_YUCH.shp → API 응답과 같은 모양. 좌표는 .prj 기준에서 EPSG:4326으로 바꾼다. 필드명은 대소문자를 가리지 않는다."""
    import shapefile
    from pyproj import CRS, Transformer
    from shapely.geometry import box as bbox
    from shapely.ops import transform

    enc = path.with_suffix(".cpg").read_text().strip() if path.with_suffix(".cpg").exists() else "utf-8"
    tf = Transformer.from_crs(CRS.from_wkt(path.with_suffix(".prj").read_text(encoding="utf-8", errors="replace")), 4326, always_xy=True)
    area, feats = bbox(*box), []
    with shapefile.Reader(str(path), encoding=enc, encodingErrors="replace") as sf:
        names = [f[0].lower() for f in sf.fields[1:]]
        for sr in sf.iterShapeRecords():
            if not sr.shape.points:
                continue
            g = transform(tf.transform, shape(sr.shape.__geo_interface__))
            if g.intersects(area):
                feats.append({"properties": dict(zip(names, sr.record)), "geometry": g.__geo_interface__})
    return feats, date.fromtimestamp(path.stat().st_mtime).isoformat()


def main():
    blds = json.loads((ROOT / "public" / "data" / "buildings.json").read_text(encoding="utf-8"))["buildings"]
    gj = json.loads(gzip.open(ROOT / "public" / "data" / "buildings.geojson.gz").read().decode("utf-8"))
    pts = {f["properties"]["bld_id"]: shape(f["geometry"]).representative_point() for f in gj["features"]}
    xs, ys = [p.x for p in pts.values()], [p.y for p in pts.values()]
    box = (min(xs) - 0.005, min(ys) - 0.005, max(xs) + 0.005, max(ys) + 0.005)

    shp = next(iter(sorted(RAW.glob("*.shp"))), None)
    feats, fetched = zones_from_shp(shp, box) if shp else zones_from_api(box)
    zones = []
    for f in feats:
        p = f["properties"]
        dan, cat, upj = (str(p.get(k) or "").strip() for k in ("dan_name", "cat_nam", "upj_name"))
        zones.append({"dan": dan, "cat": cat, "upj": upj, "d35": is_d35(f"{cat} {upj}"), "geom": shape(f["geometry"]).buffer(0)})
    tree = STRtree([z["geom"] for z in zones])

    out, outside = {}, Counter()
    names = sorted({b["complex_nm"] for b in blds if b.get("complex_nm")})
    cx = {n: {"zones": sum(z["dan"] == n for z in zones), "d35_zones": sum(z["dan"] == n and z["d35"] for z in zones), "targets": 0, "d35_targets": 0} for n in names}
    for b in blds:
        if not b.get("target") or b.get("bld_id") is None or b["bld_id"] not in pts:
            continue
        hit = [zones[i] for i in tree.query(pts[b["bld_id"]], predicate="within")]
        text = " / ".join(dict.fromkeys(f"{z['cat']} > {z['upj']}" for z in hit))  # 원문, 중복 제거
        d35 = any(z["d35"] for z in hit)
        out[str(b["bld_id"])] = {"zone": text or None, "codes": list(dict.fromkeys(KSIC.findall(text))), "d35": d35}
        c = cx[b["complex_nm"]]
        c["targets"] += 1
        c["d35_targets"] += d35
        outside[b["complex_nm"]] += not hit

    meta = {
        "source": SRC_SHP if shp else SRC_API,
        "base_date": BASE_DATE,
        "fetched": fetched,
        "fields": {
            "zone": "건물 대표점이 들어가는 유치업종 구역의 원문 '업종분류명(cat_nam) > 유치업종명(upj_name)'. 여러 구역이면 ' / '로 잇는다. 구역 밖이면 null",
            "codes": "원문에 KSIC 코드가 적혀 있으면 그 코드. 원본이 업종명 문자열뿐이면 빈 배열",
            "d35": "원문에 '전기, 가스'·'전기업'·'발전업'·'태양력' 또는 코드 35·351·3511·35113 이 있으면 true",
            "complexes": "zones=단지명이 같은 구역 수, d35_zones=그중 발전업 포함 구역 수, targets=대상 건물 수, d35_targets=그중 d35=true",
        },
    }
    (ROOT / "data" / "zoning.json").write_text(json.dumps({"meta": meta, "buildings": out, "complexes": cx}, ensure_ascii=False, indent=1), encoding="utf-8")

    sys.stdout.reconfigure(encoding="utf-8")
    print(f"구역 {len(zones)}개({'SHP' if shp else 'API'}), 대상 건물 {len(out)}동")
    for n, c in cx.items():
        print(f"  {n}: 구역 {c['zones']}(발전업 {c['d35_zones']}) / 대상 {c['targets']}동 = 확인 {c['d35_targets']}, 목록에 없음 {c['targets'] - c['d35_targets'] - outside[n]}, 구역 밖 {outside[n]}")
    print("유치업종 원문 분포(구역 수 기준 상위 30):")
    for (dan, cat, upj), n in Counter((z["dan"], z["cat"], z["upj"]) for z in zones).most_common(30):
        print(f"  {n:3d}  {dan} | {cat} | {upj}")


if __name__ == "__main__":
    main()
