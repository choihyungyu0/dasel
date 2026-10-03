"""DAT-06: 대상 건물 필지의 건축물대장 표제부(건축HUB 15134735)를 조회해 구조·면적·사용승인일·지붕을 보강한다.

01 → 03 뒤에 돌린다. 응답은 data/register/에 필지별로 캐시한다(일 1만 건 한도).
출력  public/data/buildings.json(보강), buildings.geojson.gz(target), data/quality/register.json
"""
import gzip
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CACHE = ROOT / "data" / "register"
URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
SRC = "국토교통부 건축HUB 건축물대장 표제부(15134735)"
TARGET_USE = {"공장", "창고시설", "교육연구시설", "자원순환관련시설", "발전시설"}
SCHOOL = re.compile("학교|초등|중학|고등|초교|중교|고교")


def api_key():
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("DATA_GO_KR_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("DATA_GO_KR_KEY 없음")


def fetch(pnu, key):
    path = CACHE / f"{pnu}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    q = {"serviceKey": key, "sigunguCd": pnu[:5], "bjdongCd": pnu[5:10], "platGbCd": "1" if pnu[10] == "2" else "0",
         "bun": pnu[11:15], "ji": pnu[15:19], "_type": "json", "numOfRows": 100}
    rows, page = [], 1
    while True:
        try:
            with urllib.request.urlopen(f"{URL}?{urllib.parse.urlencode({**q, 'pageNo': page})}", timeout=20) as res:
                body = json.load(res)["response"]["body"]
        except Exception:
            return None  # 실패는 캐시하지 않는다
        items = (body.get("items") or {}).get("item") or []
        rows += items if isinstance(items, list) else [items]
        if len(rows) >= int(body.get("totalCount") or 0) or not items:
            break
        page += 1
    keep = ("bldNm", "dongNm", "mainAtchGbCdNm", "mainPurpsCdNm", "strctCdNm", "roofCdNm", "archArea", "totArea", "useAprDay", "grndFlrCnt", "heit", "platArea")
    rows = [{k: r.get(k) for k in keep} for r in rows]
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.03)
    return rows


def text(v):
    v = str(v).strip() if v is not None else ""
    return v or None


def num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def ymd(v):
    s = text(v) or ""
    return s if len(s) == 8 and s.isdigit() and 1950 <= int(s[:4]) <= 2026 else None


def pick(b, rows, used):
    """표제부 여러 동 중 이 도형에 해당하는 행을 고른다. (행 번호, 방식)"""
    free = [i for i in range(len(rows)) if i not in used]
    if b["arch_area"]:
        same = [i for i in free if num(rows[i]["archArea"]) and abs(num(rows[i]["archArea"]) - b["arch_area"]) < 0.5]
        if len(same) > 1 and b["dong"]:
            same = [i for i in same if text(rows[i]["dongNm"]) == b["dong"]] or same
        if same:
            return same[0], "EXACT"
    if b["dong"]:
        named = [i for i in free if text(rows[i]["dongNm"]) == b["dong"]]
        if len(named) == 1:
            return named[0], "DONG"
    near = [(abs(num(rows[i]["archArea"]) / b["geom_area"] - 1), i) for i in free if num(rows[i]["archArea"]) and 0.8 <= num(rows[i]["archArea"]) / b["geom_area"] <= 1.25]
    if near:
        return min(near)[1], "AREA"
    return None, None


