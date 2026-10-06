"""A1 허가대장 대조: AI 가 '이미 태양광 설치'로 본 건물이 공공 허가대장(행정 기록)에도 있는지 본다.

입력  data/raw/permit/chungbuk_permit.csv  충청북도_태양광발전소 전기사업허가현황(15138440)
      public/data/buildings.json, labels.json, buildings.geojson.gz, complex.geojson
출력  data/quality/permit.json (건수·용량·연도·bld_id 만. 상호·대표자·주소 원문은 넣지 않는다)
캐시  data/raw/permit/geocode_cache.json (브이월드 지오코더 응답)

매칭  1) 지번형 주소: (읍면, 리, 산 여부, 본번, 부번) 키가 건물 지번과 같으면 같은 필지.
      2) 도로명 주소: 브이월드 지오코더(type=ROAD)로 좌표를 얻어
         - 좌표가 건물 도형 안이면 그 건물의 필지,
         - 좌표를 지번으로 되돌린(역지오코딩) 필지
         를 같은 필지로 본다.
      한 필지에 건물이 여러 동이면 그 필지의 후보 건물 전부에 '같은 필지 허가 있음'을 붙인다.
"""
import csv
import gzip
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "permit"
SRC = RAW / "chungbuk_permit.csv"
CACHE = RAW / "geocode_cache.json"
OUT = ROOT / "data" / "quality" / "permit.json"
DOMAIN = "https://dasel-weld.vercel.app"
LIMIT = "자가소비용 태양광은 발전사업 허가 대상이 아니어서 허가대장에 없다. 대장에 없다고 해서 AI 판독이 틀린 것은 아니다."
LOT = re.compile(r"(산)?\s*(\d+)\s*(번지)?\s*(?:(-)\s*(\d+)|(\d+)\s*호)?\s*(?:번지|호)?")


def api_key():
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith("NEXT_PUBLIC_VWORLD_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("NEXT_PUBLIC_VWORLD_KEY 없음")


class Geocoder:
    def __init__(self):
        self.key = api_key()
        self.cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
        self.calls = 0

    def _call(self, params):
        q = {"service": "address", "format": "json", "crs": "epsg:4326", "domain": DOMAIN, **params, "key": self.key}
        url = "https://api.vworld.kr/req/address?" + urllib.parse.urlencode(q)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"Referer": DOMAIN}), timeout=10) as res:
                    self.calls += 1
                    return json.load(res)["response"]
            except Exception:
                time.sleep(1 + attempt)
        return {"status": "ERROR"}

    def coord(self, addr, kind):
        k = f"{kind}:{addr}"
        if k not in self.cache:
            r = self._call({"request": "getcoord", "type": kind, "address": addr})
            if r.get("status") == "ERROR":
                return None  # 통신 오류는 캐시에 남기지 않는다
            p = r["result"]["point"] if r.get("status") == "OK" else None
            self.cache[k] = [float(p["x"]), float(p["y"])] if p else None
            time.sleep(0.05)
        return self.cache[k]

    def parcel(self, lon, lat):
        k = f"rev:{lon:.6f},{lat:.6f}"
        if k not in self.cache:
            r = self._call({"request": "getAddress", "type": "parcel", "point": f"{lon},{lat}"})
            if r.get("status") == "ERROR":
                return None
            self.cache[k] = r["result"][0]["text"] if r.get("status") == "OK" else None
            time.sleep(0.05)
        return self.cache[k]

    def save(self):
        CACHE.write_text(json.dumps(self.cache, ensure_ascii=False, indent=0), encoding="utf-8")


def strip_notes(addr):
    """[건물 위], (주1동), '건물일체형' 같은 덧말을 뗀다."""
    a = re.sub(r"\[.*?\]|\(.*?\)", " ", addr)
    return re.sub(r"\s+", " ", a).strip()


