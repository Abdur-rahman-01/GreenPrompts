"""
classifier.py — Two-stage prompt classifier
Stage 1: Local rule-based engine (handles ~80% of prompts, zero API cost)
Stage 2: Gemini Flash fallback (only for AMBIGUOUS prompts)
"""

import re
import os
import json
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def _clean(s: str) -> str:
    """Removes unpaired surrogates from string to prevent UTF-8 encoding errors."""
    if not isinstance(s, str): return s
    return "".join(c for c in s if not (0xD800 <= ord(c) <= 0xDFFF))

# ─── VERB CATEGORY MAPPING ───────────────────────────────────────────────────
SIMPLE_VERBS = {
    "what", "who", "when", "where", "define", "list", "translate",
    "fix", "correct", "convert", "name", "tell", "show", "find",
    "give", "get", "check", "count", "is", "are", "was", "were",
    "hi", "hello", "hey", "thanks", "thank", "greet", "how", "can",
    "do", "you", "ready", "start", "begin",
}

MID_VERBS = {
    "summarize", "explain", "describe", "compare", "write", "draft",
    "create", "review", "analyze", "outline", "suggest", "recommend",
    "improve", "rewrite", "simplify", "elaborate", "discuss", "plan",
}

HEAVY_VERBS = {
    "prove", "derive", "design", "architect", "reason", "evaluate",
    "critique", "generate code", "solve", "debug", "optimize",
    "implement", "build", "develop", "research", "model", "simulate",
    "synthesize", "formulate",
}

MATH_PATTERNS = re.compile(
    r"[∫∑√∂π∞≈≠≤≥∈∉⊂⊃∪∩]|"
    r"\b(prove|derive|integral|equation|theorem|calculate|differentiate|"
    r"matrix|eigenvalue|fourier|laplace|convolution|gradient|divergence|"
    r"limit|series|polynomial|factorial|permutation|combination)\b",
    re.IGNORECASE,
)

CODE_PATTERNS = re.compile(
    r"```|"
    r"\b(def |function |class |import |SELECT |INSERT |UPDATE |DELETE |FROM |WHERE |"
    r"algorithm|regex|recursion|iterator|decorator|lambda|async|await|"
    r"html|css|javascript|python|sql|bash|shell|api|endpoint|schema)\b",
    re.IGNORECASE,
)

SUB_INSTRUCTIONS = re.compile(
    r"\b(and also|then|additionally|furthermore|finally|next|"
    r"after that|moreover|in addition|also)\b",
    re.IGNORECASE,
)

# Lines that strongly suggest code-only input
CODE_LINE_STARTERS = (
    "def ", "class ", "import ", "from ", "//", "/*", "#", "<", "{",
    "SELECT", "function", "const ", "let ", "var ", "return ", "if ",
    "for ", "while ", "}", "=>",
)


# ─── SPECIAL CASE DETECTORS ──────────────────────────────────────────────────
def is_empty_or_whitespace(prompt: str) -> bool:
    return not prompt or not prompt.strip()


def is_very_short(prompt: str) -> bool:
    """1-4 word prompts — greetings, acks, trivial. Always SLM."""
    return len(prompt.strip().split()) <= 4


def is_very_long(prompt: str) -> bool:
    """500+ tokens → always FULL regardless of verb."""
    return len(prompt.split()) > 375  # ~500 tokens at 0.75 words/token


def is_non_english_heavy(prompt: str) -> bool:
    """More than 30% non-ASCII characters → treat as non-English."""
    if not prompt:
        return False
    non_ascii = sum(1 for c in prompt if ord(c) > 127)
    return (non_ascii / len(prompt)) > 0.30


def is_code_heavy(prompt: str) -> bool:
    """If >70% of lines start with code patterns → code-only prompt."""
    lines = prompt.strip().split("\n")
    if len(lines) <= 3:
        return False
    code_lines = sum(
        1 for line in lines
        if line.strip().startswith(CODE_LINE_STARTERS)
    )
    return (code_lines / len(lines)) > 0.70


