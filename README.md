# Keyword Strategy Agent

Internal SEO keyword strategy tool for the content team.

---

## What It Does

1. Team uploads a SEMrush keyword CSV
2. Selects page type + enters primary keyword
3. Agent pre-filters the list (removes vol < 30, deduplicates)
4. Sends filtered list to Claude API
5. Returns: primary keyword validation, supporting keywords, longtail keywords, page strategy notes

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo>
cd keyword-strategy-agent
npm install
```

### 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in values:

```
TOOL_PASSWORD=       # Team access password
ADMIN_PASSWORD=      # Admin panel password (prompt management)
OPENAI_API_KEY=   # Your Anthropic API key (sk-ant-...)
```

### 3. Run locally

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## Deploy to Vercel

### Option A: Via GitHub (recommended)

1. Push repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add environment variables in Vercel Dashboard → Settings → Environment Variables:
   - `TOOL_PASSWORD`
   - `ADMIN_PASSWORD`
   - `ANTHROPIC_API_KEY`
4. Deploy

### Option B: Via CLI

```bash
npm i -g vercel
vercel
```

---

## Enable Prompt Persistence (Vercel KV)

Without KV, the admin prompt editor works but changes don't persist across deployments.

To enable persistent prompts:

1. Vercel Dashboard → Storage → Create Database → KV
2. Connect it to your project
3. Vercel automatically adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to your env
4. Redeploy

Once set up, prompts saved in the admin panel persist permanently without redeployment.

---

## Model

Currently uses `gpt-4o`. To change, edit `lib/prompt.ts`:

```ts
export const MODEL = 'gpt-4o' // or 'gpt-4o-mini' for lower cost
```

---

## Prompt Management

- Visit `/admin` on your deployed URL
- Enter admin password
- Edit the system prompt directly in the browser
- Changes apply immediately to all new generations
- Use `{{PAGE_TYPE}}` and `{{PRIMARY_KEYWORD}}` as placeholders (required)

---

## CSV Format

Expects SEMrush keyword export CSV. Required columns (flexible naming):
- `Keyword`
- `Volume` (or `Search Volume`, `Avg. Monthly Searches`)

Optional but used:
- `KD` (or `Keyword Difficulty`)
- `CPC` (or `CPC (USD)`)

---

## Pre-filter Logic

Before sending to AI, the tool automatically:
1. Removes keywords with volume < 30
2. Deduplicates near-identical keywords (keeps highest volume)
3. Caps at 300 keywords sent to AI (sorted by volume desc)

This keeps API costs low and responses fast.

---

## Extending for V2

When ready to add more capability:
- Multi-page discovery (Entry B1): add clustering agent
- Priority scoring across page opportunities
- GSC integration for cannibalization check
- n8n orchestration for multi-step human review gates
