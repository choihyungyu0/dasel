# -*- coding: utf-8 -*-
"""규칙 점수와 ML 모델을 같은 조건에서 비교한다(보고용. 점수 규칙·가중치는 바꾸지 않는다).
질문: '이미 태양광을 설치한 건물'을 규칙 점수가 ML 모델만큼 가려내는가.
입력: data/quality/features.json (먼저 npx tsx scripts/analysis/export_features.ts)
출력: data/quality/ml_check.json
실행: python scripts/09_ml_check.py
"""
import json
import re
import sys
import warnings
from datetime import date
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "quality" / "features.json"
OUT = ROOT / "data" / "quality" / "ml_check.json"

SEEDS = list(range(20))
N_SPLITS = 5
PERM_REPEATS = 10
GB_PARAMS = dict(n_estimators=100, max_depth=2, learning_rate=0.1)

# lib/score.ts structPoints 와 같은 구분(20 / 12 / 5 / 0)
RC = re.compile(r"철근콘크리트|철골콘크리트|프리[케캐]스트콘크리트")
STEEL = re.compile(r"철골|강파이프|강구조")
STRUCT_CATS = ["콘크리트계", "철골계", "기타", "정보없음"]
STRUCT_POINTS = {"콘크리트계": 20, "철골계": 12, "기타": 5, "정보없음": 0}
INDUSTRY_CATS = ["HIGH", "MFG", "미매칭"]

GROUPS = ["규모", "구조", "사용연수", "업종", "배전"]
RULE_WEIGHTS = {"규모": 30, "구조": 20, "사용연수": 15, "업종": 15, "배전": 10}


def struct_cat(s):
    if not s:
        return "정보없음"
    if RC.search(s):
        return "콘크리트계"
    if STEEL.search(s):
        return "철골계"
    return "기타"


def build(rows):
    """특징 행렬. age_years 결측은 NaN 으로 두고 폴드 안에서 중앙값으로 채운다(결측 표시 열은 따로)."""
    cols, group_of = [], {}

    def add(name, group, values):
        cols.append((name, np.asarray(values, dtype=float)))
        group_of[name] = group

    add("pt_scale", "규모", [r["parts"]["scale"] for r in rows])
    add("log1p_pv_kw", "규모", np.log1p([r["pv_kw"] for r in rows]))

    add("pt_struct", "구조", [r["parts"]["struct"] for r in rows])
    cats = [struct_cat(r["struct"]) for r in rows]
    for r, c in zip(rows, cats):
        if STRUCT_POINTS[c] != r["parts"]["struct"]:
            sys.exit(f"구조 구분이 lib/score.ts 와 다릅니다: {r['struct']} → {c}, 점수 {r['parts']['struct']}")
    for c in STRUCT_CATS:
        add(f"struct={c}", "구조", [1.0 if x == c else 0.0 for x in cats])

    add("pt_age", "사용연수", [r["parts"]["age"] for r in rows])
    add("age_years", "사용연수", [np.nan if r["age_years"] is None else r["age_years"] for r in rows])
    add("age_missing", "사용연수", [1.0 if r["age_years"] is None else 0.0 for r in rows])

    add("pt_industry", "업종", [r["parts"]["industry"] for r in rows])
    inds = [r["industry"] or "미매칭" for r in rows]
    for c in INDUSTRY_CATS:
        add(f"industry={c}", "업종", [1.0 if x == c else 0.0 for x in inds])

    add("pt_grid", "배전", [r["parts"]["grid"] for r in rows])
    for k in ("grid_min_kw", "grid_max_kw"):
        vals = [np.nan if r[k] is None else r[k] for r in rows]
        add(k, "배전", vals)
        if any(np.isnan(v) for v in vals):
            add(f"{k}_missing", "배전", [1.0 if np.isnan(v) else 0.0 for v in vals])

    names = [n for n, _ in cols]
    X = np.column_stack([v for _, v in cols])
    return X, names, group_of, cats, inds


