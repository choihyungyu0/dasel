"""DAT-09: 한전 분산전원연계 정보(읍면동·리 단위)를 조회해 배전선로 여유용량 참고표를 만든다.

API가 지번 단위로는 응답하지 않아 건물별 여유용량은 알 수 없다. 리 단위 선로 목록만 저장한다.
출력  public/data/grid.json, data/quality/grid.json
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://bigdata.kepco.co.kr/openapi/v1/dispersedGeneration.do"
SRC = "한국전력공사 전력데이터 개방포털 분산전원연계 정보"


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
    q = {"metroCd": "43", "cityCd": "110", "addrLidong": dong, "addrLi": li, "apiKey": key, "returnType": "json"}
    try:
        with urllib.request.urlopen(f"{URL}?{urllib.parse.urlencode(q)}", timeout=20) as res:
            return json.load(res).get("data") or []
    except Exception:
        return None


def main():
    key = api_key()
    blds = json.loads((ROOT / "public" / "data" / "buildings.json").read_text(encoding="utf-8"))["buildings"]
    areas = sorted({a for b in blds if b["target"] and (a := area_of(b["addr"]))})
    out, failed = {}, []
    for dong, li in areas:
        rows = fetch(dong, li, key)
        time.sleep(0.2)
        if not rows:
            failed.append(f"{dong} {li}")
            continue
        seen, lines = set(), []
        for r in rows:
            k = (r["substNm"], r["mtrNo"], r["dlNm"])
            if k in seen:
                continue
            seen.add(k)
            dl, mtr, sub = int(r["dlPwr"]), int(r["mtrPwr"]), int(r["substPwr"])
            # 선로·주변압기·변전소 중 가장 작은 여유가 실제 연계 가능 한도
            lines.append({"subst": r["substNm"], "dl": r["dlNm"], "margin_kw": min(dl, mtr, sub), "dl_margin_kw": dl, "dl_linked_kw": int(r["vol3"])})
        lines.sort(key=lambda x: -x["margin_kw"])
        out[f"{dong} {li}"] = lines
    meta = {"source": SRC, "fetched": date.today().isoformat(), "unit": "읍면동·리"}
    (ROOT / "public" / "data" / "grid.json").write_text(json.dumps({"meta": meta, "areas": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    covered = sum(1 for b in blds if b["target"] and (a := area_of(b["addr"])) and f"{a[0]} {a[1]}" in out)
    q = {"meta": meta, "areas": len(areas), "areas_ok": len(out), "failed": failed, "target": sum(1 for b in blds if b["target"]), "target_covered": covered,
         "summary": {k: {"lines": len(v), "min_kw": min(x["margin_kw"] for x in v), "max_kw": max(x["margin_kw"] for x in v)} for k, v in out.items()}}
    (ROOT / "data" / "quality" / "grid.json").write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(q, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
