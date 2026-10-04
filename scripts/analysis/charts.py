# -*- coding: utf-8 -*-
"""포스터용 분석 차트 5개. 숫자는 public/data/poster_numbers.json 에서만 읽는다.
실행: python scripts/analysis/charts.py  (먼저 npx tsx scripts/analysis/build_numbers.ts)
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public" / "data" / "poster_numbers.json"
OUT = ROOT / "screenshots" / "poster" / "charts"

COLORS = {"설치 우선": "#0b5d34", "검토": "#f08c00", "보류": "#7b8494", "이미 설치됨": "#1456c8"}
BLACK = "#000000"
INK = "#2b2f36"   # 단계와 무관한 막대·선
LIGHT = "#c9ced6"
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

D = json.loads(SRC.read_text(encoding="utf-8"))
META = D["meta"]


def ymd(s):
    s = str(s)
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else s


def finish(fig, name, title, footer, subtitle=None, top=0.86, bottom=0.17):
    fig.suptitle(title, x=0.02, y=0.975, ha="left", va="top", fontsize=15, fontweight="bold", color=BLACK)
    if subtitle:
        fig.text(0.02, 0.905, subtitle, ha="left", va="top", fontsize=10.5, color=BLACK)
    fig.text(0.02, 0.02, footer, ha="left", va="bottom", fontsize=7.5, color=BLACK, linespacing=1.5)
    fig.subplots_adjust(top=top, bottom=bottom)
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / f"{name}.png", dpi=300)
    fig.savefig(OUT / f"{name}.svg")
    plt.close(fig)
    print("saved", name)


def n(v, d=0):
    return f"{v:,.{d}f}"


# 01 용량 분포 -----------------------------------------------------------
def chart_capacity():
    c = D["capacity"]
    kw, cum, status = c["pv_kw"], c["cum_share"], c["status"]
    x = list(range(1, len(kw) + 1))
    n50 = c["n_for_50pct"]
    fig, ax = plt.subplots(figsize=(10, 5.8))
    ax.bar(x, kw, width=1.0, color=[COLORS[s] for s in status], linewidth=0)
    ax.set_xlim(0, len(kw) + 1)
    ax.set_ylim(0, max(kw) * 1.05)
    ax.set_xlabel("건물 순번(설치 가능 용량이 큰 순)")
    ax.set_ylabel("건물별 설치 가능 용량(kW)")
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: n(v)))
    ax2 = ax.twinx()
    ax2.spines["right"].set_visible(True)
    ax2.plot(x, [v * 100 for v in cum], color=BLACK, linewidth=1.8)
    ax2.set_ylim(0, 105)
    ax2.set_ylabel("누적 용량 비율(%)")
    ax2.axhline(50, color=BLACK, linewidth=0.8, linestyle=(0, (4, 3)))
    ax2.axvline(n50, color=BLACK, linewidth=0.8, linestyle=(0, (4, 3)))
    ax2.plot([n50], [cum[n50 - 1] * 100], "o", color=BLACK, markersize=6)
    ax2.annotate(
        f"용량 큰 순 {n50}동(전체의 {c['share_of_n_for_50pct'] * 100:.0f}%)이\n전체 용량의 50%",
        xy=(n50, cum[n50 - 1] * 100), xytext=(n50 + 38, 31), fontsize=12, fontweight="bold", color=BLACK,
        arrowprops=dict(arrowstyle="-", color=BLACK, linewidth=0.8), va="center",
    )
    n80 = c["n_for_80pct"]
    ax2.plot([n80], [cum[n80 - 1] * 100], "o", color=BLACK, markersize=4)
    ax2.annotate(f"{n80}동 → 80%", xy=(n80, cum[n80 - 1] * 100), xytext=(n80 + 12, 72), fontsize=9.5, color=BLACK,
                 arrowprops=dict(arrowstyle="-", color=BLACK, linewidth=0.6))
    present = [s for s in COLORS if s in set(status)]
    handles = [Patch(color=COLORS[s], label=s) for s in present]
    handles.append(plt.Line2D([0], [0], color=BLACK, linewidth=1.8, label="누적 용량 비율"))
    ax.legend(handles=handles, loc="center right", bbox_to_anchor=(0.985, 0.27), frameon=False, fontsize=9.5)
    hist = " · ".join(f"{h['label']} {h['count']}동" for h in c["histogram"])
    finish(
        fig, "01_capacity", "지붕 태양광 설치 가능 용량은 소수의 큰 건물에 몰려 있다",
        f"출처: {META['sources']['capacity']}\n"
        f"구간별 동 수: {hist} · 건물 자료 기준일 {ymd(META['buildings_base_date'])} · 계산일 {META['generated']} · 현장 확인 전 1차 추정값",
        subtitle=f"30kW 이상 대상 건물 {n(c['count'])}동 · 합계 {c['total_mw']:.1f}MW · 가장 큰 건물 {n(c['max_kw'])}kW · 중앙값 {n(c['median_kw'])}kW",
    )


# 02 산단별 단계 ---------------------------------------------------------
def chart_tiers():
    t = D["tiers_by_complex"]
    statuses = t["statuses"]
    cx = t["complexes"]
    fig, axes = plt.subplots(1, len(cx), figsize=(10, 5.6), gridspec_kw={"wspace": 0.28})
    if len(cx) == 1:
        axes = [axes]
    for ax, c in zip(axes, cx):
        vals = [c["counts"][s] for s in statuses]
        bars = ax.bar(range(len(statuses)), vals, color=[COLORS[s] for s in statuses], width=0.72)
        top = max(vals) if max(vals) > 0 else 1
        ax.set_ylim(0, top * 1.16)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + top * 0.02, f"{v:,}동", ha="center", va="bottom", fontsize=11, fontweight="bold", color=BLACK)
        ax.set_xticks(range(len(statuses)))
        ax.set_xticklabels([s.replace("이미 설치됨", "이미\n설치됨").replace("설치 우선", "설치\n우선") for s in statuses], fontsize=10)
        ax.set_title(f"{c['complex_nm']}  (대상 {c['total']:,}동)", fontsize=12, loc="left", pad=10)
        ax.yaxis.set_major_locator(matplotlib.ticker.MaxNLocator(integer=True, nbins=5))
        ax.grid(axis="y", color=GRID, linewidth=0.7)
        ax.set_axisbelow(True)
        hi = statuses.index("보류")
        if c["hold_small"] > 0 and vals[hi] > 0:
            ax.text(hi, vals[hi] * 0.5, f"30kW\n미만\n{c['hold_small']:,}동", ha="center", va="center", fontsize=8.5, color="white", fontweight="bold")
    axes[0].set_ylabel("건물 수(동) — 산단마다 세로축 눈금이 다름")
    tot = t["total"]
    basis = (META.get("labels") or {}).get("basis")
    basis_txt = "항공영상 AI 판독 기준" if basis == "ai" else "항공영상 판독 기준"
    finish(
        fig, "02_tiers_by_complex", "산업단지별 검토 단계",
        f"출처: {META['sources']['tiers_by_complex']}\n"
        f"'이미 설치됨'은 {basis_txt}이며 단계보다 먼저 분류 · 보류에는 30kW 미만 소규모 지붕 포함 · "
        f"건물 자료 기준일 {ymd(META['buildings_base_date'])} · 계산일 {META['generated']}",
        subtitle=f"대상 건물 {t['targets']:,}동 — " + " · ".join(f"{s} {tot[s]:,}동" for s in statuses),
        top=0.80,
    )


# 03 단가 ----------------------------------------------------------------
def chart_tariff():
    t = D["tariff"]
    ms = t["months"]
    labels = [m["month"][2:].replace("-", ".") for m in ms]
    ys = [m["unit_cost"] for m in ms]
    xs = list(range(len(ms)))
    fig, ax = plt.subplots(figsize=(10, 5.2))
    yy = [float("nan") if v is None else v for v in ys]
    ax.plot(xs, yy, color=INK, linewidth=2.2, marker="o", markersize=6, markerfacecolor="white", markeredgewidth=1.8)
    valid = [v for v in ys if v is not None]
    if valid:
        lo, hi = min(valid), max(valid)
        ax.set_ylim(lo - (hi - lo) * 0.35 - 2, hi + (hi - lo) * 0.3 + 2)
        for x, v in zip(xs, ys):
            if v is None:
                ax.text(x, ax.get_ylim()[0] + 1, "자료 없음", ha="center", va="bottom", fontsize=8, color=BLACK)
                continue
            below = t.get("mean") is not None and v < t["mean"]
            ax.annotate(f"{v:.1f}", (x, v), textcoords="offset points", xytext=(0, -11 if below else 9), ha="center", va="top" if below else "bottom", fontsize=9.5,
                        fontweight="bold" if x == len(xs) - 1 else "normal", color=BLACK)
        if t.get("mean") is not None:
            ax.axhline(t["mean"], color=BLACK, linewidth=0.8, linestyle=(0, (4, 3)))
            ax.text(len(xs) - 0.55, t["mean"] - (hi - lo) * 0.02, f"13개월 평균 {t['mean']:.1f}", ha="right", va="top", fontsize=9, color=BLACK)
    ax.set_xticks(xs)
    ax.set_xticklabels(labels)
    ax.set_xlim(-0.5, len(xs) - 0.5)
    ax.set_xlabel("연.월")
    ax.set_ylabel("평균판매단가(원/kWh)")
    ax.grid(axis="y", color=GRID, linewidth=0.7)
    ax.set_axisbelow(True)
    latest = t.get("latest")
    sub = f"최근 13개월 {t['min']:.1f}~{t['max']:.1f}원/kWh" if valid else "조회된 값 없음"
    if latest:
        sub += f" · 가장 최근 공개월 {latest['month'].replace('-', '.')} {latest['unit_cost']:.1f}원/kWh"
    failed = t.get("failed") or []
    extra = f" · 조회 실패 {', '.join(failed)}" if failed else ""
    finish(
        fig, "03_tariff", "청주시 산업용 전기 평균판매단가",
        f"출처: {META['sources']['tariff']} · 조회일 {META['generated']}{extra}\n"
        "평균판매단가 = 판매수입 ÷ 판매전력량(월별 계약종별 집계). 개별 공장의 실제 요금은 계약·사용 시간대에 따라 다름",
        subtitle=sub,
    )


# 04 검증 ----------------------------------------------------------------
def chart_validation():
    v = D.get("validation")
    if not v:
        print("validation 없음 — 04 건너뜀")
        return
    ai = v.get("basis") == "ai"
    base = v["baseRate"]
    tk = [k for k in v["topK"] if round(k["k"], 2) in (0.1, 0.2)]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 5.6), gridspec_kw={"wspace": 0.3, "width_ratios": [1, 1.25]})

    xs = list(range(len(tk)))
    prec = [k["precision"] * 100 for k in tk]
    bars = a1.bar(xs, prec, width=0.6, color=COLORS["이미 설치됨"])
    a1.axhline(base * 100, color=BLACK, linewidth=1.2, linestyle=(0, (4, 3)))
    a1.text(len(tk) - 0.62, base * 100 + 0.8, f"무작위\n기대값\n{base * 100:.1f}%", ha="left", va="bottom", fontsize=9.5, color=BLACK)
    for b, k in zip(bars, tk):
        a1.text(b.get_x() + b.get_width() / 2, b.get_height() + 3.6, f"{k['precision'] * 100:.1f}%", ha="center", va="bottom", fontsize=13, fontweight="bold", color=BLACK)
        a1.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.8, f"기대값의 {k['lift']:.1f}배", ha="center", va="bottom", fontsize=9.5, color=BLACK)
        a1.text(b.get_x() + b.get_width() / 2, 2.0, f"판독 {k['judged']}동 중\n설치 {k['installed']}동", ha="center", va="bottom", fontsize=8, color="white", fontweight="bold")
    a1.set_xticks(xs)
    a1.set_xticklabels([f"점수 상위 {k['k'] * 100:.0f}%\n({k['n']}동)" for k in tk], fontsize=10.5)
    a1.set_ylim(0, max(prec + [base * 100]) * 1.25)
    a1.set_xlim(-0.6, len(tk) + 0.05)
    a1.set_ylabel("이미 태양광이 설치된 건물 비율(%)")
    a1.set_title("점수 상위 건물 중 기존 설치 비율", loc="left", fontsize=11.5)
    a1.grid(axis="y", color=GRID, linewidth=0.7)
    a1.set_axisbelow(True)

    bins = [b for b in v["bins"]]
    while bins and bins[0]["installed"] + bins[0]["notInstalled"] == 0:
        bins = bins[1:]
    bx = list(range(len(bins)))
    ni = [b["notInstalled"] for b in bins]
    ins = [b["installed"] for b in bins]
    a2.bar(bx, ni, width=0.78, color=COLORS["보류"], label="미설치")
    a2.bar(bx, ins, width=0.78, bottom=ni, color=COLORS["이미 설치됨"], label="설치")
    top = max(a + b for a, b in zip(ni, ins))
    for x, a, b in zip(bx, ni, ins):
        tot = a + b
        if tot:
            a2.text(x, tot + top * 0.015, f"설치 {b}동\n({b / tot * 100:.0f}%)", ha="center", va="bottom", fontsize=8.5, color=BLACK)
    a2.set_ylim(0, top * 1.2)
    a2.set_xticks(bx)
    a2.set_xticklabels([f"{b['from']}~{b['to']}" for b in bins])
    a2.set_xlabel("적합도 점수 구간(점)")
    a2.set_ylabel("건물 수(동)")
    a2.set_title("점수 구간별 설치·미설치 건물 수", loc="left", fontsize=11.5)
    a2.legend(frameon=False, loc="upper left", fontsize=9.5)
    a2.grid(axis="y", color=GRID, linewidth=0.7)
    a2.set_axisbelow(True)

    cnt = v.get("counts", {})
    mean = v.get("mean", {})
    sub = f"판독 {v.get('labeled', sum(cnt.values()))}동: 설치 {cnt.get('설치', 0)} · 미설치 {cnt.get('미설치', 0)} · 불명 {cnt.get('불명', 0)}(비율 계산에서 제외)"
    if mean:
        sub += f" · 평균 점수 설치 {mean.get('installed')}점 / 미설치 {mean.get('notInstalled')}점"
    if v.get("auc") is not None:
        sub += f" · AUC {v['auc']:.2f}"
    m = v.get("mw") if isinstance(v.get("mw"), dict) else None
    mw_txt = f" · Mann-Whitney U={m['u']:,.0f}, p={m['p']}, 효과크기 {m['effect']}" if m else ""
    title = "점수 상위 건물에는 이미 태양광을 올린 곳이 기대값보다 많다"
    if ai:
        title += "  — 항공영상 AI 판독 기준"
    finish(
        fig, "04_validation", title,
        f"출처: {META['sources']['validation']} · 판독 결과 생성일 {v.get('generated', '-')}{mw_txt}\n"
        f"무작위 기대값 = 판독된 건물 중 설치 비율. 점수는 설치 여부를 쓰지 않고 계산함 · 건물 자료 기준일 {ymd(META['buildings_base_date'])}",
        subtitle=sub, top=0.80,
    )


# 05 민감도 --------------------------------------------------------------
def chart_sensitivity():
    s = D["sensitivity"]
    sp = s["spearman"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 5.6), gridspec_kw={"wspace": 0.28, "width_ratios": [1.2, 1]})

    ret = [r * 100 for r in s["top_retention"]]
    xs = list(range(1, len(ret) + 1))
    a1.bar(xs, ret, width=0.8, color=[INK if r >= 90 else LIGHT for r in ret], edgecolor=INK, linewidth=0.6)
    a1.axhline(90, color=BLACK, linewidth=1.0, linestyle=(0, (4, 3)))
    a1.set_ylim(0, 124)
    a1.set_yticks([0, 20, 40, 60, 80, 90, 100])
    a1.set_xlim(0.2, len(ret) + 0.8)
    a1.set_xticks([1] + list(range(5, len(ret) + 1, 5)))
    a1.set_xlabel(f"기본 가중치 순위(상위 10% = {s['top_count']}동, 번호로 표시)")
    a1.set_ylabel(f"{s['runs']:,}회 중 상위 10%에 남은 비율(%)")
    a1.set_title(f"상위 {s['top_count']}동 중 {s['top_stable_90']}동이 90% 이상 유지", loc="left", fontsize=11.5)
    a1.legend(handles=[Patch(facecolor=INK, edgecolor=INK, label=f"90% 이상 유지 {s['top_stable_90']}동"),
                       Patch(facecolor=LIGHT, edgecolor=INK, label=f"90% 미만 {s['top_count'] - s['top_stable_90']}동")],
              frameon=False, loc="upper left", ncol=2, fontsize=9.5)
    a1.grid(axis="y", color=GRID, linewidth=0.7)
    a1.set_axisbelow(True)

    a2.hist(sp["values"], bins=24, color=INK, edgecolor="white", linewidth=0.6)
    ymax = a2.get_ylim()[1]
    a2.set_ylim(0, ymax * 1.28)
    for val, lab, yf, ha, dx in ((sp["mean"], f"평균 {sp['mean']:.3f}", 1.19, "left", 0.0008), (sp["p05"], f"5% 분위 {sp['p05']:.3f}", 1.09, "left", 0.0008)):
        a2.axvline(val, color=BLACK, linewidth=1.0, linestyle=(0, (4, 3)), ymax=(yf + 0.04) / 1.28)
        a2.text(val + dx, ymax * yf, lab, ha=ha, va="center", fontsize=10, fontweight="bold", color=BLACK)
    a2.text(sp["min"], ymax * 0.24, f"최소 {sp['min']:.3f}", ha="left", va="bottom", fontsize=9.5, color=BLACK)
    a2.set_xlabel("기본 순위와의 스피어만 순위 상관")
    a2.set_ylabel("횟수(회)")
    a2.set_title(f"전체 {s['population']}동 순위의 상관", loc="left", fontsize=11.5)
    a2.grid(axis="y", color=GRID, linewidth=0.7)
    a2.set_axisbelow(True)

    finish(
        fig, "05_sensitivity", "가중치를 ±20% 흔들어도 순위는 거의 그대로다",
        f"출처: {META['sources']['sensitivity']} · 후보 = 30kW 이상 대상 건물 {s['population']}동\n"
        f"순위 = 점수 내림차순(동점은 설치 가능 용량 큰 순) · 건물 자료 기준일 {ymd(META['buildings_base_date'])} · 계산일 {META['generated']}",
        subtitle=f"항목별 가중치를 각각 ±{s['spread'] * 100:.0f}% 범위에서 무작위로 바꿔 {s['runs']:,}회 다시 계산 · 상위 10% 평균 유지율 {s['top_mean_retention'] * 100:.1f}% · 순위 상관 평균 {sp['mean']:.3f}",
        top=0.80,
    )


if __name__ == "__main__":
    if not SRC.exists():
        sys.exit(f"{SRC} 가 없습니다. 먼저 npx tsx scripts/analysis/build_numbers.ts 를 실행하세요.")
    import matplotlib.ticker  # noqa: F401
    chart_capacity()
    chart_tiers()
    chart_tariff()
    chart_validation()
    chart_sensitivity()
