"""DAT-09: 한전 분산전원 연계정보(리 단위)를 조회해 배전선로 여유용량을 건물에 붙인다.

API가 지번 단위로는 응답하지 않는다. 리 단위로 한 번씩 조회하고(캐시 data/raw/grid), 리 응답이 없으면 읍면 단위 값을 쓴다(level='읍면').
응답 필드: substPwr·mtrPwr·dlPwr = 누적 연계용량, vol1·vol2·vol3 = 변전소·주변압기·배전선로 여유용량.
선로별 여유 = min(vol1, vol2, vol3) — 선로에 여유가 있어도 주변압기가 차 있으면 연계할 수 없기 때문.
출력  public/data/grid.json, data/quality/grid.json, public/data/buildings.json(grid_min_kw·grid_max_kw·grid_level)
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://bigdata.kepco.co.kr/openapi/v1/dispersedGeneration.do"
SRC = "한국전력공사 전력데이터 개방포털 분산전원 연계정보"
CACHE = ROOT / "data" / "raw" / "grid"


def api_key():
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("KEPCO_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("KEPCO_API_KEY 없음")


def area_of(addr):
    """'충청북도 청주시 청원구 오창읍 양청리 807-1' → ('오창읍', '양청리')"""
    t = (addr or "").split()
    return (t[-3], t[-2]) if len(t) >= 4 and t[-2].endswith("리") else None


def fetch(dong, li, key):
    """캐시가 있으면 캐시를 쓴다. 응답 없음(404)은 빈 목록으로 캐시한다."""
    f = CACHE / f"{dong}_{li or '전체'}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))["data"]
    q = {"metroCd": "43", "cityCd": "110", "addrLidong": dong, "apiKey": key, "returnType": "json"}
    if li:
        q["addrLi"] = li
    try:
        with urllib.request.urlopen(f"{URL}?{urllib.parse.urlencode(q)}", timeout=20) as res:
            rows = json.load(res).get("data") or []
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise SystemExit(f"{dong} {li}: HTTP {e.code}")
        rows = []
    time.sleep(0.2)
    f.write_text(json.dumps({"fetched": date.today().isoformat(), "data": rows}, ensure_ascii=False), encoding="utf-8")
    return rows


def lines_of(rows):
    seen, lines = set(), []
    for r in rows:
        k = (r["substNm"], r["mtrNo"], r["dlNm"])
        if k in seen:
            continue
        seen.add(k)
        v1, v2, v3 = int(r["vol1"]), int(r["vol2"]), int(r["vol3"])
        lines.append({"subst": r["substNm"], "mtr": str(r["mtrNo"]), "dl": r["dlNm"], "margin_kw": min(v1, v2, v3), "dl_margin_kw": v3, "dl_linked_kw": int(r["dlPwr"])})
    lines.sort(key=lambda x: -x["margin_kw"])
    return lines


def main():
    key = api_key()
    CACHE.mkdir(parents=True, exist_ok=True)
    path = ROOT / "public" / "data" / "buildings.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    blds = doc["buildings"]
    areas = sorted({a for b in blds if b["target"] and (a := area_of(b["addr"]))})
    out, level = {}, {}
    for dong, li in areas:
        rows, lv = fetch(dong, li, key), "리"
        if not rows:
            rows, lv = fetch(dong, None, key), "읍면"
        if rows:
            out[f"{dong} {li}"] = lines_of(rows)
            level[f"{dong} {li}"] = lv

    covered = 0
    for b in blds:
        for k in ("grid_min_kw", "grid_max_kw", "grid_level"):
            b.pop(k, None)
        a = area_of(b["addr"]) if b["target"] else None
        lines = out.get(f"{a[0]} {a[1]}") if a else None
        if lines:
            b["grid_min_kw"] = min(x["margin_kw"] for x in lines)
            b["grid_max_kw"] = max(x["margin_kw"] for x in lines)
            b["grid_level"] = level[f"{a[0]} {a[1]}"]
            covered += 1
    path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    meta = {"source": SRC, "fetched": date.today().isoformat(), "unit": "kW",
            "unit_basis": "응답에 단위 표기 없음. 한전ON 배전선로 여유용량 화면(2026-10-04, 오창읍 양청리 805)이 kW로 표기하고 접속기준용량이 변전소 200,000·주변압기 50,000kW로, 응답의 누적 연계용량+여유용량 합과 같아 kW로 확인"}
    (ROOT / "public" / "data" / "grid.json").write_text(json.dumps({"meta": meta, "level": level, "areas": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    q = {"meta": meta, "areas": len(areas), "areas_ok": len(out), "level": level, "failed": [f"{d} {l}" for d, l in areas if f"{d} {l}" not in out],
         "target": sum(1 for b in blds if b["target"]), "target_covered": covered,
         "summary": {k: {"lines": len(v), "min_kw": min(x["margin_kw"] for x in v), "max_kw": max(x["margin_kw"] for x in v), "top": v[0]["dl"]} for k, v in out.items()}}
    (ROOT / "data" / "quality" / "grid.json").write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(q, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