# ─── MID FALLBACK HELPER ─────────────────────────────────────────────────────
def _mid_fallback(reason: str, source: str = "rule_engine") -> dict:
    return {
        "tier":              "MID",
        "recommended_model": MODEL_MAP["MID"],
        "reason":            reason,
        "task_type":         "factual",
        "source":            source,
        "features": {
            "token_count": 0, "has_math": False, "has_code": False,
            "sub_instruction_count": 0, "question_count": 0,
            "task_verb_category": "unknown",
        },
    }


# ─── FEATURE EXTRACTION ──────────────────────────────────────────────────────
def extract_features(prompt: str) -> dict:
    words  = prompt.split()
    tokens = len(words)

    has_math  = bool(MATH_PATTERNS.search(prompt))
    has_code  = bool(CODE_PATTERNS.search(prompt)) or is_code_heavy(prompt)
    sub_count = len(SUB_INSTRUCTIONS.findall(prompt))
    q_count   = prompt.count("?")

    # Find task verb category
    first_word   = words[0].lower().rstrip(".,?!") if words else ""
    prompt_lower = prompt.lower()

    task_verb_category = "unknown"
    for hv in HEAVY_VERBS:
        if hv in prompt_lower:
            task_verb_category = "heavy"
            break

    if task_verb_category == "unknown":
        if first_word in SIMPLE_VERBS:
            task_verb_category = "simple"
        elif first_word in MID_VERBS:
            task_verb_category = "mid"
        else:
            for mv in MID_VERBS:
                if mv in prompt_lower:
                    task_verb_category = "mid"
                    break

    return {
        "token_count":           tokens,
        "has_math":              has_math,
        "has_code":              has_code,
        "sub_instruction_count": sub_count,
        "question_count":        q_count,
        "task_verb_category":    task_verb_category,
    }


# ─── RULE-BASED DECISION ─────────────────────────────────────────────────────
def rule_based_classify(features: dict) -> str:
    # ── Guard: forced SLM for very short prompts (less than 25 tokens) ─────
    if features["token_count"] <= 25 and not features["has_math"] and not features["has_code"]:
        return "SLM"

    score = 0

    tc = features["token_count"]
    if tc < 20:
        score += 0
    elif tc < 60:
        score += 1
    elif tc < 150:
        score += 2
    else:
        score += 3

    verb_scores = {"simple": 0, "mid": 2, "heavy": 4, "unknown": None}
    verb_score  = verb_scores.get(features["task_verb_category"])
    if verb_score is None:
        return "AMBIGUOUS"
    score += verb_score

    if features["has_math"]:
        score += 3
    if features["has_code"]:
        score += 2

    sub = features["sub_instruction_count"]
    if sub >= 3:
        score += 2
    elif sub >= 1:
        score += 1

    if score <= 2:
        return "SLM"
    elif score <= 5:
        return "MID"
    else:
        return "FULL"


# ─── REASON BUILDER ──────────────────────────────────────────────────────────
def generate_rule_reason(tier: str, features: dict) -> str:
    model_names = {
        "SLM":  "Llama 3.2 3B",
        "MID":  "Llama 3.1 8B",
        "FULL": "Llama 3.3 70B",
    }
    parts = []
    if features["token_count"] > 150:
        parts.append(f"long prompt ({features['token_count']} tokens)")
    if features["has_math"]:
        parts.append("mathematical content detected")
    if features["has_code"]:
        parts.append("code requirements detected")
    if features["sub_instruction_count"] >= 2:
        parts.append(f"{features['sub_instruction_count']} sub-instructions found")
    if features["task_verb_category"] == "heavy":
        parts.append("complex task verb detected")

    name = model_names.get(tier, tier)
    if not parts:
        return f"{name} recommended — simple, direct task with low computational need."
    return f"{name} recommended — your prompt contains {', '.join(parts)}."


# ─── INFER TASK TYPE ─────────────────────────────────────────────────────────
def infer_task_type(features: dict) -> str:
    if features["has_math"] or features["task_verb_category"] == "heavy":
        return "reasoning"
    if features["has_code"]:
        return "reasoning"
    if features["task_verb_category"] == "mid":
        return "creative"
    return "factual"