def parse_lots(addr):
    """지번형 주소 → {(읍면, 리, 산, 본번, 부번)}, 애매한 표기를 넓게 풀었는지 여부.

    '174번지 6호' = 174-6, '236 , 236-1' = 두 필지, '산 145-29', '상평리 120, 121, 기암리 124' = 리가 바뀜.
    '14-6 ,8,9' 는 14-8·14-9 인지 8·9 인지 알 수 없어 둘 다 만든다. '221번지 46' 도 221-46 / 221 / 46 을 모두 만든다.
    """
    a = strip_notes(addr)
    m = re.search(r"(\S+[읍면])\s+(.*)$", a)
    if not m:
        return set(), False
    emd, rest = m.group(1), m.group(2)
    keys, loose = set(), False
    parts = re.split(r"(\S+리)(?=\s|\d|산|$)", rest)
    # parts = [앞부분, 리1, 지번들1, 리2, 지번들2 ...]
    for i in range(1, len(parts) - 1, 2):
        ri, body = parts[i], parts[i + 1]
        prev_main = None
        pos = 0
        while True:
            lm = LOT.search(body, pos)
            if not lm:
                break
            between = body[pos:lm.start()]
            if re.search(r"[가-힣A-Za-z]", between.replace("산", "")):
                break  # 지번 뒤에 다른 글(건물명 등)이 오면 멈춘다
            san, main, bunji, dash, sub1, sub2 = lm.groups()
            main = int(main)
            sub = int(sub1 or sub2 or 0)
            if main == 0:
                pos = lm.end()
                continue
            keys.add((emd, ri, bool(san), main, sub))
            if not dash and not sub2 and "," in between and prev_main and prev_main[1]:
                keys.add((emd, ri, prev_main[2], prev_main[0], main))  # '14-6 ,8' → 14-8 도 후보
                loose = True
            if bunji and not dash and not sub2:
                nm = re.match(r"\s*(\d+)(?!\s*번지|\s*-|\d)", body[lm.end():])
                if nm:  # '221번지 46' → 221-46 도 후보
                    keys.add((emd, ri, bool(san), main, int(nm.group(1))))
                    loose = True
            if sub or prev_main is None or "," not in between:
                prev_main = (main, sub, bool(san))
            pos = lm.end()
    return keys, loose


def is_lot_type(addr):
    return bool(re.search(r"[읍면]\s*\S+리(\s|$)", strip_notes(addr) + " ") and parse_lots(addr)[0])


def road_query(addr):
    a = strip_notes(addr).split(",")[0]
    return re.sub(r"\s+", " ", a).strip()


def year(s):
    return s[:4] if s and re.match(r"\d{4}", s) else "미상"


def kw(r):
    try:
        return float(r["설비용량(kW)"].replace(",", ""))
    except ValueError:
        return 0.0


