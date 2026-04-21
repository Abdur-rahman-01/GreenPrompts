"""
router.py — Groq API model routing
Routes classified prompts to the appropriate energy-tier model.
Includes: fallback chain, rate-limit retry, truncation detection, timeout, and Gemini Flash fallback.
"""

import os
import time
import asyncio
import httpx
from groq import Groq, RateLimitError, APIStatusError
from dotenv import load_dotenv

load_dotenv()

# Lazy-loaded Groq client to prevent crash on import if key is missing locally
_client = None

def get_groq_client():
    global _client
    if _client is None:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise ValueError("GROQ_API_KEY is missing. Add it to backend/.env")
        _client = Groq(api_key=key)
    return _client

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

GROQ_MODEL_IDS = {
    "SLM":  "llama-3.2-3b-preview",
    "MID":  "llama-3.1-8b-instant",        
    "FULL": "llama-3.3-70b-versatile",              
}

# Fallback chain if primary model fails on Groq
GROQ_FALLBACK = {
    "SLM":  "llama-3.1-8b-instant",      
    "MID":  "llama-3.3-70b-versatile",      
    "FULL": "llama-3.3-70b-versatile",      
}


def _build_response(response, model_id: str, start: float) -> dict:
    """Build return dict from a Groq response object."""
    elapsed_ms = int((time.time() - start) * 1000)
    content    = response.choices[0].message.content or ""
    finish     = response.choices[0].finish_reason

    if finish == "length":
        content += "\n\n[Response truncated — max tokens reached]"

    if not content.strip():
        return {
            "error":   "empty_response",
            "message": "Model returned empty response. Try rephrasing your prompt.",
        }

    return {
        "response":         content,
        "model_used":       model_id,
        "response_time_ms": elapsed_ms,
        "tokens_used":      response.usage.completion_tokens,
    }


async def _call_gemini(prompt: str, start: float) -> dict:
    """Ultimate fallback using Gemini v1 API (raw HTTP for max stability)."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY missing")

    url = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }

    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            elapsed_ms = int((time.time() - start) * 1000)
            
            return {
                "response":         text,
                "model_used":       "gemini-2.0-flash (survival-http)",
                "response_time_ms": elapsed_ms,
                "tokens_used":      0,
            }
    except Exception as e:
        print(f"⚠️ [GreenPrompt] Gemini Survival HTTP failed: {e}")
        # Try one last last last fallback to Pro if flash fails
        try:
            url_pro = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url_pro, json=payload)
                resp.raise_for_status()
                text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                return {
                    "response":         text,
                    "model_used":       "gemini-pro (emergency-http)",
                    "response_time_ms": int((time.time() - start) * 1000),
                    "tokens_used":      0,
                }
        except Exception as e2:
            print(f"🚨 [GreenPrompt] Emergency Gemini-Pro failed: {e2}")
            raise e2


async def route_prompt(prompt: str, tier: str, messages: list = []) -> dict:
    model_id = GROQ_MODEL_IDS.get(tier, GROQ_MODEL_IDS["MID"])
    start    = time.time()

    # Build messages array for Groq
    groq_messages = []
    if messages:
        for m in messages:
            if 'role' in m and 'content' in m:
                groq_messages.append({"role": m['role'], "content": m['content']})
    
    # Ensure current prompt is included if not in messages
    if not groq_messages or groq_messages[-1]['content'] != prompt:
        groq_messages.append({"role": "user", "content": prompt})

    def _call(model: str):
        return get_groq_client().chat.completions.create(
            model=model,
            messages=groq_messages,
            max_tokens=1024,
            temperature=0.7,
        )

    # ── Attempt 1: primary model ──────────────────────────────────────────
    try:
        response = await asyncio.to_thread(_call, model_id)
        result = _build_response(response, model_id, start)
        print(f"🌿 [GreenPrompt] Routed to {tier} ({model_id}) in {int((time.time()-start)*1000)}ms")
        return result

    except Exception as e:
        print(f"⚠️ [GreenPrompt] Primary model ({model_id}) failed: {e}")
        
        # ── Attempt 2: retry if rate limit ────────────────────────────────
        is_rate_limit = isinstance(e, RateLimitError) or "429" in str(e)
        if is_rate_limit:
            print(f"🔄 [GreenPrompt] Rate limit on {model_id} — retrying in 2s...")
            await asyncio.sleep(2)
            try:
                response = await asyncio.to_thread(_call, model_id)
                return _build_response(response, model_id, start)
            except Exception as e2:
                print(f"⚠️ [GreenPrompt] Retry failed for {model_id}: {e2}")

        # ── Attempt 3: Groq backup model ──────────────────────────────────
        fallback_id = GROQ_FALLBACK.get(tier)
        if fallback_id == "gemini-flash" and GEMINI_API_KEY:
            print("🚀 [GreenPrompt] Escalating directly to Gemini Flash fallback")
            try:
                return await _call_gemini(prompt, start)
            except Exception as ge:
                print(f"⚠️ [GreenPrompt] Gemini fallback failed: {ge}")
        elif fallback_id and fallback_id != model_id:
            print(f"🔄 [GreenPrompt] Falling back to secondary model: {fallback_id}")
            try:
                response = await asyncio.to_thread(_call, fallback_id)
                return _build_response(response, fallback_id, start)
            except Exception as fe:
                print(f"⚠️ [GreenPrompt] Fallback model failed: {fe}")

    # ── Attempt 4: Gemini Flash Ultimate Fallback ─────────────────────────
    if GEMINI_API_KEY:
        print("🛡️ [GreenPrompt] Rescuing request with Gemini Flash survival layer")
        try:
            return await _call_gemini(prompt, start)
        except Exception as ge:
            print(f"🚨 [GreenPrompt] All fallbacks failed: {ge}")

    return {
        "error":   "model_unavailable",
        "message": "All models (including Gemini fallback) are currently unavailable. Try again later.",
    }
