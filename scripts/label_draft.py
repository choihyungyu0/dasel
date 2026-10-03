"""AI 판독 초안(n,label 두 벌)을 건물 ID로 바꾼다.

입력  data/labels_draft/ai_pass1_n.txt, ai_pass2_n.txt (n,label), screenshots/label_tiles/index.json
출력  data/labels_ai/pass1.csv, pass2.csv (bld_id,label,labeler,image_year) — 사람 라벨이 없을 때 검증 계산의 초안으로 쓴다
      public/data/label_draft.json — 라벨링 화면의 제안(두 판독이 일치한 것만)
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
for i, rows in enumerate(passes, 1):
    with open(f"data/labels_ai/pass{i}.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["bld_id", "label", "labeler", "image_year"])
        for n in sorted(rows):
            w.writerow([index[n], rows[n], f"ai-{i}", ""])

agree = {n: l for n, l in passes[0].items() if passes[1][n] == l}
Path("public/data/label_draft.json").write_text(json.dumps({"meta": {"by": "AI 판독 초안(두 번 일치한 것만, 사람 확인 전)", "generated": date.today().isoformat()},
                                                           "labels": {str(index[n]): l for n, l in agree.items()}}, ensure_ascii=False), encoding="utf-8")
print("pass1", dict(Counter(passes[0].values())), "pass2", dict(Counter(passes[1].values())))
print("agree", len(agree), "/", len(index), dict(Counter(agree.values())))
print("disagree", sorted(n for n in index if n not in agree))