# ─── GEMINI FLASH FALLBACK ───────────────────────────────────────────────────
async def gemini_flash_classify(prompt: str) -> dict:
    default = {
        "tier":              "MID",
        "recommended_model": "Llama 3.1 8B",
        "reason":            "Classified as moderate complexity (fallback).",
        "confidence":        0.5,
        "task_type":         "factual",
    }

    if not GEMINI_API_KEY:
        return default

    system_prompt = (
        "You are an AI energy efficiency classifier. Classify the user's prompt into the most "
        "energy-appropriate model tier. Analyze: semantic complexity, task type "
        "(factual/creative/reasoning), mathematical or code requirements, number of "
        "sub-instructions, and expected output length.\n\n"
        "Return ONLY valid JSON with no markdown, no explanation, no preamble:\n"
        '{"tier": "SLM" | "MID" | "FULL", '
        '"recommended_model": "Llama 3.1 8B" | "Mixtral 8x7B" | "Qwen 3 32B", '
        '"reason": "<one sentence, max 20 words, explaining why this tier>", '
        '"confidence": <float 0.0 to 1.0>, '
        '"task_type": "factual" | "creative" | "reasoning"}'
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1/models/"
        f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
    )
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": f"{system_prompt}\n\nUser prompt:\n{prompt}"}]}
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(url, json=payload)

            # Rate limit handling
            if resp.status_code == 429:
                print("[classifier] Gemini Flash rate limited — using MID fallback")
                return {**default, "reason": "API rate limit reached — routed to mid-tier."}

            resp.raise_for_status()
            raw_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

            # Strip markdown code fences (retry parse once if needed)
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text.strip())
            raw_text = re.sub(r"\s*```$", "", raw_text.strip())

            try:
                return json.loads(raw_text)
            except json.JSONDecodeError:
                # Try extracting JSON substring
                m = re.search(r"\{.*\}", raw_text, re.DOTALL)
                if m:
                    return json.loads(m.group())
                raise

    except asyncio.TimeoutError:
        print("[classifier] Gemini Flash timeout — using MID fallback")
        return {**default, "reason": "Classification timeout — routed to mid-tier as safe default."}
    except json.JSONDecodeError as e:
        print(f"[classifier] Gemini JSON parse error: {e} — using MID fallback")
        return default
    except Exception as e:
        if "429" in str(e) or "quota" in str(e).lower():
            return {**default, "reason": "API rate limit reached — routed to mid-tier."}
        print(f"[classifier] Gemini Flash error: {e}")
        return default


# ─── PUBLIC ENTRY POINT ──────────────────────────────────────────────────────
MODEL_MAP = {
    "SLM":  "Llama 3.2 3B",
    "MID":  "Llama 3.1 8B",
    "FULL": "Llama 3.3 70B",
}

SUGGESTED_BACKUPS = {
    "SLM":  ["Qwen 2.5 3B", "Gemma 2 2B", "Llama 3.2 1B"],
    "MID":  ["Mistral Nemo", "Qwen 2.5 7B", "Gemma 2 9B"],
    "FULL": ["GPT-4o-mini", "Claude 3 Haiku", "Gemini 1.5 Flash"],
}