def main():
    if not SRC.exists():
        raise SystemExit(f"{SRC} 없음: 공공데이터포털 15138440 파일을 먼저 받아야 한다")
    rows_all = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    doc = json.loads((ROOT / "public" / "data" / "buildings.json").read_text(encoding="utf-8"))
    labels = json.loads((ROOT / "public" / "data" / "labels.json").read_text(encoding="utf-8"))
    label = {int(k): v for k, v in labels["labels"].items()}

    # 건물 → 필지 키
    bkey, by_parcel = {}, defaultdict(list)
    for b in doc["buildings"]:
        ks, _ = parse_lots(b["addr"])
        if len(ks) != 1:
            continue  # 동 지역(산단 밖 주소로 잡힌 11동) 등
        k = next(iter(ks))
        if b.get("pnu") and len(b["pnu"]) == 19:  # 산 여부·본번·부번은 PNU 를 우선
            k = (k[0], k[1], b["pnu"][10] == "2", int(b["pnu"][11:15]), int(b["pnu"][15:19]))
        bkey[b["bld_id"]] = k
        by_parcel[k].append(b)

    gj = json.load(gzip.open(ROOT / "public" / "data" / "buildings.geojson.gz", "rt", encoding="utf-8"))
    geoms = [shape(f["geometry"]) for f in gj["features"]]
    gids = [f["properties"]["bld_id"] for f in gj["features"]]
    tree = STRtree(geoms)
    cx = json.loads((ROOT / "public" / "data" / "complex.geojson").read_text(encoding="utf-8"))
    complexes = [shape(f["geometry"]) for f in cx["features"]]

    geo = Geocoder()
    complex_ri = {k[:2] for k in by_parcel}  # 산단 건물이 있는 (읍면, 리)

    def in_complex(pt):
        return any(c.contains(Point(pt)) for c in complexes) if pt else None

    # 대상 행: 오창읍 전부 + 옥산면(남촌리는 지번 글자로, 도로명은 지오코딩해서 남촌리인 것만)
    region, n_text = [], 0
    for r in rows_all:
        s = r["설치장소"]
        text_hit = "오창읍" in s or ("옥산면" in s and "남촌리" in s)
        n_text += text_hit
        if not text_hit and not ("청주시" in s and "옥산면" in s and not is_lot_type(s)):
            continue
        info = {"row": r, "keys": set(), "pt": None, "methods": set(), "loose": False, "kind": None, "inside": set()}
        if is_lot_type(s):
            info["kind"] = "지번"
            info["keys"], info["loose"] = parse_lots(s)
            info["methods"].add("지번 일치")
            k0 = sorted(info["keys"])[0]
            if not any(k in by_parcel for k in info["keys"]):  # 건물 필지가 아니면 산단 안팎을 좌표로 가린다
                q = f"충청북도 청주시 {'흥덕구' if k0[0] == '옥산면' else '청원구'} {k0[0]} {k0[1]} {'산 ' if k0[2] else ''}{k0[3]}" + (f"-{k0[4]}" if k0[4] else "")
                info["pt"] = geo.coord(q, "parcel")
        else:
            info["kind"] = "도로명"
            info["pt"] = geo.coord(road_query(s), "road")
            if info["pt"]:
                p = Point(info["pt"])
                for i in tree.query(p):
                    if geoms[i].contains(p) and gids[i] in bkey:
                        info["keys"].add(bkey[gids[i]])
                        info["inside"].add(gids[i])
                        info["methods"].add("좌표가 건물 도형 안")
                txt = geo.parcel(*info["pt"])
                rk = parse_lots(txt)[0] if txt else set()
                if rk:
                    if rk - info["keys"] or not info["methods"]:
                        info["methods"].add("좌표의 필지 일치")
                    info["keys"] |= rk
            if not text_hit and not any(k[1] == "남촌리" for k in info["keys"]):
                continue  # 옥산면 도로명 행 가운데 남촌리가 아닌 것은 대상 밖
        region.append(info)
        if geo.calls and geo.calls % 100 == 0:
            geo.save()
    geo.save()

    # 매칭
    bld_hit = defaultdict(list)   # 후보 건물 → 허가 행들
    parcel_hit = defaultdict(set)  # 후보 건물이 있는 필지 → 행 번호
    unmatched = Counter()
    method_rows = Counter()
    matched_rows = []
    for n, info in enumerate(region):
        cands, others = [], []
        for k in info["keys"]:
            for b in by_parcel.get(k, []):
                (cands if b["bld_id"] in label else others).append((k, b))
        if cands:
            matched_rows.append(info)
            via = "지번 일치" if info["kind"] == "지번" else ("좌표가 건물 도형 안" if "좌표가 건물 도형 안" in info["methods"] else "좌표의 필지 일치")
            method_rows[via] += 1
            for k, b in cands:
                bld_hit[b["bld_id"]].append(info)
                parcel_hit[k].add(n)
            continue
        if not info["keys"] and not info["pt"]:
            unmatched["주소 해석 실패"] += 1
        elif any(b["target"] for _, b in others):
            unmatched["대상 건물 아님(같은 필지에 검토 대상 건물은 있으나 판독 후보 336동이 아님)"] += 1
        elif others:
            unmatched["대상 건물 아님(같은 필지 건물이 검토 대상이 아님)"] += 1
        elif in_complex(info["pt"]):
            unmatched["대상 건물 아님(산단 안이지만 그 필지에 건물 도형 없음)"] += 1
        elif info["pt"] or (info["keys"] and not any(k[:2] in complex_ri for k in info["keys"])):
            unmatched["산단 밖 주소"] += 1  # 좌표가 산단 경계 밖이거나, 산단에 걸치지 않는 리
        else:
            unmatched["주소 해석 실패"] += 1
        if "--debug" in sys.argv and not info["pt"] and not any(k in by_parcel for k in info["keys"]):
            print("해석 실패:", info["row"]["설치장소"], sorted(info["keys"]))

    def summarize(infos):
        rs = [i["row"] for i in infos]
        return {
            "rows": len(rs),
            "capacity_kw": round(sum(kw(r) for r in rs), 2),
            "by_status": dict(Counter(r["상태"] for r in rs)),
            "by_permit_year": dict(sorted(Counter(year(r["허가일자"]) for r in rs).items())),
            "by_start_year": dict(sorted(Counter(year(r["사업개시일자"]) for r in rs if r["사업개시일자"]).items())),
        }

    def bld_entry(bid):
        rs = [i["row"] for i in bld_hit[bid]]
        return {
            "bld_id": bid,
            "permit_rows": len(rs),
            "capacity_kw": round(sum(kw(r) for r in rs), 2),
            "status": dict(Counter(r["상태"] for r in rs)),
            "permit_years": sorted({year(r["허가일자"]) for r in rs}),
            "start_years": sorted({year(r["사업개시일자"]) for r in rs if r["사업개시일자"]}),
            "same_parcel_candidates": sum(1 for b in by_parcel[bkey[bid]] if b["bld_id"] in label),
            "point_in_this_building": any(bid in i["inside"] for i in bld_hit[bid]),
            "loose_lot_parse": any(i["loose"] for i in bld_hit[bid]),
        }

    # 필지 단위: 같은 필지에 AI '설치' 동이 있으면 그 필지의 '미설치' 동은 허가가 다른 동 지붕 것일 수 있다
    parcels = []
    for k, ns in parcel_hit.items():
        infos = [region[n] for n in sorted(ns)]
        cand = sorted(b["bld_id"] for b in by_parcel[k] if b["bld_id"] in label)
        parcels.append({
            "bld_ids": cand,
            "labels": dict(Counter(label[b] for b in cand)),
            "permit_rows": len(infos),
            "capacity_kw": round(sum(kw(i["row"]) for i in infos), 2),
            "status": dict(Counter(i["row"]["상태"] for i in infos)),
            "permit_years": sorted({year(i["row"]["허가일자"]) for i in infos}),
        })
    parcels.sort(key=lambda x: x["bld_ids"])
    started_no_ai = [p for p in parcels if p["status"].get("사업개시") and not p["labels"].get("설치")]
    strong = sorted(b for p in started_no_ai for b in p["bld_ids"] if label[b] == "미설치")

    by_label = {}
    for lab in ("설치", "미설치", "불명"):
        ids = sorted(b for b, v in label.items() if v == lab)
        hit = [b for b in ids if b in bld_hit]
        started = [b for b in hit if any(i["row"]["상태"] == "사업개시" for i in bld_hit[b])]
        by_label[lab] = {
            "buildings": len(ids),
            "matched_buildings": len(hit),
            "matched_buildings_started": len(started),
            "matched_buildings_point_inside": sum(1 for b in hit if any(b in i["inside"] for i in bld_hit[b])),
            "matched_buildings_only_candidate_on_parcel": sum(1 for b in hit if sum(1 for x in by_parcel[bkey[b]] if x["bld_id"] in label) == 1),
            "matched_parcels": len({bkey[b] for b in hit}),
            "parcels": len({bkey[b] for b in ids if b in bkey}),
            "matched": [bld_entry(b) for b in hit],
        }

    out = {
        "meta": {
            "dataset": "충청북도_태양광발전소 전기사업허가현황",
            "dataset_id": "15138440",
            "provider": "충청북도 에너지과 (공공데이터포털 data.go.kr)",
            "url": "https://www.data.go.kr/data/15138440/fileData.do",
            "base_date": "2026-07-22",
            "base_date_note": "파일명 날짜(20260722)이자 가장 늦은 허가일. 포털 수정일은 2026-09-09",
            "fetched": date.today().isoformat(),
            "columns": list(rows_all[0].keys()),
            "rows_total": len(rows_all),
            "not_used": "전국태양광발전소전기사업허가정보표준데이터(15107742): 받은 50,000행에 청주시 제공분이 없어 쓰지 않음",
            "label_basis": labels["meta"].get("basis"),
            "match_rule": [
                "허가대장 설치장소가 지번형이면 (읍면, 리, 산 여부, 본번, 부번)이 건물 지번과 같을 때 같은 필지로 본다('번지'·'호'·공백·덧말 제거, 부번 없음은 0)",
                "도로명 주소만 있으면 브이월드 지오코더(type=ROAD)로 좌표를 얻어, 좌표가 건물 도형 안이면 그 건물의 필지, 그리고 좌표를 지번으로 되돌린 필지를 같은 필지로 본다",
                "한 필지에 건물이 여러 동이면 그 필지의 후보 건물 전부에 '같은 필지 허가 있음'을 붙인다. 어느 동 지붕인지는 대장으로 알 수 없다",
                "대장 상태(인허가·공사계획·공사진행·사업개시)를 가리지 않고 센다. 사업개시만 센 수는 matched_buildings_started",
            ],
            "limit": LIMIT,
            "caveats": [
                "허가만 받고 아직 짓지 않은 건(상태 '인허가')은 항공영상에 보이지 않는다",
                "'14-6 ,8,9', '221번지 46' 같은 애매한 지번 표기는 가능한 필지를 모두 후보로 넣었다(loose_lot_parse)",
                "발전소명·상호·대표자는 원자료에도 없고 이 파일에도 넣지 않는다",
            ],
        },
        "region": {
            "rule": "설치장소에 '오창읍' 또는 '옥산면 남촌리'가 들어간 행 + 옥산면 도로명 주소 가운데 지오코딩한 필지가 남촌리인 행",
            "rows_by_text": n_text,
            "rows": len(region),
            "address_type": dict(Counter(i["kind"] for i in region)),
            **{k: v for k, v in summarize(region).items() if k != "rows"},
        },
        "candidates": {"buildings": len(label), "parcels": len({bkey[b] for b in label if b in bkey})},
        "by_label": by_label,
        "ai_missed_candidates": [e["bld_id"] for e in by_label["미설치"]["matched"]],
        "ai_missed_strong": {
            "rule": "사업개시 허가가 있는 필지인데 그 필지의 후보 건물 가운데 AI '설치'가 한 동도 없는 경우의 '미설치' 동",
            "parcels": len(started_no_ai),
            "buildings": len(strong),
            "bld_ids": strong,
        },
        "matched_parcels": parcels,
        "matched": {
            **summarize(matched_rows),
            "buildings": len(bld_hit),
            "parcels": len(parcel_hit),
            "rows_by_method": dict(method_rows),
        },
        "unmatched": {"rows": sum(unmatched.values()), "by_reason": dict(unmatched)},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    brief = {k: v for k, v in out.items() if k != "by_label"}
    brief["by_label"] = {k: {x: y for x, y in v.items() if x != "matched"} for k, v in by_label.items()}
    print(json.dumps(brief, ensure_ascii=False, indent=1))
    print("지오코더 호출", geo.calls)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
