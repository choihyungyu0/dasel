# -*- coding: utf-8 -*-
"""포스터용 차트 07: 재사용 배터리 팩 수요와 ESS 부지 확인.
숫자는 data/quality/battery.json 에서만 읽는다.
실행: python scripts/analysis/chart_battery.py  (먼저 npx tsx scripts/analysis/battery.ts)
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker
from matplotlib.patches import Patch

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "quality" / "battery.json"
OUT = ROOT / "screenshots" / "poster" / "charts"

COLORS = {"설치 우선": "#0b5d34", "검토": "#f08c00"}
BLACK = "#000000"
INK = "#2b2f36"
LIGHT = "#c9ced6"
GRID = "#e3e6ea"
SITE_KEYS = ["부지 여유", "옥내 검토(충전율 80%)", "대지면적 정보 없음"]
SITE_COLORS = {"부지 여유": INK, "옥내 검토(충전율 80%)": "#7b8494", "대지면적 정보 없음": LIGHT}
SITE_TEXT = {"부지 여유": "white", "옥내 검토(충전율 80%)": "white", "대지면적 정보 없음": BLACK}

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


def ymd(s):
    s = str(s)
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else s


def n(v, d=0):
    return f"{v:,.{d}f}"


def main():
    if not SRC.exists():
        sys.exit(f"{SRC} 가 없습니다. 먼저 npx tsx scripts/analysis/battery.ts 를 실행하세요.")
    D = json.loads(SRC.read_text(encoding="utf-8"))
    meta, ol, tot = D["meta"], D["outlook"], D["total"]
    tiers = list(D["by_tier"].keys())
    rows = [(t, D["by_tier"][t], COLORS[t]) for t in tiers] + [("합계", tot, INK)]
    supply = ol["chungbuk_2030"]
    need = ol["need_vs_outlook"]

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 5.8), gridspec_kw={"wspace": 0.3, "width_ratios": [1.15, 1]})

    # 왼쪽: 팩 수 -----------------------------------------------------------
    xs = list(range(len(rows)))
    for x, (name, r, color) in zip(xs, rows):
        p = r["packs"]
        a1.bar(x, p["base"], width=0.58, color=color)
        a1.errorbar(x, p["base"], yerr=[[p["base"] - p["a_only"]], [p["b_only"] - p["base"]]], color=BLACK, linewidth=1.4, capsize=7, capthick=1.4)
        pc = need["total" if name == "합계" else name]
        a1.text(x, p["b_only"] + supply * 0.135, f"{n(p['base'])}개", ha="center", va="bottom", fontsize=13, fontweight="bold", color=BLACK)
        a1.text(x, p["b_only"] + supply * 0.02, f"A만 {n(p['a_only'])} ~ B만 {n(p['b_only'])}\n전망의 {pc['base_pct']:.1f}%", ha="center", va="bottom", fontsize=8.8, color=BLACK, linespacing=1.35)
    a1.axhline(supply, color=BLACK, linewidth=1.2, linestyle=(0, (4, 3)))
    a1.text(-0.42, supply + supply * 0.015, f"충북 2030년 사용후 배터리 발생 전망 {n(supply)}개(추정)", ha="left", va="bottom", fontsize=9.5, color=BLACK)
    a1.set_xticks(xs)
    a1.set_xticklabels([f"{name}\n({n(r['buildings'])}동)" for name, r, _ in rows], fontsize=10.5)
    a1.set_xlim(-0.5, len(rows) - 0.5)
    a1.set_ylim(0, supply * 1.14)
    a1.set_ylabel("재사용 팩 수(개)")
    a1.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: n(v)))
    a1.set_title("단계별 필요 팩 수", loc="left", fontsize=11.5)
    a1.grid(axis="y", color=GRID, linewidth=0.7)
    a1.set_axisbelow(True)
    a1.legend(handles=[plt.Line2D([0], [0], color=BLACK, linewidth=1.4, marker="_", markersize=9, label="범위: A등급만 ~ B등급만")],
              frameon=False, loc="upper left", bbox_to_anchor=(0.0, 0.86), fontsize=9)

    # 오른쪽: 부지 확인 ------------------------------------------------------
    ys = list(range(len(rows)))[::-1]
    for y, (name, r, _) in zip(ys, rows):
        left = 0.0
        total = r["buildings"]
        for k in SITE_KEYS:
            c = r["site"][k]
            w = c / total * 100 if total else 0
            a2.barh(y, w, left=left, height=0.56, color=SITE_COLORS[k], edgecolor="white", linewidth=0.8)
            if w >= 9:
                a2.text(left + w / 2, y, f"{c}동\n{w:.0f}%", ha="center", va="center", fontsize=10, fontweight="bold", color=SITE_TEXT[k], linespacing=1.25)
            elif c > 0:
                a2.annotate(f"옥내 검토 {c}동({w:.1f}%)", xy=(left + w / 2, y + 0.28), xytext=(left + w / 2, y + 0.43), ha="center", va="bottom", fontsize=8.8, color=BLACK,
                            arrowprops=dict(arrowstyle="-", color=BLACK, linewidth=0.6))
            left += w
    a2.set_yticks(ys)
    a2.set_yticklabels([f"{name}\n({n(r['buildings'])}동)" for name, r, _ in rows], fontsize=10.5)
    a2.set_xlim(0, 100)
    a2.set_ylim(-0.6, len(rows) - 0.25)
    a2.set_xlabel("건물 수 비율(%)")
    a2.set_title("옥외 부지 확인(필지 공지 기준)", loc="left", fontsize=11.5)
    a2.legend(handles=[Patch(facecolor=SITE_COLORS[k], edgecolor=INK, linewidth=0.5, label=k) for k in SITE_KEYS],
              frameon=False, loc="upper center", bbox_to_anchor=(0.46, -0.13), ncol=3, fontsize=9, columnspacing=1.2, handlelength=1.3)
    a2.set_axisbelow(True)

    c = meta["constants"]
    title = f"설치 우선·검토 {n(tot['buildings'])}동에 필요한 재사용 팩은 약 {n(tot['packs']['base'])}개 (1차 추정)"
    sub = (f"ESS 용량 합계 {tot['ess_kwh'] / 1000:.1f}MWh · 분산 단위 {n(tot['ess_units'])}개(단위당 {n(c['ESS_UNIT_MAX']['value'])}kWh 이하) · "
           f"필요 팩은 충북 2030년 전망의 {need['total']['a_only_pct']:.1f}~{need['total']['b_only_pct']:.1f}%(기본 {need['total']['base_pct']:.1f}%)")
    footer = (
        f"출처: {meta['buildings_source']}(기준일 {ymd(meta['buildings_base_date'])}) · {meta['register_source']} · 충북 전망 = 전국 2030년 {n(ol['nationwide_2030'])}개 × 충북 전기차 등록 비중 {ol['chungbuk_share'] * 100:.2f}%\n"
        f"{ol['nationwide_source']} · {ol['chungbuk_source']}\n"
        f"기본 = A등급 {c['A_RATIO']['value'] * 100:.0f}%(잔존용량 A {c['SOH_A']['value']}, B {c['SOH_B']['value']}), 팩 정격 {c['PACK_KWH']['value']}kWh, 충전율 {c['SOC_MIN']['value'] * 100:.0f}~{c['SOC_MAX']['value'] * 100:.0f}%(옥외) · "
        f"부지 여유 = 필지 공지 ÷ 단위당 {c['ESS_UNIT_AREA']['value']}㎡ 가 필요 단위 수 이상 · 계산일 {meta['generated']}\n"
        "발생한 배터리가 모두 재사용 등급을 받는 것은 아님 · 현장·구조검토 전 1차 추정값"
    )
    fig.suptitle(title, x=0.02, y=0.975, ha="left", va="top", fontsize=15, fontweight="bold", color=BLACK)
    fig.text(0.02, 0.905, sub, ha="left", va="top", fontsize=10.5, color=BLACK)
    fig.text(0.02, 0.02, footer, ha="left", va="bottom", fontsize=7.5, color=BLACK, linespacing=1.5)
    fig.subplots_adjust(top=0.80, bottom=0.30, left=0.08, right=0.98)
    OUT.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT / "07_battery.png", dpi=300)
    fig.savefig(OUT / "07_battery.svg")
    plt.close(fig)
    print("saved 07_battery")


if __name__ == "__main__":
    main()
