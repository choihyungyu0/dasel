"""AI 판독 근거 탭 자료: 판독 이미지(webp 800px)와 건물별 판독 기록을 모은다.

입력  screenshots/label_tiles/NNN_{bld_id}.jpg, data/labels_draft/ai_pass1_n.txt·ai_pass2_n.txt·ai_review_n.txt(NNN 순번),
      data/labels_draft/ai_blind_queue.csv, data/labels_ai/final.csv, data/labels/human_sample20.csv,
      data/labels_draft/roof_passA.csv·roof_passB.csv, data/quality/permit.json
출력  public/label_tiles/{bld_id}.webp, public/data/evidence.json
"""
import csv
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TILES = ROOT / "screenshots" / "label_tiles"
OUT_IMG = ROOT / "public" / "label_tiles"
D = ROOT / "data"


def by_n(path):
    out = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "," in line:
            n, label = line.split(",", 1)
            out[int(n)] = label.strip()
    return out


def rows(path):
    with path.open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main():
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    p1, p2, rv = (by_n(D / "labels_draft" / f) for f in ("ai_pass1_n.txt", "ai_pass2_n.txt", "ai_review_n.txt"))
    final = {int(r["bld_id"]): r["label"] for r in rows(D / "labels_ai" / "final.csv")}
    blind = {int(r["bld_id"]): r["label"] for r in rows(D / "labels_draft" / "ai_blind_queue.csv")}
    human = {int(r["bld_id"]): r["label"] for r in rows(D / "labels" / "human_sample20.csv")}
    ra = {int(r["bld_id"]): r["blocked_pct"] for r in rows(D / "labels_draft" / "roof_passA.csv")}
    rb = {int(r["bld_id"]): r["blocked_pct"] for r in rows(D / "labels_draft" / "roof_passB.csv")}
    permit = {}
    for p in json.loads((D / "quality" / "permit.json").read_text(encoding="utf-8")).get("matched_parcels", []):
        for i in p["bld_ids"]:
            permit[i] = {"rows": p["permit_rows"], "kw": p["capacity_kw"], "years": p.get("permit_years", []), "status": p.get("status", {})}

    ev = {}
    for f in sorted(TILES.glob("*_*.jpg")):
        n, bid = (int(x) for x in f.stem.split("_"))
        im = Image.open(f).convert("RGB")
        if im.width > 800:
            im = im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS)
        im.save(OUT_IMG / f"{bid}.webp", "WEBP", quality=72, method=6)
        use = lambda v: None if v in (None, "") else round(1 - float(v) / 100, 2)
        a, b = use(ra.get(bid)), use(rb.get(bid))
        ev[bid] = {
            "ai": final.get(bid),
            "pass1": p1.get(n), "pass2": p2.get(n), "review": rv.get(n), "blind": blind.get(bid),
            "human": human.get(bid),
            "roof": None if a is None or b is None else {"a": a, "b": b, "mean": round((a + b) / 2, 2)},
            "permit": permit.get(bid),
        }
    meta = {"source": "브이월드 항공영상(국토지리정보원 정사영상) 건물별 캡처 · Claude 에이전트 판독",
            "rule": "1차·2차 독립 판독, 엇갈리면 재판독 · 일부는 앞선 판독을 보지 않은 눈가림 재판독"}
    (ROOT / "public" / "data" / "evidence.json").write_text(json.dumps({"meta": meta, "evidence": ev}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(ev), sum(1 for v in ev.values() if v["human"]), sum(1 for v in ev.values() if v["permit"]), sum(1 for v in ev.values() if v["roof"]))


if __name__ == "__main__":
    main()