async def classify(prompt: str, messages: list = []) -> dict:
    """
    Two-stage classification:
    1. Local rule-based engine (Fast, zero cost)
    2. Gemini Flash fallback (Only for ambiguous prompts)
    """
    prompt = _clean(prompt)
    full_text = prompt
    if messages:
        # Concatenate history for classification context
        history_text = "\n".join([f"{m['role']}: {_clean(m['content'])}" for m in messages if 'content' in m])
        full_text = f"{history_text}\nuser: {prompt}"

    # ── Guard: empty prompt ────────────────────────────────────────────────
    if not prompt.strip():
        return {
            "tier":              "SLM",
            "recommended_model": MODEL_MAP["SLM"],
            "suggested_models":  SUGGESTED_BACKUPS["SLM"],
            "reason":            "Empty prompt — defaulting to lightest model.",
            "task_type":         "factual",
            "source":            "rule_engine",
            "features": {
                "token_count": 0, "has_math": False, "has_code": False,
                "sub_instruction_count": 0, "question_count": 0,
                "task_verb_category": "simple",
            },
        }

    # ── Guard: very short (greetings, 1-4 words) ──────────────────────────
    if is_very_short(prompt):
        return {
            "tier":              "SLM",
            "recommended_model": MODEL_MAP["SLM"],
            "suggested_models":  SUGGESTED_BACKUPS["SLM"],
            "reason":            "Llama 3.1 8B recommended — short, trivial prompt with minimal compute need.",
            "task_type":         "factual",
            "source":            "rule_engine",
            "features": {
                "token_count": len(prompt.split()), "has_math": False, "has_code": False,
                "sub_instruction_count": 0, "question_count": prompt.count("?"),
                "task_verb_category": "simple",
            },
        }

    # ── Guard: very long (500+ tokens) ────────────────────────────────────
    if is_very_long(prompt):
        tc = len(prompt.split())
        return {
            "tier":              "FULL",
            "recommended_model": MODEL_MAP["FULL"],
            "suggested_models":  SUGGESTED_BACKUPS["FULL"],
            "reason":            f"Qwen 3 32B recommended — prompt length ({tc} tokens) requires deep context window.",
            "task_type":         "reasoning",
            "source":            "rule_engine",
            "features": {
                "token_count": tc,
                "has_math":    bool(MATH_PATTERNS.search(prompt)),
                "has_code":    bool(CODE_PATTERNS.search(prompt)) or is_code_heavy(prompt),
                "sub_instruction_count": len(SUB_INSTRUCTIONS.findall(prompt)),
                "question_count": prompt.count("?"),
                "task_verb_category": "heavy",
            },
        }

    # ── Guard: non-English heavy ───────────────────────────────────────────
    if is_non_english_heavy(prompt):
        tc = len(prompt.split())
        return {
            "tier":              "MID",
            "recommended_model": MODEL_MAP["MID"],
            "suggested_models":  SUGGESTED_BACKUPS["MID"],
            "reason":            "Mixtral 8x7B recommended — non-English prompt detected, routing to mid-tier for broad language support.",
            "task_type":         "factual",
            "source":            "rule_engine",
            "features": {
                "token_count": tc, "has_math": False, "has_code": False,
                "sub_instruction_count": 0, "question_count": prompt.count("?"),
                "task_verb_category": "unknown",
            },
        }

    # ── Guard: code-heavy (code dump with no natural language) ────────────
    if is_code_heavy(prompt):
        tc = len(prompt.split())
        return {
            "tier":              "FULL",
            "recommended_model": MODEL_MAP["FULL"],
            "suggested_models":  SUGGESTED_BACKUPS["FULL"],
            "reason":            "Qwen 3 32B recommended — prompt is primarily code, requiring deep analysis.",
            "task_type":         "reasoning",
            "source":            "rule_engine",
            "features": {
                "token_count": tc, "has_math": False, "has_code": True,
                "sub_instruction_count": len(SUB_INSTRUCTIONS.findall(prompt)),
                "question_count": prompt.count("?"),
                "task_verb_category": "heavy",
            },
        }

    # ── Normal classification flow ─────────────────────────────────────────
    features  = extract_features(full_text)
    tier      = rule_based_classify(features)
    source    = "rule_engine"
    reason    = generate_rule_reason(tier, features)
    task_type = infer_task_type(features)

    if tier == "AMBIGUOUS":
        try:
            result = await asyncio.wait_for(
                gemini_flash_classify(prompt), timeout=4.0
            )
        except asyncio.TimeoutError:
            result = {
                "tier":      "MID",
                "reason":    "Classification timeout — routed to mid-tier as safe default.",
                "task_type": "factual",
            }
        tier      = result.get("tier", "MID")
        reason    = result.get("reason", "Classified via Gemini Flash.")
        task_type = result.get("task_type", "factual")
        source    = "gemini_flash"

    return {
        "tier":              tier,
        "recommended_model": MODEL_MAP[tier],
        "suggested_models":  SUGGESTED_BACKUPS.get(tier, []),
        "reason":            reason,
        "task_type":         task_type,
        "source":            source,
        "features":          features,
    }