def main():
    key = api_key()
    data = json.loads((OUT / "buildings.json").read_text(encoding="utf-8"))
    blds = data["buildings"]
    targets = [b for b in blds if b["target"] and b["pnu"]]
    lots = {}
    for b in targets:
        lots.setdefault(b["pnu"], []).append(b)

    stats, changed = Counter(), Counter()
    before = {k: sum(1 for b in targets if b[k] is None) for k in ("use", "struct", "arch_area", "apr_ymd")}
    for pnu, members in lots.items():
        rows = fetch(pnu, key)
        if rows is None:
            stats["lot_fail"] += 1
        elif not rows:
            stats["lot_empty"] += 1
        else:
            stats["lot_ok"] += 1
        used = set()
        # 속성이 있는 건물부터 맞춘 뒤 남은 행을 속성 없는 건물에 배정한다
        for b in sorted(members, key=lambda x: x["arch_area"] is None):
            i, how = pick(b, rows or [], used)
            if i is None:
                b["flags"] = sorted(set(b["flags"]) | {"REG_NULL"})
                b["reg_match"] = None
                stats["bld_none"] += 1
                continue
            used.add(i)
            r = rows[i]
            b["reg_match"], b["roof_type"] = how, text(r["roofCdNm"])
            stats["bld_" + how] += 1
            reg = {"use": text(r["mainPurpsCdNm"]), "struct": text(r["strctCdNm"]), "arch_area": num(r["archArea"]),
                   "tot_area": num(r["totArea"]), "apr_ymd": ymd(r["useAprDay"]), "fl_up": num(r["grndFlrCnt"]), "h": num(r["heit"])}
            for k, v in reg.items():
                if v is None or b[k] == v:
                    continue
                if b[k] is None:
                    b[k] = v
                    changed["filled_" + k] += 1
                elif how != "AREA":  # 대장 우선(면적만으로 맞춘 경우는 빈 값만 채운다)
                    b[k] = v
                    changed["replaced_" + k] += 1
            if b["arch_area"]:
                b["flags"] = [f for f in b["flags"] if f != "AREA_GEOM"]

    # CAL-09: 필지 공지 = 대지면적 − 그 필지 건물들의 바닥면적 합(대상이 아닌 건물도 포함)
    footprint = Counter()
    for b in blds:
        if b["pnu"]:
            footprint[b["pnu"]] += min(b["arch_area"], b["geom_area"]) if b["arch_area"] else b["geom_area"]
    for pnu, members in lots.items():
        rows = fetch(pnu, key) or []
        lot_area = max((num(r.get("platArea")) or 0 for r in rows), default=0) or None
        for b in members:
            b["lot_area"] = lot_area
            b["lot_open_m2"] = round(lot_area - footprint[pnu], 1) if lot_area else None

    # 대장으로 용도가 채워진 건물 재판정(BR-D1)
    demoted = 0
    for b in targets:
        if "USE_NULL" in b["flags"] and b["use"] is not None:
            b["flags"] = [f for f in b["flags"] if f != "USE_NULL"]
            school = b["use"] == "교육연구시설" and SCHOOL.search(f"{b['name'] or ''} {b['dong'] or ''}")
            if not ((b["use"] in TARGET_USE and not school) or any(not c.get("mate") for c in b.get("companies", []))):
                b["target"] = False
                demoted += 1

    data["meta"]["register_source"] = SRC
    (OUT / "buildings.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with gzip.open(OUT / "buildings.geojson.gz", "rt", encoding="utf-8") as f:
        geo = json.load(f)
    tgt = {b["bld_id"]: b["target"] for b in blds}
    for ft in geo["features"]:
        ft["properties"]["target"] = tgt[ft["properties"]["bld_id"]]
    with gzip.open(OUT / "buildings.geojson.gz", "wt", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, separators=(",", ":"))

    now = [b for b in blds if b["target"]]
    q = {"lots": len(lots), **{k: stats[k] for k in ("lot_ok", "lot_empty", "lot_fail")},
         "buildings": len(targets), "matched": {k: stats["bld_" + k] for k in ("EXACT", "DONG", "AREA")}, "reg_null": stats["bld_none"],
         "match_rate": round(1 - stats["bld_none"] / len(targets), 3), "changed": dict(changed),
         "null_before": before, "null_after": {k: sum(1 for b in now if b[k] is None) for k in before},
         "demoted_by_use": demoted, "target_after": len(now), "lot_area_ok": sum(1 for b in now if b.get("lot_area")), "lot_open_negative": sum(1 for b in now if (b.get("lot_open_m2") or 0) < 0),
         "roof_type": Counter(b.get("roof_type") or "(없음)" for b in now).most_common(8)}
    (ROOT / "data" / "quality" / "register.json").write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(q, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
