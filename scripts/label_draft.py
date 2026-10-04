"""AI 판독 초안(n,label 두 벌)을 건물 ID로 바꾼다.

입력  data/labels_draft/ai_pass1_n.txt, ai_pass2_n.txt, ai_review_n.txt (n,label), screenshots/label_tiles/index.json
출력  data/labels_ai/final.csv (bld_id,label,labeler,image_year) — 사람 라벨이 없을 때 검증 계산에 쓴다
      public/data/label_draft.json — 라벨링 화면의 제안
"""
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

LABELS = {"설치", "미설치", "불명"}
index = {x["n"]: x["bld_id"] for x in json.loads(Path("screenshots/label_tiles/index.json").read_text(encoding="utf-8"))}
Path("data/labels_ai").mkdir(exist_ok=True)


def load(name):
    rows = {int(n): label.strip() for n, label in csv.reader(open(f"data/labels_draft/{name}", encoding="utf-8")) if n.strip().isdigit()}
    bad = [n for n, l in rows.items() if l not in LABELS or n not in index]
    missing = sorted(set(index) - set(rows))
    assert not bad and not missing, (bad[:5], missing[:5])
    return rows


passes = [load("ai_pass1_n.txt"), load("ai_pass2_n.txt")]
# 두 판독이 엇갈리거나 불확실했던 건물은 확대 이미지로 다시 판독했다(ai_review_n.txt). 재판독이 있으면 그것을 쓴다.
review = {int(n): label.strip() for n, label in csv.reader(open("data/labels_draft/ai_review_n.txt", encoding="utf-8"))}
assert all(l in LABELS and n in index for n, l in review.items())
agree = {n: l for n, l in passes[0].items() if passes[1][n] == l}
final = {**agree, **review}
missing = sorted(set(index) - set(final))
assert not missing, missing

for old in Path("data/labels_ai").glob("*.csv"):
    old.unlink()
with open("data/labels_ai/final.csv", "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["bld_id", "label", "labeler", "image_year"])
    for n in sorted(final):
        w.writerow([index[n], final[n], "ai", ""])

Path("public/data/label_draft.json").write_text(json.dumps({"meta": {"by": "항공영상 AI 판독", "generated": date.today().isoformat()},
                                                           "labels": {str(index[n]): l for n, l in final.items()}}, ensure_ascii=False), encoding="utf-8")
print("agree", len(agree), "/", len(index), "review", len(review))
print("final", dict(Counter(final.values())))
