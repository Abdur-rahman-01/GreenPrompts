# GreenPrompt: Environmental Impact Methodology

This document outlines the formulas, constants, and methodologies used by **GreenPrompt** to accurately calculate energy, water, and CO2 savings through prompt optimization.

## 1. The Core Formulas

The extension calculates environmental impact based on the **Token Count** of the prompt.

### A. Energy Consumption ($E$)
Energy is measured in Watt-hours (Wh).
$$E = \left( \frac{\text{Tokens}}{1000} \right) \times \text{Tier}_{\text{Wh/1k}} \times \text{PUE}$$

*   **Tier Constant**: Different models have different energy signatures.
    *   **Large** (GPT-4o, Gemini Ultra): $0.40$ Wh per 1k tokens.
    *   **Medium** (Gemini Pro, Claude Sonnet): $0.24$ Wh per 1k tokens (Industry Median).
    *   **Small** (GPT-3.5, Gemini Flash): $0.08$ Wh per 1k tokens.
*   **PUE (Power Usage Effectiveness)**: Measures data center efficiency. A PUE of $1.10$ means for every $1$ watt used by the server, $0.10$ watts are used for cooling/lighting.

### B. Carbon Footprint ($C$)
Carbon emissions are measured in grams of CO2 equivalent (gCO2e).
$$C = \left( \frac{E}{1000} \right) \times \text{Intensity}_{\text{g/kWh}}$$

*   **Carbon Intensity**: The amount of carbon emitted per unit of electricity produced, based on the provider's energy mix (renewables vs. fossil fuels).

### C. Water Consumption ($W$)
Water usage is measured in milliliters (ml).
$$W = \left( \frac{E}{1000} \right) \times \text{WUE} \times 1000$$

*   **WUE (Water Usage Effectiveness)**: Liters of water consumed for cooling per kWh of energy used.

---

## 2. Environmental Constants (2025 Data)

GreenPrompt uses the most recent peer-reviewed data to ensure accuracy.

| Provider | PUE | Carbon Intensity (g/kWh) | WUE (L/kWh) |
| :--- | :--- | :--- | :--- |
| **Google (Gemini)** | 1.09 | 125 | 1.083 |
| **Microsoft (Copilot)** | 1.20 | 233 | 1.40 |
| **OpenAI (ChatGPT)** | 1.40 | 400 | 1.80 |
| **Anthropic (Claude)** | 1.20 | 300 | 1.50 |

> [!NOTE]
> **Sources**: Google AI Inference Methodology (Aug 2025), Microsoft 2024 Environmental Report, and CodeCarbon Industry Baselines.

---

## 3. Optimization Method: Semantic Compression

GreenPrompt doesn't just "cut words"; it performs **Semantic Compression** using a multi-step NLP pipeline:

1.  **Meta-Talk Removal**: Strips "I was wondering if you could," "Please," and "Thank you," which LLMs do not need for task execution.
2.  **Intensifier Stripping**: Removes adverbs like "extremely" or "really" that add token weight without increasing clarity.
3.  **Verb Distillation**: Converts noun-heavy phrases (e.g., "provide a summary") into direct imperatives ("Summarize").
4.  **RTF Structuring**: Reformats the prompt into a **Role-Task-Format** structure, which improves model accuracy while using fewer tokens.
5.  **Deduplication**: Uses trigram analysis to remove redundant sentences.

---

## 4. Judges' Presentation Strategy

### The "Hook"
"Every AI prompt has a hidden cost. A single 500-token prompt uses as much water as 5ml of a bottle and emits grams of CO2. With billions of prompts sent daily, this is the 'Invisible Carbon' of the AI era."

### The "Differentiator"
"Unlike other tools that track energy *after* it's spent, **GreenPrompt** stops the wastage at the source. We optimize the prompt *locally* in the browser before it ever hits the server, reducing the workload for the AI model itself."

### Key Talking Points
- **Evidence-Based**: "Our math isn't guesswork; it's based on Google's Aug 2025 Inference Methodology and MS Sustainability Reports."
- **Accuracy**: "We detect which model you are using (Large vs. Nano) and which cloud provider (Google vs. Azure) to calculate real-world impact specific to your session."
- **User UX**: "We don't sacrifice quality. Our RTF (Role-Task-Format) restructuring actually makes the AI *smarter* by providing clearer instructions in fewer tokens."

### Closing Statement
"We are moving from 'AI at any cost' to 'Sustainable AI.' GreenPrompt makes every token count."
