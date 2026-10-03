"""DAT-01~03: 충북 건물 SHP를 오창 산단 경계로 추려 4326 gzip GeoJSON으로 내보낸다.

입력  data/raw/buildings/AL_D010_43_*.shp (EPSG:5186), data/raw/complex/dam_dan.shp (EPSG:3857),
      data/raw/factory.csv (단지명 기준 등록공장 수)
출력  public/data/buildings.geojson.gz, public/data/buildings.json, public/data/complex.geojson,
      data/quality/buildings.json (건수·결측 로그)
"""
import csv
import gzip
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import geopandas as gpd
import shapefile  # pyshp: pyogrio의 GDAL DLL이 이 PC에서 차단되어 SHP 읽기만 대체
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
QUALITY = ROOT / "data" / "quality"

# 경계 파일 DAN_NAME → 등록공장 CSV 단지명
BASE_COMPLEX = {"오창과학": "청주오창과학일반산업단지", "오창2": "청주오창제2일반산업단지", "오창테크노폴리스": "청주오창테크노폴리스일반산업단지"}
EXTRA_COMPLEX = {"오창3": "청주오창제3일반산업단지", "서오창테크노밸리": "서오창테크노밸리"}

# BR-D1 대상 용도(GIS건물통합정보 A9 건축물용도명)
TARGET_USE = {"공장", "창고시설", "교육연구시설", "자원순환관련시설", "발전시설"}
SCHOOL = re.compile("학교|초등|중학|고등|초교|중교|고교")  # 교육연구시설 중 학교 제외
USE_NULL_MIN_M2 = 600  # 용도 결측은 도형 면적 600㎡(=30kW) 이상만 대상

SRC_BLD = "국토교통부 GIS건물통합정보(15083092)"
SRC_CPX = "국토교통부 산업단지 경계도면(15152766, 2026-06-30)"
SRC_FAC = "한국산업단지공단 전국등록공장현황(15105482, 2025-12-31)"


def text(v):
    v = (v or "").strip() if isinstance(v, str) else v
    return v or None


def positive(v, hi):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if 0 < v <= hi else None


def approval(v):
    s = (v or "").replace("-", "").strip()
    if len(s) == 8 and s.isdigit() and 1950 <= int(s[:4]) <= 2026:
        return s
    return None


def factory_counts():
    with open(RAW / "factory.csv", encoding="cp949", newline="") as f:
        return Counter(r["단지명"].strip() for r in csv.DictReader(f))


