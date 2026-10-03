"""AI 초안(n,label)을 건물 ID로 바꿔 라벨링 화면용 파일로 만든다. 검증 계산에는 쓰지 않는다.

입력  data/labels_draft/ai_draft_n.txt (n,label), screenshots/label_tiles/index.json
출력  public/data/label_draft.json, data/labels_draft/ai_draft.csv (bld_id,label,labeler,image_year)
"""
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

LABELS = {"설치", "미설치", "불명"}
index = {x["n"]: x["bld_id"] for x in json.loads(Path("screenshots/label_tiles/index.json").read_text(encoding="utf-8"))}
rows = [(int(n), label.strip()) for n, label in csv.reader(open("data/labels_draft/ai_draft_n.txt", encoding="utf-8")) if n.strip().isdigit()]
bad = [r for r in rows if r[1] not in LABELS or r[0] not in index]
assert not bad, bad[:5]
missing = sorted(set(index) - {n for n, _ in rows})
labels = {str(index[n]): label for n, label in rows}
Path("public/data/label_draft.json").write_text(json.dumps({"meta": {"by": "AI 초안(사람 확인 전)", "generated": date.today().isoformat()}, "labels": labels}, ensure_ascii=False), encoding="utf-8")
with open("data/labels_draft/ai_draft.csv", "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["bld_id", "label", "labeler", "image_year"])
    for bid, label in sorted(labels.items(), key=lambda x: int(x[0])):
        w.writerow([bid, label, "ai-draft", ""])
print("rows", len(rows), dict(Counter(l for _, l in rows)), "missing", missing[:10])
