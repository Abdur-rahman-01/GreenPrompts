import os
import time
from groq import Groq
from dotenv import load_dotenv

load_dotenv('backend/.env')
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Updated IDs mapping to current router.py
MODELS = {
    "SLM":  "llama-3.1-8b-instant",
    "MID":  "qwen/qwen3-32b",        
    "FULL": "llama-3.3-70b-versatile",
}

def test_model(tier, model_id):
    print(f"Testing {tier} ({model_id})...", end=" ", flush=True)
    try:
        start = time.time()
        resp = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=5
        )
        elapsed = int((time.time() - start) * 1000)
        print(f"✅ OK ({elapsed}ms)")
        return True
    except Exception as e:
        print(f"❌ FAILED: {e}")
        return False

if __name__ == "__main__":
    results = {}
    for tier, model_id in MODELS.items():
        results[tier] = test_model(tier, model_id)
    
    print("\n--- Summary ---")
    all_ok = all(results.values())
    if all_ok:
        print("🚀 ALL SYSTEMS GO. Your 3-tier router is fully operational.")
    else:
        print("🚨 CRITICAL FAILURES DETECTED. Check API status.")