def load_complexes():
    r = shapefile.Reader(str(RAW / "complex" / "dam_dan"), encoding="cp949")
    rows = [(rec["DAN_ID"], rec["DAN_NAME"], shape(shp.__geo_interface__))
            for shp, rec in zip(r.iterShapes(), r.iterRecords()) if "오창" in rec["DAN_NAME"]]
    fac = factory_counts()
    extra = {n: fac.get(c, 0) for n, c in EXTRA_COMPLEX.items() if any(n == x[1] for x in rows)}
    fourth = max((n for n, c in extra.items() if c >= 1), key=lambda n: extra[n], default=None)
    names = {**BASE_COMPLEX, **({fourth: EXTRA_COMPLEX[fourth]} if fourth else {})}
    picked = [x for x in rows if x[1] in names]
    g = gpd.GeoDataFrame(
        {"complex_cd": [x[0] for x in picked], "complex_nm": [x[1] for x in picked],
         "factories": [fac.get(names[x[1]], 0) for x in picked]},
        geometry=[x[2] for x in picked], crs=3857)
    return g, {"candidates": extra, "fourth": fourth, "found": [x[1] for x in rows]}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    QUALITY.mkdir(parents=True, exist_ok=True)
    cpx, pick = load_complexes()
    cpx5186 = cpx.to_crs(5186)
    bbox = tuple(cpx5186.total_bounds)

    shp_path = next((RAW / "buildings").glob("AL_D010_*.shp"))
    base_date = shp_path.stem.split("_")[-1]
    r = shapefile.Reader(str(shp_path.with_suffix("")), encoding="cp949")
    total = len(r)

    rows, geoms, bad_pnu = [], [], 0
    for sr in r.iterShapeRecords(bbox=bbox):
        geom = shape(sr.shape.__geo_interface__)
        pt = geom.representative_point()
        hit = cpx5186[cpx5186.contains(pt)]
        if hit.empty:
            continue
        a = sr.record
        pnu = text(a["A2"])
        if not (pnu and len(pnu) == 19 and pnu.isdigit()):
            bad_pnu += 1
        use, arch = text(a["A9"]), positive(a["A12"], 1e7)
        name, dong = text(a["A24"]), text(a["A25"])
        school = use == "교육연구시설" and bool(SCHOOL.search(f"{name or ''} {dong or ''}"))
        # 등록공장 매칭으로 대상이 되는 용도 결측 건물은 02_factory에서 재판정한다
        target = (use in TARGET_USE and not school) or (use is None and geom.area >= USE_NULL_MIN_M2)
        flags = []
        if arch is None:
            flags.append("AREA_GEOM")
        if use is None:
            flags.append("USE_NULL")
        rows.append({
            "bld_id": int(a["A0"]), "pnu": pnu, "addr": " ".join(filter(None, [text(a["A4"]), text(a["A5"])])) or None,
            "name": name, "dong": dong,
            "use": use, "struct": text(a["A11"]),
            "arch_area": arch, "geom_area": round(geom.area, 1), "tot_area": positive(a["A14"], 1e8),
            "apr_ymd": approval(a["A13"]), "fl_up": positive(a["A26"], 60), "h": positive(a["A16"], 300),
            "complex_cd": hit.iloc[0]["complex_cd"], "complex_nm": hit.iloc[0]["complex_nm"],
            "target": target, "flags": flags,
        })
        geoms.append(geom)

    ids = Counter(x["bld_id"] for x in rows)
    dup = [k for k, v in ids.items() if v > 1]
    if dup:
        sys.exit(f"bld_id 중복 {len(dup)}건 — 적재 중단 (예: {dup[:5]})")

    to4326 = Transformer.from_crs(5186, 4326, always_xy=True).transform
    feats = [{"type": "Feature", "id": x["bld_id"],
              "properties": {"bld_id": x["bld_id"], "target": x["target"], "complex_cd": x["complex_cd"]},
              "geometry": json.loads(gpd.GeoSeries([transform(to4326, g)]).set_precision(1e-6).to_json())["features"][0]["geometry"]}
             for x, g in zip(rows, geoms)]
    with gzip.open(OUT / "buildings.geojson.gz", "wt", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
    meta = {"source": SRC_BLD, "base_date": base_date, "built": date.today().isoformat()}
    (OUT / "buildings.json").write_text(json.dumps({"meta": meta, "buildings": rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    cpx4326 = cpx.to_crs(4326)
    cpx4326["source"] = SRC_CPX
    (OUT / "complex.geojson").write_text(cpx4326.to_json(ensure_ascii=False), encoding="utf-8")

    tgt = [x for x in rows if x["target"]]
    null = lambda key, src: sum(1 for x in src if x[key] is None)
    roof = lambda x: min(x["arch_area"], x["geom_area"]) if x["arch_area"] else x["geom_area"]
    q = {
        "meta": meta, "source_total": total, "clipped": len(rows), "target": len(tgt), "non_target": len(rows) - len(tgt),
        "target_use_null": sum(1 for x in tgt if x["use"] is None),
        "target_roof_ge_600": sum(1 for x in tgt if roof(x) >= USE_NULL_MIN_M2),
        "school_excluded": sum(1 for x in rows if x["use"] == "교육연구시설" and not x["target"]),
        "bad_pnu": bad_pnu, "complex_pick": pick, "target_use": sorted(TARGET_USE),
        "null_all": {k: null(k, rows) for k in ["use", "struct", "arch_area", "tot_area", "apr_ymd", "fl_up", "h"]},
        "null_target": {k: null(k, tgt) for k in ["use", "struct", "arch_area", "tot_area", "apr_ymd", "fl_up", "h"]},
        "use_dist": Counter(x["use"] or "(결측)" for x in rows).most_common(),
        "struct_dist_target": Counter(x["struct"] or "(결측)" for x in tgt).most_common(),
        "by_complex": [{"complex_cd": c.complex_cd, "complex_nm": c.complex_nm,
                        "buildings": sum(1 for x in rows if x["complex_cd"] == c.complex_cd),
                        "target": sum(1 for x in tgt if x["complex_cd"] == c.complex_cd),
                        "target_roof_ge_600": sum(1 for x in tgt if x["complex_cd"] == c.complex_cd and roof(x) >= USE_NULL_MIN_M2),
                        "factories_by_name": int(c.factories), "factory_source": SRC_FAC}
                       for c in cpx.itertuples()],
    }
    (QUALITY / "buildings.json").write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(q, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
