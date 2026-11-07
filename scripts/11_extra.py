"""참고 표시 항목(점수 미반영): 복수 입주, 내진설계, 토지 소유 구분, 최근 5년 증축·대수선 허가.

buildings.json은 바꾸지 않는다. 출력  public/data/extra.json, data/quality/extra.json
응답은 data/extra_cache/에 필지별로 캐시한다. 토지 소유는 소유 구분(posesnSeCodeNm)만 저장한다(이름 등 개인정보 저장 안 함).
실행: python scripts/11_extra.py
"""
import importlib.util
import json
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CACHE = ROOT / "data" / "extra_cache"
spec = importlib.util.spec_from_file_location("reg", ROOT / "scripts" / "04_register.py")
reg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reg)

TITLE = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"
PMS = "https://apis.data.go.kr/1613000/ArchPmsHubService/getApBasisOulnInfo"
LAND = "https://api.vworld.kr/ned/data/getPossessionAttr"
TODAY = date.today()
SINCE = f"{TODAY.year - 5}{TODAY:%m%d}"


def env(name):
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(name + " 없음")


def get(url, params):
    for _ in range(3):
        try:
            with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=20) as res:
                return json.load(res)
        except Exception:
            time.sleep(1)
    return None


def cached(kind, pnu, fn):
    p = CACHE / kind / f"{pnu}.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    v = fn()
    if v is not None:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(v, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.05)
    return v


def hub(url, pnu, key, keep):
    q = {"serviceKey": key, "sigunguCd": pnu[:5], "bjdongCd": pnu[5:10], "platGbCd": "1" if pnu[10] == "2" else "0",
         "bun": pnu[11:15], "ji": pnu[15:19], "_type": "json", "numOfRows": 100}
    rows, page = [], 1
    while True:
        d = get(url, {**q, "pageNo": page})
        if d is None:
            return None
        body = d["response"]["body"]
        items = (body.get("items") or {}).get("item") or []
        rows += items if isinstance(items, list) else [items]
        if len(rows) >= int(body.get("totalCount") or 0) or not items:
            break
        page += 1
    return [{k: r.get(k) for k in keep} for r in rows]


def land(pnu, vkey):
    d = get(LAND, {"pnu": pnu, "key": vkey, "format": "json", "numOfRows": 10, "domain": "https://dasel-weld.vercel.app"})
    if d is None or "possessions" not in d:
        return None
    f = d["possessions"].get("field") or []
    return [{"posesnSeCodeNm": r.get("posesnSeCodeNm"), "stdrYm": r.get("stdrYm")} for r in f]


def main():
    key, vkey = env("DATA_GO_KR_KEY"), env("NEXT_PUBLIC_VWORLD_KEY")
    data = json.loads((OUT / "buildings.json").read_text(encoding="utf-8"))
    targets = [b for b in data["buildings"] if b["target"]]
    lots = {}
    for b in targets:
        if b["pnu"]:
            lots.setdefault(b["pnu"], []).append(b)
    fail = Counter()
    out = {}
    title_keep = ("dongNm", "archArea", "rserthqkDsgnApplyYn", "rserthqkAblty")
    pms_keep = ("archGbCdNm", "archPmsDay", "mgmPmsrgstPk")
    for pnu, members in lots.items():
        rows = cached("title", pnu, lambda: hub(TITLE, pnu, key, title_keep))
        pms = cached("permit", pnu, lambda: hub(PMS, pnu, key, pms_keep))
        own = cached("land", pnu, lambda: land(pnu, vkey))
        fail["title"] += rows is None
        fail["permit"] += pms is None
        fail["land"] += own is None
        kinds = sorted({r["posesnSeCodeNm"] for r in own or [] if r.get("posesnSeCodeNm")})
        recent = sorted({(r["archPmsDay"] or "")[:4] for r in pms or [] if r.get("archGbCdNm") in ("증축", "대수선") and (r.get("archPmsDay") or "").strip() >= SINCE})
        used = set()
        for b in sorted(members, key=lambda x: x["arch_area"] is None):
            i, _ = reg.pick(b, rows or [], used)
            seis = None
            if i is not None:
                used.add(i)
                yn = (rows[i].get("rserthqkDsgnApplyYn") or "").strip()
                seis = {"1": "적용", "0": "미적용"}.get(yn)
            out[b["bld_id"]] = {
                "multi": len(b.get("companies") or []) >= 2,
                "seismic": seis,
                "land": "·".join(kinds) if kinds else None,
                "permit_years": [y for y in recent if y] if pms is not None else None,
            }
    for b in targets:
        out.setdefault(b["bld_id"], {"multi": len(b.get("companies") or []) >= 2, "seismic": None, "land": None, "permit_years": None})

    meta = {
        "generated": TODAY.isoformat(),
        "since": SINCE,
        "sources": {
            "multi": data["meta"]["factory_source"],
            "seismic": "국토교통부 건축HUB 건축물대장 표제부(15134735) 내진설계 적용 여부(rserthqkDsgnApplyYn)",
            "land": "브이월드 토지소유정보 속성조회(getPossessionAttr) 소유 구분(posesnSeCodeNm)",
            "permit": "국토교통부 건축HUB 건축인허가 기본개요(getApBasisOulnInfo) 건축구분 증축·대수선, 허가일 기준(필지 단위)",
        },
    }
    (OUT / "extra.json").write_text(json.dumps({"meta": meta, "extra": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    v = list(out.values())
    q = {"meta": meta, "targets": len(targets), "lots": len(lots), "api_fail_lots": dict(fail),
         "multi": sum(x["multi"] for x in v),
         "seismic": Counter(x["seismic"] or "정보 없음" for x in v),
         "land": Counter(x["land"] or "정보 없음" for x in v),
         "permit": {"recent": sum(1 for x in v if x["permit_years"]), "none": sum(1 for x in v if x["permit_years"] == []), "unknown": sum(1 for x in v if x["permit_years"] is None)}}
    (ROOT / "data" / "quality" / "extra.json").write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(q, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
