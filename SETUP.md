# Pergamum Setup Guide

This guide walks through configuring Vercel, Supabase, and all external APIs for a production deployment.

## 1. Supabase

1. In [Supabase Dashboard](https://supabase.com/dashboard) → **Project Settings → API**:
   - Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` (e.g. `https://your-project-ref.supabase.co`)
   - Copy **publishable key** (or legacy anon key) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server only — never expose to the browser)

2. Run migrations (if not already applied):
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_documents_usage_storage.sql`

3. **Auth → URL configuration:**
   - Site URL: `https://your-app.vercel.app` (or `http://localhost:3000` for local)
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://your-app.vercel.app/auth/callback`

4. **Storage:** Migration `002` creates a private `documents` bucket with RLS. Verify under **Storage** in the dashboard.

## 2. Vercel AI Gateway (DeepSeek V4 Flash)

All LLM features use **DeepSeek V4 Flash** via the Vercel AI Gateway.

1. In [Vercel Dashboard](https://vercel.com) → your project → **AI** → **AI Gateway**
2. Create an API key → `AI_GATEWAY_API_KEY`
3. Model used: `deepseek/deepseek-v4-flash` (configured in `lib/ai/provider.ts`)

No separate OpenAI, Anthropic, or Google keys are required.

## 3. Exa AI (source search + enrichment)

1. Sign up at [exa.ai](https://exa.ai)
2. Create an API key → `EXA_API_KEY`
3. Used for:
   - `/api/ai/sources` — web source discovery (`POST /search`)
   - `/api/sources/enrich` — URL content metadata (`POST /contents`)

## 4. OpenAlex (academic journals)

No API key required. Set a contact email for the polite pool:

```
OPENALEX_MAILTO=your-email@example.com
```

Used for academic paper search and metadata enrichment.

## 5. LlamaParse / LlamaCloud (document parsing)

1. Sign up at [cloud.llamaindex.ai](https://cloud.llamaindex.ai)
2. Create an API key (`llx-...`) → `LLAMA_CLOUD_API_KEY`
3. Used for PDF, DOCX, PPTX parsing when the key is set. Falls back to local `pdf-parse` / `mammoth` if unavailable.

## 6. Local development

```bash
cp .env.example .env.local
# Fill in all keys above
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 7. Vercel deployment

1. Connect your Git repo to Vercel
2. **Settings → Environment Variables** — add every variable from `.env.example` for Production, Preview, and Development
3. Recommended: store secrets as Vercel **Shared Environment Variables** and reference in `vercel.json`
4. Deploy. Region is set to `sin1` in `vercel.json`

### Required env vars checklist

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client-side Supabase auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Usage tracking, document storage writes |
| `AI_GATEWAY_API_KEY` | Yes | All LLM calls (DeepSeek V4 Flash) |
| `EXA_API_KEY` | Recommended | Real source search |
| `LLAMA_CLOUD_API_KEY` | Recommended | High-quality document parsing |
| `OPENALEX_MAILTO` | Optional | Academic API polite pool |
| `NEXT_PUBLIC_APP_URL` | Yes | OAuth redirects, Stripe |
| Stripe keys | For billing | Subscriptions |

## 8. Usage limits (subscription tiers)

Tier caps are enforced server-side (`lib/ai/usage.ts`):

| Tier | Monthly AI requests |
|------|---------------------|
| Basic / Guest | 30 |
| Plus | 300 |
| Pro | 1,500 |
| Max | Unlimited |

Check remaining usage: `GET /api/usage`

## 9. API routes overview

| Route | Purpose |
|-------|---------|
| `POST /api/ai/analyze` | Blueprint framework generation |
| `POST /api/ai/outline` | Outline generation |
| `POST /api/ai/framework/regenerate` | Regenerate title/thesis/RQ |
| `POST /api/ai/draft` | Draft section generation |
| `POST /api/ai/draft/tools` | Draft audit/editing tools |
| `POST /api/ai/sources` | Source search (Exa + OpenAlex) |
| `POST /api/ai/extract` | Document text extraction |
| `POST /api/documents/upload` | Upload + parse + Supabase Storage |
| `POST /api/sources/enrich` | Enrich source metadata |
| `POST /api/sources/evaluate` | Reliability scoring |
| `GET /api/usage` | Monthly usage summary |
| `PATCH /api/projects/[id]/state` | Persist essay state |

## 10. Troubleshooting

- **429 Quota Exceeded:** Upgrade plan or wait until next month. Usage resets on the 1st (UTC).
- **AI_GATEWAY_API_KEY errors:** Verify the key in Vercel AI Gateway and redeploy.
- **Empty source search:** Set `EXA_API_KEY`. Without it, stub results are returned.
- **Document parse fails:** Check `LLAMA_CLOUD_API_KEY` or rely on local fallback for PDF/DOCX.
- **Storage upload fails:** Ensure `002` migration ran and `SUPABASE_SERVICE_ROLE_KEY` is set.