def models(seed):
    return {
        "logistic": make_pipeline(
            SimpleImputer(strategy="median"), StandardScaler(),
            LogisticRegression(class_weight="balanced", max_iter=5000),
        ),
        "gradient_boosting": make_pipeline(
            SimpleImputer(strategy="median"),
            GradientBoostingClassifier(random_state=seed, **GB_PARAMS),
        ),
    }


def ms(a):
    a = np.asarray(a, dtype=float)
    return {"mean": round(float(a.mean()), 4), "std": round(float(a.std(ddof=1)), 4)}


def main():
    if not SRC.exists():
        sys.exit(f"{SRC} 가 없습니다. 먼저 npx tsx scripts/analysis/export_features.ts 를 실행하세요.")
    doc = json.loads(SRC.read_text(encoding="utf-8"))
    all_rows = doc["buildings"]
    rows = [r for r in all_rows if r["label"] in ("설치", "미설치")]
    y = np.array([1 if r["label"] == "설치" else 0 for r in rows])
    rule = np.array([r["score"] for r in rows], dtype=float)
    X, names, group_of, cats, inds = build(rows)
    gidx = {g: [i for i, n in enumerate(names) if group_of[n] == g] for g in GROUPS}
    MODELS = list(models(0).keys())

    fold_auc = {m: [] for m in MODELS}          # 폴드 100개
    fold_rule = []
    fold_rep = []                               # 각 폴드가 속한 반복(시드)
    fold_imp = {m: {g: [] for g in GROUPS} for m in MODELS}  # 폴드별 그룹 중요도(섞기 10회 평균)

    for seed in SEEDS:
        skf = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=seed)
        for k, (tr, te) in enumerate(skf.split(X, y)):
            fold_rep.append(seed)
            fold_rule.append(roc_auc_score(y[te], rule[te]))
            rng = np.random.default_rng(seed * 1000 + k)
            for m, est in models(seed).items():
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    est.fit(X[tr], y[tr])
                base = roc_auc_score(y[te], est.predict_proba(X[te])[:, 1])
                fold_auc[m].append(base)
                for g in GROUPS:
                    drops = []
                    for _ in range(PERM_REPEATS):
                        Xp = X[te].copy()
                        perm = rng.permutation(len(te))
                        Xp[:, gidx[g]] = Xp[perm][:, gidx[g]]  # 그룹의 열을 같은 순서로 함께 섞음
                        drops.append(base - roc_auc_score(y[te], est.predict_proba(Xp)[:, 1]))
                    fold_imp[m][g].append(float(np.mean(drops)))

    fold_rep = np.array(fold_rep)
    fold_rule = np.array(fold_rule)

    def by_rep(a):
        a = np.asarray(a)
        return np.array([a[fold_rep == s].mean() for s in SEEDS])

    rule_rep = by_rep(fold_rule)
    weights = [RULE_WEIGHTS[g] for g in GROUPS]
    res_models, res_diff, res_imp, res_rank = {}, {}, {}, {}
    for m in MODELS:
        a = np.array(fold_auc[m])
        rep = by_rep(a)
        res_models[m] = {
            "auc_folds": ms(a),
            "auc_repeats": ms(rep),
            "auc_by_repeat": [round(float(v), 4) for v in rep],
        }
        d_fold = a - fold_rule
        d_rep = rep - rule_rep
        res_diff[m] = {
            "mean": round(float(d_fold.mean()), 4),
            "std_folds": round(float(d_fold.std(ddof=1)), 4),
            "std_repeats": round(float(d_rep.std(ddof=1)), 4),
            "min_repeat": round(float(d_rep.min()), 4),
            "max_repeat": round(float(d_rep.max()), 4),
            "share_repeats_positive": round(float((d_rep > 0).mean()), 4),
            "share_folds_positive": round(float((d_fold > 0).mean()), 4),
            "by_repeat": [round(float(v), 4) for v in d_rep],
        }
        imp = {g: ms(fold_imp[m][g]) for g in GROUPS}
        res_imp[m] = imp
        means = [imp[g]["mean"] for g in GROUPS]
        rho, p = spearmanr(means, weights)  # 동률은 평균순위
        order = sorted(GROUPS, key=lambda g: -imp[g]["mean"])
        res_rank[m] = {
            "importance_order": order,
            "spearman_rho": None if np.isnan(rho) else round(float(rho), 4),
            "p_value": None if np.isnan(p) else round(float(p), 4),
        }

    out = {
        "generated": date.today().isoformat(),
        "source": "data/quality/features.json",
        "source_meta": doc.get("meta"),
        "n": int(len(y)),
        "positives": int(y.sum()),
        "negatives": int((y == 0).sum()),
        "excluded_unknown": int(sum(1 for r in all_rows if r["label"] not in ("설치", "미설치"))),
        "settings": {
            "cv": "StratifiedKFold(shuffle=True)",
            "n_splits": N_SPLITS,
            "seeds": SEEDS,
            "n_repeats": len(SEEDS),
            "n_folds_total": N_SPLITS * len(SEEDS),
            "std": "표본 표준편차(ddof=1)",
            "logistic": "중앙값 대치 → 표준화 → LogisticRegression(class_weight='balanced')",
            "gradient_boosting": {**GB_PARAMS, "preprocess": "중앙값 대치", "random_state": "반복 시드"},
            "permutation": {"scoring": "roc_auc", "n_repeats": PERM_REPEATS, "on": "테스트 폴드", "unit": "특징 그룹(그룹의 열을 함께 섞음)"},
            "features": names,
            "feature_groups": {g: [names[i] for i in gidx[g]] for g in GROUPS},
            "category_counts": {
                "struct": {c: cats.count(c) for c in STRUCT_CATS},
                "industry": {c: inds.count(c) for c in INDUSTRY_CATS},
            },
        },
        "rule": {
            "auc_all": round(float(roc_auc_score(y, rule)), 4),
            "auc_folds": ms(fold_rule),
            "auc_repeats": ms(rule_rep),
            "auc_by_repeat": [round(float(v), 4) for v in rule_rep],
            "note": "규칙 점수는 학습하지 않는다. ML 과 같은 테스트 폴드에서 score 로 AUC 를 계산",
        },
        "models": res_models,
        "diff_ml_minus_rule": res_diff,
        "group_importance": res_imp,
        "rule_weights": RULE_WEIGHTS,
        "rank_correlation": res_rank,
        "rank_correlation_note": "그룹 5개의 permutation importance 평균과 규칙 가중치(30/20/15/15/10)의 스피어만 순위상관. 점이 5개뿐이라 p 값은 참고용",
        "caveats": [
            f"양성(설치)이 {int(y.sum())}동뿐이다. 테스트 폴드마다 양성 8~9동이라 AUC 가 크게 흔들리고, ML 모델은 과적합 위험이 있다.",
            "라벨은 항공영상 AI 판독이며 사람이 검수하지 않았다. 판독 오류가 그대로 섞여 있다.",
            "설치 여부는 설치 적합도의 대리 지표일 뿐이다. 이미 설치한 건물을 잘 맞힌다고 해서 적합도를 잘 잰다는 뜻은 아니다.",
            "ML 특징에는 규칙 점수의 구성요소 5개가 그대로 들어가 있어, ML 은 규칙이 쓰는 정보 위에 가중치만 다시 맞춘 것이다.",
            "이 비교는 보고용이다. 결과와 무관하게 점수 규칙과 가중치는 바꾸지 않는다.",
        ],
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"n={out['n']} 양성={out['positives']}")
    print("규칙", out["rule"])
    for m in MODELS:
        print(m, res_models[m]["auc_folds"], res_models[m]["auc_repeats"], {k: v for k, v in res_diff[m].items() if k != "by_repeat"})
        print("  중요도", res_imp[m])
        print("  순위", res_rank[m])


if __name__ == "__main__":
    main()
