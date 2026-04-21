import os
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from dotenv import load_dotenv

# Load .env FIRST so all os.getenv() calls below see the values
load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

def _clean_data(data):
    """Deeply cleans surrogates from dicts, lists, and strings."""
    if isinstance(data, str):
        return "".join(c for c in data if not (0xD800 <= ord(c) <= 0xDFFF))
    if isinstance(data, list):
        return [_clean_data(v) for v in data]
    if isinstance(data, dict):
        return {k: _clean_data(v) for k, v in data.items()}
    return data

from classifier import classify
from energy import get_all_tier_estimates
from router import route_prompt

# ─── APP ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="GreenPrompt API",
    description="Sustainable AI routing with energy-tier classification",
    version="1.0.0",
)

# ALLOWED_ORIGINS defaults to "*" (open) — set it in Render env vars to restrict
# e.g. chrome-extension://abcdefghijklmnopqrstuvwxyz,https://yourdomain.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS: List[str] = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FEEDBACK_FILE = Path(__file__).parent / "feedback.jsonl"


# ─── SCHEMAS ─────────────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    prompt: str
    messages: Optional[list] = []
    region: Optional[str] = "IN"


class RouteRequest(BaseModel):
    prompt: str
    messages: Optional[list] = []
    tier:   str  # "SLM" | "MID" | "FULL"


class FeedbackRequest(BaseModel):
    tier:    str
    rating:  str            # "up" | "down"
    comment: Optional[str] = ""
    messages: Optional[list] = []


# ─── ENDPOINTS ───────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "service": "GreenPrompt API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {
        "status":  "ok",
        "version": "1.0.0",
        "service": "GreenPrompt API",
        "port":    int(os.getenv("PORT", 8000)),
        "keys": {
            "groq":             bool(os.getenv("GROQ_API_KEY")),
            "gemini":           bool(os.getenv("GEMINI_API_KEY")),
            "electricity_maps": bool(os.getenv("ELECTRICITY_MAPS_API_KEY")),
        }
    }


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    req = _clean_data(req.dict())
    prompt = (req.get("prompt") or "").strip()

    if not prompt:
        from classifier import MODEL_MAP
        return {
            "tier":              "SLM",
            "recommended_model": MODEL_MAP["SLM"],
            "reason":            "Empty prompt — defaulting to lightest model.",
            "task_type": "factual", "source": "rule_engine",
            "features": {"token_count": 0, "has_math": False, "has_code": False, "sub_instruction_count": 0},
            "suggested_models": ["Mistral (Small)", "Qwen 2.5 (Small)"],
            "estimates": get_all_tier_estimates(1, "factual"),
        }

    classification = await classify(prompt, req.get("messages"))
    estimates = get_all_tier_estimates(classification["features"]["token_count"], classification["task_type"])
    return {**classification, "estimates": estimates}


@app.post("/route")
async def route(req: RouteRequest):
    req = _clean_data(req.dict())
    prompt = req.get("prompt")
    tier = req.get("tier")
    messages = req.get("messages")
    
    valid_tiers = {"SLM", "MID", "FULL"}
    if tier not in valid_tiers: raise HTTPException(status_code=400, detail="Invalid tier")
    if not (prompt or "").strip(): raise HTTPException(status_code=400, detail="Empty prompt")

    result = await route_prompt(prompt, tier, messages)
    if "error" in result: raise HTTPException(status_code=503, detail=result)
    return result


@app.post("/feedback")
async def feedback(req: FeedbackRequest):
    req = _clean_data(req.dict())
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "tier":      req.get("tier"),
        "rating":    req.get("rating"),
        "comment":   (req.get("comment") or "").strip(),
    }
    try:
        with open(FEEDBACK_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception: pass
    return {"status": "ok"}
