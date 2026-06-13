# Pergamum

AI-assisted essay writing workspace: Blueprint → Outline → Draft → References, powered by DeepSeek V4 Flash.

## Stack

- **Next.js 15** (App Router) — app shell, API routes, Vercel deployment
- **Supabase** — auth, Postgres, Storage, RLS
- **Stripe** — subscriptions (Plus / Pro / Max)
- **Vercel AI Gateway** — DeepSeek V4 Flash (`deepseek/deepseek-v4-flash`) for all LLM features
- **Exa AI** — web source search and enrichment
- **OpenAlex** — academic journal search and enrichment
- **LlamaParse** — document parsing (PDF, DOCX, PPTX)

## Setup

See **[SETUP.md](SETUP.md)** for full production configuration.

Quick start:

1. Copy `.env.example` to `.env.local` and fill in credentials.
2. Run SQL migrations in `supabase/migrations/` (or use Supabase MCP).
3. Configure Supabase Auth redirect URLs.
4. `npm install && npm run dev`

## Routes

| Route | Description |
|-------|-------------|
| `/login`, `/signup` | Auth (email, Google, or Guest) |
| `/guest` | Guest dashboard (Basic, local storage) |
| `/projects` | Project dashboard |
| `/project/[id]/blueprint` | Instructions & framework |
| `/project/[id]/outline` | Outline & source search |
| `/project/[id]/draft` | Draft editing & audit tools |
| `/project/[id]/references` | Bibliography |
| `/project/[id]/export` | Essay export (DOCX, MD, TXT, PDF) |
| `/settings` | Account & defaults |
| `/billing` | Stripe checkout & portal |

## Backend

All AI routes use DeepSeek V4 Flash via Vercel AI Gateway. Subscription tiers gate **monthly usage limits**, not model access. See `lib/ai/usage.ts` for caps.
