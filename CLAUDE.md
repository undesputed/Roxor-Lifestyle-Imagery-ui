# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev    # http://localhost:3000
npm run build
npm run lint
```

No test suite is configured.

## Architecture

### API Routing

`next.config.ts` uses a **fallback rewrite** so all `/api/*` traffic proxies to the FastAPI backend (`BACKEND_URL`, default `http://localhost:8000`) — *except* routes that already have a local handler:

- `app/api/auth/[...nextauth]/route.ts` — NextAuth Cognito SSO (handled locally)
- `app/api/download/route.ts` — image proxy/download (handled locally)
- Everything else (`/api/products/*`, `/api/generate/*`, `/api/sync/*`, `/api/upload`, `/api/generate/style`) → FastAPI

### Auth

NextAuth v4 with AWS Cognito (`cognito` provider). Sessions use JWT strategy. `AuthProvider` (`components/auth-provider.tsx`) wraps the app in `SessionProvider`. `ConditionalLayout` (`components/conditional-layout.tsx`) shows the sidebar on all pages except `/login`.

Required env vars: `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`, `COGNITO_ISSUER`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

### Client State (localStorage)

`lib/store.ts` manages two localStorage namespaces:

| Key | Type | Used by |
|-----|------|---------|
| `roxor_generated_images` | `GeneratedImage[]` | Review page — approve/reject decisions |
| `roxor_job_sets` | `JobSet[]` | Generate queue + detail pages |
| `roxor_dismissed_jobs` | `string[]` | Generate page — hides deleted jobs across refreshes |

`loadJobSets()` keeps an in-memory cache (`jobSetsCache`) so `useSyncExternalStore` snapshots stay referentially stable between renders.

When the Generate queue fetches GENERATED jobs from the backend, it automatically calls `addImage()` to push result URLs into the Review queue — even if the user never opened the detail page while polling was active.

### Polling Strategy

- **Products page** — silent background poll every 15s when any product has `generationStatus === "GENERATING"`. Uses `refreshGenerationStatus` (not `fetchMissing`) so pagination and selection are never disrupted.
- **Generate list page** — polls `GET /api/generate/jobs` every 30s.
- **Generate detail page** (`/generate/[jobSetId]`) — polls every 10s; also calls `GET /api/generate/execution-status/{executionArn}` for slot-level Step Functions status.

### Key Types (`lib/types.ts`)

- `JobSet` — one pipeline run: `salesCode`, `executionArn`, three `SlotJob` entries (ls1/ls2/ls3), optional `CompanionJob[]`.
- `SlotStatus` — `idle | submitted | polling | success | failed`
- `deriveJobSetStatus()` in `lib/store.ts` collapses the three slot statuses to `complete | failed | in_progress | idle`.

### Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with pipeline overview |
| `/products` | Product table with two tabs: *Missing Lifestyle* (with checkboxes for batch generate) and *Dark Grey Candidates*. Sync from Akeneo button triggers Step Functions and polls `GET /api/sync/status/{jobId}`. |
| `/generate` | Generation queue. Dismiss is client-only (stored in `roxor_dismissed_jobs`); re-run POSTs a new `/api/generate/single`. |
| `/generate/[jobSetId]` | Per-job detail and polling view. |
| `/review` | Approve/reject images loaded from `roxor_generated_images` localStorage. |
| `/upload` | Manual upload form; also reachable via query params `?salesCode=&slot=&url=` from the Review page. |
| `/settings` | Style preset selector — reads/writes `GET|PUT /api/generate/style` on the FastAPI backend. |
| `/login` | Full-screen Cognito SSO page; sidebar is hidden here via `ConditionalLayout`. |
