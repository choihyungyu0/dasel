# -*- coding: utf-8 -*-
"""포스터용 차트 06: 규칙 점수와 ML 모델의 설치 건물 판별력 비교.
숫자는 data/quality/ml_check.json 에서만 읽는다.
실행: python scripts/analysis/chart_ml.py  (먼저 python scripts/09_ml_check.py)
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "quality" / "ml_check.json"
OUT = ROOT / "screenshots" / "poster" / "charts"

BLACK = "#000000"
INK = "#2b2f36"
BLUE = "#1456c8"
ORANGE = "#f08c00"
GRID = "#e3e6ea"

plt.rcParams.update({
    "font.family": "Malgun Gothic",
    "axes.unicode_minus": False,
    "text.color": BLACK,
    "axes.labelcolor": BLACK,
    "axes.edgecolor": BLACK,
    "xtick.color": BLACK,
    "ytick.color": BLACK,
    "axes.titlesize": 13,
    "axes.titleweight": "bold",
    "axes.labelsize": 10.5,
    "xtick.labelsize": 9.5,
    "ytick.labelsize": 9.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "svg.fonttype": "none",
    "figure.facecolor": "white",
    "savefig.facecolor": "white",
})

MODEL_LABEL = {"logistic": "로지스틱 회귀", "gradient_boosting": "그래디언트 부스팅"}
MODEL_COLOR = {"logistic": BLUE, "gradient_boosting": ORANGE}


def ymd(s):
    s = str(s)
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else s


def main():
    if not SRC.exists():
        sys.exit(f"{SRC} 가 없습니다. 먼저 python scripts/09_ml_check.py 를 실행하세요.")
    D = json.loads(SRC.read_text(encoding="utf-8"))
    st = D["settings"]
    meta = D.get("source_meta") or {}
    models = list(D["models"].keys())
    groups = list(D["rule_weights"].keys())

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 5.8), gridspec_kw={"wspace": 0.27, "width_ratios": [1, 1.45]})

    # 왼쪽: AUC -----------------------------------------------------------
    names = ["규칙 점수"] + [MODEL_LABEL[m] for m in models]
    stats = [D["rule"]["auc_folds"]] + [D["models"][m]["auc_folds"] for m in models]
    colors = [INK] + [MODEL_COLOR[m] for m in models]
    xs = list(range(len(names)))
    means = [s["mean"] for s in stats]
    stds = [s["std"] for s in stats]
    a1.bar(xs, means, width=0.6, color=colors, yerr=stds, capsize=5, error_kw=dict(ecolor=BLACK, elinewidth=1.1))
    a1.axhline(0.5, color=BLACK, linewidth=1.0, linestyle=(0, (4, 3)))
    a1.text(len(xs) - 0.64, 0.505, "무작위 0.5", ha="left", va="bottom", fontsize=9, color=BLACK)
    for x, mu, sd in zip(xs, means, stds):
        a1.text(x, mu + sd + 0.02, f"{mu:.3f}", ha="center", va="bottom", fontsize=13, fontweight="bold", color=BLACK)
        a1.text(x, 0.03, f"±{sd:.3f}", ha="center", va="bottom", fontsize=9.5, color="white", fontweight="bold")
    a1.set_xticks(xs)
    a1.set_xticklabels([n.replace("그래디언트 부스팅", "그래디언트\n부스팅").replace("로지스틱 회귀", "로지스틱\n회귀") for n in names], fontsize=10.5)
    a1.set_ylim(0, 1.0)
    a1.set_xlim(-0.55, len(xs) - 0.05)
    a1.set_ylabel("AUC (설치와 미설치 건물을 가려내는 정도)")
    a1.set_title("테스트 폴드 AUC 평균과 표준편차", loc="left", fontsize=11.5)
    a1.grid(axis="y", color=GRID, linewidth=0.7)
    a1.set_axisbelow(True)

    # 오른쪽: 그룹 중요도와 규칙 가중치(각각 다섯 그룹 합계 대비 비율) ----------
    wsum = sum(D["rule_weights"].values())
    series = [("규칙 가중치", INK, [D["rule_weights"][g] / wsum * 100 for g in groups])]
    for m in models:
        imp = [max(D["group_importance"][m][g]["mean"], 0.0) for g in groups]
        tot = sum(imp) or 1.0
        series.append((f"{MODEL_LABEL[m]} 중요도", MODEL_COLOR[m], [v / tot * 100 for v in imp]))
    w = 0.26
    gx = list(range(len(groups)))
    top = max(max(v) for _, _, v in series)
    for i, (lab, col, vals) in enumerate(series):
        pos = [x + (i - (len(series) - 1) / 2) * w for x in gx]
        a2.bar(pos, vals, width=w * 0.94, color=col, label=lab)
        for p, v in zip(pos, vals):
            a2.text(p, v + top * 0.012, f"{v:.0f}", ha="center", va="bottom", fontsize=8.5, color=BLACK)
    a2.set_xticks(gx)
    a2.set_xticklabels(groups, fontsize=10.5)
    a2.set_ylim(0, top * 1.14)
    a2.set_ylabel("다섯 항목 합계 대비 비율(%)")
    a2.set_title("항목별 비중: 규칙 가중치와 ML 중요도", loc="left", fontsize=11.5)
    a2.legend(frameon=False, loc="upper right", fontsize=9.5)
    a2.grid(axis="y", color=GRID, linewidth=0.7)
    a2.set_axisbelow(True)

    diff = " · ".join(f"{MODEL_LABEL[m]} {D['diff_ml_minus_rule'][m]['mean']:+.3f}" for m in models)
    rho = " · ".join(f"{MODEL_LABEL[m]} {D['rank_correlation'][m]['spearman_rho']:.2f}" for m in models)
    basis = "항공영상 AI 판독" if meta.get("labels_basis") == "ai" else "항공영상 판독"
    subtitle = (
        f"판독 {D['n']}동(설치 {D['positives']} · 미설치 {D['negatives']}, 불명 {D['excluded_unknown']}동 제외) · "
        f"층화 {st['n_splits']}겹 교차검증 {st['n_repeats']}회 반복(폴드 {st['n_folds_total']}개)\n"
        f"ML 빼기 규칙 AUC 평균: {diff}\n"
        f"규칙 가중치 순위와 중요도 순위의 스피어만 상관: {rho}"
    )
    footer = (
        f"출처: data/quality/ml_check.json (scripts/09_ml_check.py) · 라벨 = {basis}(생성일 {meta.get('labels_generated', '-')}) · "
        f"건물 자료 기준일 {ymd(meta.get('buildings_base_date', '-'))} · 계산일 {D['generated']}\n"
        f"오차막대 = 폴드 {st['n_folds_total']}개의 표준편차 · ML 중요도 = 테스트 폴드에서 항목의 열을 함께 섞었을 때 AUC 감소(permutation importance, 음수는 0)의 비율\n"
        f"주의: 설치 건물이 {D['positives']}동뿐이라 ML 은 과적합 위험이 있고 값이 크게 흔들림 · 설치 여부는 적합도의 대리 지표임 · 이 비교로 점수 규칙을 바꾸지 않음"
    )

    fig.suptitle(f"설치 건물 판별력 비교: 규칙 점수와 ML 모델 ({basis} 기준)", x=0.02, y=0.975, ha="left", va="top", fontsize=15, fontweight="bold", color=BLACK)
    fig.text(0.02, 0.905, subtitle, ha="left", va="top", fontsize=10, color=BLACK, linespacing=1.5)
    fig.text(0.02, 0.02, footer, ha="left", va="bottom", fontsize=7.5, color=BLACK, linespacing=1.5)
    fig.subplots_adjust(top=0.73, bottom=0.2, left=0.075, right=0.985)
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / "06_ml.png", dpi=300)
    fig.savefig(OUT / "06_ml.svg")
    plt.close(fig)
    print("saved 06_ml")


if __name__ == "__main__":
    main()
