"""
FinSight AI — Machine Learning Expense Forecasting Service (FastAPI)
Phase 5: Machine Learning Expense Forecasting
"""

import sys
import os
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sklearn
import pandas
import numpy

# Ensure ml_service package path is imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml_service.forecast_engine import run_forecasting_pipeline


app = FastAPI(
    title="FinSight AI — ML Forecasting Service",
    description="Production-grade Machine Learning Time Series Expense Forecasting API using scikit-learn",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ForecastRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    forecastHorizon: Optional[int] = Field(default=4, ge=1, le=12)
    targetEnd: Optional[Any] = None
    currentMonth: Optional[Any] = None


@app.get("/health")
def health_check():
    sys.stderr.write("[FORECAST] FastAPI /health check queried\n")
    sys.stderr.flush()
    return {
        "status": "ok",
        "service": "FinSight AI ML Forecasting Service",
        "framework": "FastAPI + scikit-learn",
        "scikit_learn_version": sklearn.__version__,
        "pandas_version": pandas.__version__,
        "numpy_version": numpy.__version__,
        "supported_models": [
            "Naive Baseline",
            "Moving Average (3-Month)",
            "Linear Regression (Ridge)",
            "Random Forest Regression"
        ],
        "deep_learning_justification": "LSTM recurrent neural networks are deliberately omitted. On small personal financial time series (N < 50 data points), LSTMs catastrophically overfit, suffer high variance across initialization seeds, and behave as uninterpretable black boxes. Regularized tabular regression with lag and rolling features delivers strictly superior empirical generalization."
    }


@app.post("/forecast")
def create_forecast(req: ForecastRequest):
    try:
        sys.stderr.write(f"[FORECAST] FastAPI /forecast received request with {len(req.transactions)} transactions\n")
        sys.stderr.flush()
        target_end = None
        if req.targetEnd and isinstance(req.targetEnd, (list, tuple)) and len(req.targetEnd) == 2:
            target_end = (int(req.targetEnd[0]), int(req.targetEnd[1]))

        current_ym = None
        if req.currentMonth:
            if isinstance(req.currentMonth, (list, tuple)) and len(req.currentMonth) == 2:
                current_ym = (int(req.currentMonth[0]), int(req.currentMonth[1]))
            elif isinstance(req.currentMonth, str) and '-' in req.currentMonth:
                parts = req.currentMonth.split('-')
                current_ym = (int(parts[0]), int(parts[1]))

        result = run_forecasting_pipeline(
            req.transactions,
            forecast_horizon=req.forecastHorizon,
            target_end_year_month=target_end,
            current_year_month=current_ym
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    uvicorn.run("ml_service.main:app", host="0.0.0.0", port=port, reload=False)

