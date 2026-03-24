"""
energy.py — Energy Index calculation + environmental estimates
All outputs are clamped to non-negative values. Edge cases handled.
"""

# ─── MODEL PARAMETERS ────────────────────────────────────────────────────────
MODEL_PARAMS = {
    "SLM":  8,    # 8B params
    "MID":  12,   # 12B effective params (Mixtral active)
    "FULL": 40,   # Scaled up inference cost for heavy reasoning/Gemma
}

COMPLEXITY_MULTIPLIER = {
    "factual":   1.0,
    "creative":  1.4,
    "reasoning": 1.8,
}

DEFAULT_CO2_INTENSITY = 400.0  # global average gCO₂/kWh — used if Electricity Maps unavailable

# Groq free-tier pricing approximations (per 1M tokens)
COST_RATES = {
    "SLM":  0.00005,
    "MID":  0.00024,
    "FULL": 0.00059,
}

MINIMUM_ENERGY_INDEX = 50  # never return 0 — breaks green score logic


# ─── ENERGY INDEX ────────────────────────────────────────────────────────────
def calculate_energy_index(token_count: int, tier: str, task_type: str) -> int:
    # Clamp token count to minimum 1
    tc     = max(1, token_count or 1)
    params = MODEL_PARAMS.get(tier, 8)
    # Default multiplier to mid-range (1.2) for unknown task types
    multiplier = COMPLEXITY_MULTIPLIER.get(task_type, 1.2)
    
    # Introduce a base context overhead so short vs long prompts have differing savings percentages
    base_overhead = params * 15  
    dynamic_cost  = tc * params * multiplier
    
    return max(MINIMUM_ENERGY_INDEX, int(base_overhead + dynamic_cost))


# ─── GREEN SCORE ─────────────────────────────────────────────────────────────
def energy_to_green_score(energy_index: int) -> str:
    ei = max(0, energy_index)
    if ei < 400:
        return "A"
    elif ei < 700:
        return "B"
    elif ei < 1100:
        return "C"
    elif ei < 1600:
        return "D"
    else:
        return "F"


# ─── CO₂ ESTIMATE ────────────────────────────────────────────────────────────
def estimate_co2(
    energy_index: int,
    co2_intensity: float = DEFAULT_CO2_INTENSITY
) -> float:
    """Convert energy index to approximate grams of CO₂."""
    ei  = max(0, energy_index)
    kwh = ei / 3_600_000
    return round(max(0.0, kwh * co2_intensity), 6)


# ─── WATER ESTIMATE ──────────────────────────────────────────────────────────
def estimate_water(energy_index: int) -> float:
    """~1.8 L/kWh data center PUE coefficient. Returns millilitres."""
    ei  = max(0, energy_index)
    kwh = ei / 3_600_000
    return round(max(0.0, kwh * 1.8 * 1000), 4)


# ─── COST ESTIMATE ───────────────────────────────────────────────────────────
def estimate_cost(tier: str, token_count: int) -> float:
    rate = COST_RATES.get(tier, 0.0)
    return round(max(0.0, (token_count or 0) * rate / 1000), 8)


# ─── ENERGY SAVINGS % ────────────────────────────────────────────────────────
def calculate_savings_pct(slm_ei: int, full_ei: int) -> int:
    """How much energy SLM saves vs FULL tier (percentage)."""
    if full_ei <= 0:
        return 0
    saving = max(0, full_ei - slm_ei)
    return min(99, int((saving / full_ei) * 100))


# ─── ALL TIERS AT ONCE ───────────────────────────────────────────────────────
def get_all_tier_estimates(token_count: int, task_type: str) -> dict:
    result = {}
    for tier in ["SLM", "MID", "FULL"]:
        ei = calculate_energy_index(token_count, tier, task_type)
        result[tier] = {
            "energy_index": ei,
            "green_score":  energy_to_green_score(ei),
            "co2_g":        estimate_co2(ei),
            "water_ml":     estimate_water(ei),
            "cost_usd":     estimate_cost(tier, token_count),
        }

    # Append savings callout
    result["savings_pct"] = calculate_savings_pct(
        result["SLM"]["energy_index"],
        result["FULL"]["energy_index"],
    )
    return result
