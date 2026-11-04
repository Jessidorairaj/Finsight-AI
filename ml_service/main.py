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


class TransactionItem(BaseModel):
    id: Optional[str] = None
    date: str
    amount: float
    type: str
    category: Optional[str] = None
    status: Optional[str] = "Completed"
    name: Optional[str] = None


class ForecastRequest(BaseModel):
    transactions: List[TransactionItem]
    forecastHorizon: Optional[int] = Field(default=4, ge=1, le=12)


@app.get("/health")
def health_check():
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
        tx_dicts = [tx.model_dump() for tx in req.transactions]
        result = run_forecasting_pipeline(tx_dicts, forecast_horizon=req.forecastHorizon)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    uvicorn.run("ml_service.main:app", host="0.0.0.0", port=port, reload=False)

