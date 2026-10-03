"""DAT-14: 판매·지붕 임대형에 필요한 '발전업 입주업종' 확인 결과를 건물에 붙인다.

입력  config/complex_rules.json (C: 관리기본계획 고시문), data/zoning.json (A·B: 유치업종 도면, scripts/07_zoning.py)
출력  public/data/buildings.json 의 solar_biz·solar_biz_src·zone, data/quality/solar_biz.json
판정  고시문 또는 유치업종 구역에 전기업(D35) 계열이 명시 → '확인됨'
      자료를 봤는데 없음 → '확인 안 됨(유치업종 목록에 발전업 없음)'
      자료를 못 봄 → '확인 안 됨(자료 미확보)'
이 판정은 점수에 넣지 않는다. '확인 안 됨'은 허용되지 않는다는 뜻이 아니다.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OK, NONE, NODATA = "확인됨", "확인 안 됨(유치업종 목록에 발전업 없음)", "확인 안 됨(자료 미확보)"

rules = json.loads((ROOT / "config" / "complex_rules.json").read_text(encoding="utf-8"))
zoning = json.loads((ROOT / "data" / "zoning.json").read_text(encoding="utf-8"))
zsrc = f"국토교통부 단지유치업종 도면({zoning['meta'].get('base_date', '')})"
path = ROOT / "public" / "data" / "buildings.json"
doc = json.loads(path.read_text(encoding="utf-8"))

stat = defaultdict(Counter)
for b in doc["buildings"]:
    for k in ("solar_biz", "solar_biz_src", "zone"):
        b.pop(k, None)
    if not b["target"]:
        continue
    rule = rules.get(b["complex_nm"]) or {}
    z = zoning["buildings"].get(str(b["bld_id"]))
    if z and z.get("zone"):
        b["zone"] = z["zone"]
    if rule.get("solar_biz_allowed") is True:
        b["solar_biz"], b["solar_biz_src"] = OK, f"{rule['source']}, {rule['checked']}"
    elif z and z.get("d35"):
        b["solar_biz"], b["solar_biz_src"] = OK, zsrc
    elif rule.get("source") or (z and z.get("zone")):
        b["solar_biz"] = NONE
    else:
        b["solar_biz"] = NODATA
    stat[b["complex_nm"]][b["solar_biz"]] += 1

path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
q = {"zoning_source": zsrc, "zoning_fetched": zoning["meta"].get("fetched"), "d35_zone_buildings": sum(1 for v in zoning["buildings"].values() if v.get("d35")),
     "by_complex": {k: dict(v) for k, v in stat.items()}, "total": dict(sum(stat.values(), Counter()))}
(ROOT / "data" / "quality" / "solar_biz.json").write_text(json.dumps(q, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps(q, ensure_ascii=False, indent=1))
