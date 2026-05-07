# Keyword Strategy Agent

Internal SEO keyword strategy tool for the content team.

---

## What It Does

1. Team uploads **1–5 keyword CSVs**, each with a custom label (e.g. "Topic Keywords", "Competitor A", "Ahrefs Export")
2. Selects page type + enters primary keyword
3. Agent pre-filters every file (removes vol < 30, deduplicates across all files, merges)
4. Sends merged filtered list to Claude API (labelled by source section)
5. Returns: primary keyword validation, supporting keywords, longtail keywords, competitor insights, page strategy notes

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd keyword-strategy-agent
npm install
```

### 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
TOOL_PASSWORD=        # Team access password
ADMIN_PASSWORD=       # Admin panel password
ANTHROPIC_API_KEY=    # Your Anthropic API key (sk-ant-...)
```

> If `ANTHROPIC_API_KEY` is set, Claude is used. If only `OPENAI_API_KEY` is set, GPT-4o is used as fallback.

### 3. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## Multi-Section File Upload

The tool supports **up to 5 keyword file sections** per analysis:

- Each section has a **custom label** (editable inline — e.g. "Topic", "Competitor A", "Ahrefs")
- Start with 3 default sections; add more with the **+ Add Section** button
- Sections without a file are ignored — only upload what you have
- All files are merged, deduplicated, and filtered together before being sent to AI
- The AI sees which section each keyword came from, enabling competitor-specific insights

**Pre-filter logic (per combined list):**
1. Remove keywords with volume < 30
2. Deduplicate across all sections (keep highest volume)
3. Cap at 300 keywords sent to AI (sorted by volume desc)

---

## Deploy to Vercel

### Option A: Via GitHub (recommended)

1. Push repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import
3. Add environment variables in Vercel Dashboard → Settings → Environment Variables
4. Deploy

### Option B: Via CLI

```bash
npm i -g vercel
vercel
```

---

## Enable Prompt Persistence (Vercel KV)

Without KV, admin prompt edits work but don't survive redeployments.

1. Vercel Dashboard → Storage → Create Database → KV
2. Connect to your project (env vars added automatically)
3. Redeploy

---

## Prompt Management

- Visit `/admin` on your deployed URL
- Edit the system prompt in the browser
- Use `{{PAGE_TYPE}}` and `{{PRIMARY_KEYWORD}}` as placeholders (required)
- Changes apply immediately to all new generations

---

## CSV Format

Expects SEMrush, Ahrefs, or similar exports. Required columns:
- `Keyword` (or `Keywords`, `Query`, `Search Term`)
- `Volume` (or `Search Volume`, `Avg. Monthly Searches`)

Optional:
- `KD` / `Keyword Difficulty`
- `CPC` / `CPC (USD)`
