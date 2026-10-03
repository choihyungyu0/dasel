"""BR-S4 ②: 등록공장 생산품 → 업종 1차 분류. 오창 공장 전체 검수표를 만든다.

입력  data/raw/factory.csv, config/industry_keywords.csv
출력  data/review/industry.csv (사람 검수용), data/factory_industry.json
"""
import csv
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POINTS = {"HIGH": 15, "MFG": 8, "NONE": 0}


def load_keywords():
    with open(ROOT / "config" / "industry_keywords.csv", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def matches(keyword, text):
    # 영문 약어는 다른 영단어 안에 묻힌 경우를 빼고 찾는다(예: Hubless 안의 ESS)
    if keyword.isascii():
        return re.search(rf"(?<![A-Za-z]){re.escape(keyword)}(?![A-Za-z])", text, re.I) is not None
    return keyword in text


def classify(product, keywords):
    text = (product or "").strip()
    if not text:
        return "NONE", [], []
    hits = [k for k in keywords if matches(k["keyword"], text)]
    return ("HIGH" if hits else "MFG"), hits, sorted({k["origin"] for k in hits})


def main():
    keywords = load_keywords()
    with open(ROOT / "data" / "raw" / "factory.csv", encoding="cp949", newline="") as f:
        rows = [r for r in csv.DictReader(f) if "오창" in r["공장주소"] or "오창" in r["단지명"]]

    out, stats = [], Counter()
    for r in rows:
        cls, hits, origins = classify(r["생산품"], keywords)
        groups = list(dict.fromkeys(k["group"] for k in hits))
        spec_only = "HIGH" if any(k["origin"] == "명세" for k in hits) else ("MFG" if cls != "NONE" else "NONE")
        stats[cls] += 1
        stats["spec_only_" + spec_only] += 1
        out.append({
            "순번": r["순번"], "회사명": r["회사명"].strip(), "단지명": r["단지명"].strip(), "생산품": r["생산품"].strip(),
            "1차분류": cls, "점수": POINTS[cls], "업종군": " / ".join(groups),
            "KSIC": " / ".join(dict.fromkeys(k["ksic"] for k in hits)),
            "근거키워드": ", ".join(dict.fromkeys(k["keyword"] for k in hits)),
            "키워드출처": "+".join(origins), "명세키워드만_분류": spec_only,
            "복수업종군": "Y" if len(groups) > 1 else "",
            "비제조의심": "Y" if cls == "MFG" and re.search("정비|수리|판매|임대|도매", r["생산품"]) else "",
            "검수결과": "", "검수메모": "",
        })
    out.sort(key=lambda x: (-x["점수"], x["업종군"], x["회사명"]))

    review = ROOT / "data" / "review"
    review.mkdir(parents=True, exist_ok=True)
    with open(review / "industry.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    (ROOT / "data" / "factory_industry.json").write_text(
        json.dumps([{"seq": x["순번"], "industry": None if x["1차분류"] == "NONE" else x["1차분류"],
                     "group": x["업종군"] or None, "keywords": x["근거키워드"] or None} for x in out],
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print("rows", len(out), dict(stats))
    print("group", Counter(g for x in out for g in x["업종군"].split(" / ") if g).most_common())
    print("keyword", Counter(k for x in out for k in x["근거키워드"].split(", ") if k).most_common())
    print("multi-group", sum(1 for x in out if x["복수업종군"]))


if __name__ == "__main__":
    main()
