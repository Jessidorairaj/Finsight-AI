"""
FinSight AI — Generate Figure 7.6: Forecasting Feature-Importance Visualization
Extracts real, reproducible feature importance scores from the trained model
and produces a publication-quality horizontal bar chart.
"""

import os
import sys
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance

# Ensure forecast_engine is importable from current directory
sys.path.insert(0, os.path.dirname(__file__))
from forecast_engine import build_time_series_features, aggregate_monthly_expenses

# Set publication-ready aesthetics
plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica']

def generate_figure(json_path: str = 'ml_service/user_transactions.json', output_path: str = 'Figure_7.6_Feature_Importance.png'):
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"Transactions JSON not found at: {json_path}")

    with open(json_path, 'r', encoding='utf-8') as f:
        transactions = json.load(f)

    print(f"Loaded {len(transactions)} transactions from {json_path}")

    # Current calendar month: 2026-11 (November 2026)
    current_ym = (2026, 11)
    df_monthly, mtd = aggregate_monthly_expenses(transactions, as_of_year_month=current_ym)
    print(f"Total completed months: {len(df_monthly)}")

    # Build features on completed months
    df_feat = build_time_series_features(df_monthly)

    feature_cols = ['trend_t', 'lag_1', 'lag_2', 'rolling_mean_3', 'month_sin', 'month_cos']
    feature_display_names = {
        'rolling_mean_3': '3-Month Rolling Average (rolling_mean_3)',
        'lag_1': 'Prior Month Expense (lag_1)',
        'trend_t': 'Chronological Trend Index (trend_t)',
        'lag_2': 'Two-Month Lag Expense (lag_2)',
        'month_sin': 'Annual Cyclical Sine (month_sin)',
        'month_cos': 'Annual Cyclical Cosine (month_cos)',
    }

    # Training mask for completed historical months (indices >= 2 where lag-2 is available)
    train_mask = df_feat.index >= 2
    X = df_feat.iloc[train_mask][feature_cols].fillna(0.0).values
    y = df_feat.iloc[train_mask]['amount'].values

    # Train Random Forest Regressor (exact production hyperparameters)
    rf = RandomForestRegressor(n_estimators=100, max_depth=3, random_state=42)
    rf.fit(X, y)

    importances = rf.feature_importances_
    results = []
    for col, imp in zip(feature_cols, importances):
        results.append({
            'feature': col,
            'name': feature_display_names[col],
            'importance': float(imp)
        })

    # Sort descending by importance score
    results.sort(key=lambda x: x['importance'], reverse=True)

    print("\nActual Feature Importances from Trained Model:")
    for r in results:
        print(f"  {r['name']}: {r['importance']:.4f} ({r['importance']*100:.2f}%)")

    # Plot publication-quality horizontal bar chart
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=300)

    names = [r['name'] for r in reversed(results)]
    scores = [r['importance'] for r in reversed(results)]
    y_pos = np.arange(len(names))

    # FinSight AI modern aesthetic: Teal palette matching the dashboard
    bars = ax.barh(y_pos, scores, color='#00E5BE', edgecolor='#00B894', height=0.52, alpha=0.92, zorder=3)

    # Customize axes
    ax.set_yticks(y_pos)
    ax.set_yticklabels(names, fontsize=10.5, fontweight='500', color='#0f172a')
    ax.set_xlabel('Importance Score (Mean Decrease in Impurity / Normalized Gini Index)', fontsize=11, fontweight='600', color='#0f172a', labelpad=10)
    ax.set_title('Figure 7.6: Feature Importance of the Expense Forecasting Model', fontsize=13.5, fontweight='bold', color='#0f172a', pad=16)

    # Set x limits and clean styling
    max_score = max(scores)
    ax.set_xlim(0, max(0.65, max_score * 1.25))
    ax.grid(axis='x', linestyle='--', alpha=0.45, zorder=0)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#cbd5e1')
    ax.spines['bottom'].set_color('#cbd5e1')

    # Data value callouts on bars
    for bar in bars:
        width = bar.get_width()
        pct_text = f"{width * 100:.1f}% ({width:.4f})"
        ax.text(width + 0.012, bar.get_y() + bar.get_height()/2, pct_text,
                va='center', ha='left', fontsize=9.5, fontweight='bold', color='#0f766e')

    # Annotation note
    note_text = (
        "Model: Random Forest Regressor (100 estimators, max_depth=3, random_state=42)\n"
        "Data: FinSight AI Personal Expense Ledger (Completed Months Aug 2025 – Oct 2026)\n"
        "Metric: Normalized reduction in variance / Gini impurity across all decision splits (sums to 1.0)"
    )
    plt.figtext(0.12, 0.02, note_text, fontsize=8, color='#64748b', style='italic')

    plt.tight_layout(rect=[0, 0.08, 1, 0.96])

    # Save to disk
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"\nSaved high-resolution Figure 7.6 to {output_path}")

    # Also save as Figure_7.6.png
    alt_output_path = 'Figure_7.6.png'
    import shutil
    shutil.copy(output_path, alt_output_path)
    print(f"Also copied to {alt_output_path}")

    # Also copy to artifacts directory if available
    artifact_dir = r"C:\Users\Jessi\.gemini\antigravity\brain\e9ddd2f6-13e7-4f0b-a036-1df2a8058f52"
    if os.path.exists(artifact_dir):
        artifact_png = os.path.join(artifact_dir, 'Figure_7.6_Feature_Importance.png')
        shutil.copy(output_path, artifact_png)
        print(f"Saved artifact copy to {artifact_png}")

    return output_path, results

if __name__ == '__main__':
    generate_figure()
