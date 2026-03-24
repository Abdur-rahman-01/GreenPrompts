# GreenPrompt 🌿
> From invisible waste to measurable impact.

## What it does
GreenPrompt analyzes your AI prompts and routes them to the most energy-efficient model — saving CO₂, water, and money without sacrificing quality.

It uses a two-stage classifier:
1. **Local rule engine** — handles ~80% of prompts instantly, zero API cost
2. **Gemini Flash fallback** — called only for ambiguous prompts requiring deeper analysis

---

## Two components

| Component | What it does |
|-----------|-------------|
| **Browser Extension** (`extension/`) | Pre-flight energy popup on ChatGPT, Claude & Gemini — shows Green Score before you send |
| **Playground** (`playground/`) | Full chat interface with side-by-side SLM / MID / FULL energy comparison |

Both share the same backend (`backend/`).

---

## Quick Start

### 1 — Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # ← add your API keys here
uvicorn main:app --reload --port 8000
```
Verify: http://localhost:8000/health should return `{ "status": "ok" }`

### 2 — Playground
Open `playground/index.html` in any browser (no build step required).

Or serve locally:
```bash
python -m http.server 3000   # from project root
# then open http://localhost:3000/playground/index.html
```

### 3 — Browser Extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load Unpacked** → select the project root folder (where `manifest.json` lives)
4. Navigate to ChatGPT, Claude, or Gemini — the GreenPrompt popup will appear

---

## API Keys Required

| Key | Required | Get it |
|-----|----------|--------|
| `GROQ_API_KEY` | ✅ Yes | [console.groq.com](https://console.groq.com) — free |
| `GEMINI_API_KEY` | ✅ Yes (for Gemini Flash fallback) | [aistudio.google.com](https://aistudio.google.com) — free |
| `ELECTRICITY_MAPS_API_KEY` | Optional | [api.electricitymap.org](https://api.electricitymap.org) — falls back to global average |

---

## Demo Prompts

These three prompts cover the full GreenPrompt story for a presentation:

| Prompt | Expected Tier | Green Score |
|--------|--------------|-------------|
| `What is photosynthesis?` | **SLM** — Llama 3.1 8B | **A** — best case |
| `Write a Python function to sort a list of dicts by a nested key` | **MID** — Mixtral 8x7B | **B/C** — balanced |
| `Derive the Fourier transform of a Gaussian and prove self-duality` | **FULL** — Llama 3.1 70B | **F** — worst case, maximum contrast |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (< 50ms) |
| POST | `/analyze` | Classify prompt → returns tier + energy estimates for all 3 models |
| POST | `/route` | Send prompt to Groq model for chosen tier |
| POST | `/feedback` | Log 👍/👎 feedback |

---

## Performance Targets

| Endpoint | Target |
|----------|--------|
| `/health` | < 50ms |
| `/analyze` (rule engine) | < 300ms |
| `/analyze` (Gemini Flash) | < 3s |
| `/route` (Groq) | < 5s |

---

## Tech Stack
FastAPI · Python · Groq API · Gemini Flash · HTML / CSS / JS (no framework)

## Research Foundation
Elsworth et al. (2025) — *Measuring the environmental impact of delivering AI at Google Scale*

---

## Project Structure
```
greenprompt/
├── manifest.json         ← Chrome Extension manifest 
├── content.js            ← Extension content script
├── popup.html            ← Extension popup dashboard
├── background.js         ← Extension service worker
├── backend/
│   ├── main.py           ← FastAPI app (endpoints)
│   ├── classifier.py     ← Rule engine + Gemini Flash
│   ├── router.py         ← Groq model routing
│   ├── energy.py         ← Energy / CO₂ calculations
│   ├── requirements.txt
│   ├── .env              ← Your secrets (gitignored)
│   └── .env.example      ← Template (safe to commit)
└── playground/
    └── index.html        ← Full single-file playground UI
```
