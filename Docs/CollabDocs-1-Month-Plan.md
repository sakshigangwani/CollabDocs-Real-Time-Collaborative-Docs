# CollabDocs — 1-Month Build & Hosting Plan

A pragmatic, solo-buildable adaptation of the **DocFlow** FAANG engineering spec, rebranded to **CollabDocs**.

> **Honest framing.** The source spec is a 32-week project for an 11-person team at FAANG production scale (100K concurrent editors, microservices, Kafka, OpenSearch, ClickHouse, multi-region, SOC 2). This plan keeps **every user-facing feature area** but swaps that infrastructure for a lean stack one person can ship and host in 4 weeks. Think *"all the features at portfolio/MVP depth"* — not *"100K-editor production hardening."* Where we deliberately cut or simplify, it's listed in the [Feature Coverage Matrix](#feature-coverage-matrix).

**Decisions locked:** Solo developer · Managed PaaS hosting (Vercel + Railway) · Breadth across all 12 feature areas.

---

## 1. Strategy: How we compress 32 weeks into 4

| Spec calls for | We use instead | Why |
|---|---|---|
| 9 microservices (Go/Node/Python) | **1 Node monolith** (Fastify + tRPC), modular | One deployable, type-safe end-to-end, no cross-service plumbing |
| Custom Go collab WebSocket server | **Hocuspocus** (Yjs server, batteries-included) | Auth/persistence hooks built in; saves ~2 weeks vs writing a CRDT server |
| ProseMirror from scratch | **Tiptap** (ProseMirror + extensions) | Same ProseMirror core the spec wants, 5× faster to build blocks/marks |
| Kafka + ClickHouse + FoundationDB | **Postgres + Redis** | Postgres = source of truth + full-text search; Redis = presence/pubsub/rate-limit |
| OpenSearch | **Postgres FTS** (`tsvector` + `pg_trgm`) | Typo-tolerant cross-doc search without a search cluster |
| S3 + CloudFront | **Cloudflare R2** | S3-compatible, zero egress fees, cheap snapshots/uploads |
| EKS / multi-region / Argo CD | **Vercel + Railway** | Push-to-deploy, custom domain, Postgres + Redis add-ons, free/cheap tiers |
| SAML/SCIM/SOC2/HIPAA | **Google OAuth + RBAC + audit log** | Real auth & permissions; enterprise SSO is a documented stretch goal |

**Editor stays the heart of the product** — that's where the spec says "most engineering effort lives," and it's what makes this portfolio-grade.

---

## 2. Tech Stack (final)

**Monorepo:** pnpm workspaces + Turborepo
```
apps/
  web/        React 18 + Vite + TS          (Vercel)
  server/     Fastify + tRPC + Hocuspocus   (Railway)
packages/
  editor/     Tiptap + Yjs schema & extensions (shared client/RN later)
  shared/     tRPC types, zod schemas, permissions logic
  db/         Prisma schema + migrations
```

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router v6 |
| State / data | Zustand (UI) + TanStack Query / tRPC client |
| Editor | Tiptap (ProseMirror) + Yjs + y-prosemirror + Tiptap collaboration-cursor |
| Styling | Tailwind CSS + CSS variables (light/dark/high-contrast) + Radix UI primitives |
| Icons / motion / forms | Lucide React · Framer Motion · React Hook Form + Zod |
| Realtime | Hocuspocus server (Yjs), Redis pubsub for multi-instance fanout |
| Backend | Node + Fastify, tRPC over HTTP, REST `/api/v1` for external |
| ORM / DB | Prisma + PostgreSQL |
| Cache/presence | Redis (Railway add-on / Upstash) |
| Blob storage | Cloudflare R2 (snapshots, uploads, exports) |
| Auth | Lucia + Google OAuth + email/password (Argon2id) + JWT access tokens |
| AI | Anthropic Claude API (`claude-sonnet-4-6` for inline, `claude-opus-4-8` for Q&A) with prompt caching |
| Email | Resend (mentions, invites, digests) |
| Billing (optional) | Stripe test mode |
| Testing | Vitest + Testing Library + Playwright |
| Observability | Sentry (errors) + Pino logs + simple `/metrics` |
| CI/CD | GitHub Actions → Vercel + Railway auto-deploy |

---

## 3. Week-by-Week Plan

> Assumes ~focused full-time effort. Each week ends with something **deployed and demoable**. Deploy on Day 1, not Week 4 — every feature ships to the live URL as it lands.

### Week 1 — Foundations + Editor Core
*Spec phases P0 + P1 (Editing & Formatting)*

**Goal:** Logged-in users can create docs and write rich text. Live on a custom domain by end of week.

- **Day 1–2 — Skeleton & deploy pipeline**
  - Init monorepo (pnpm + Turborepo), apps/web, apps/server, packages.
  - Tailwind + design tokens (color ramps, typography, spacing, radius from spec §10). Light/dark/high-contrast via CSS vars.
  - Prisma schema v1 (`users`, `workspaces`, `workspace_members`, `documents`, `document_acl`). Connect Railway Postgres.
  - **Deploy nothing-but-a-shell to Vercel + Railway, wire custom domain + TLS.** ✅ live URL exists.
- **Day 3 — Auth**
  - Lucia: email/password (Argon2id) + Google OAuth. JWT access + rotating refresh cookie.
  - Screens: Landing, Sign up / Login, Onboarding (create workspace).
- **Day 4–5 — Document list + editor shell**
  - `/home` feed, `/drive` file/folder list, create/rename/delete (soft delete + `/trash`).
  - Tiptap editor mounted at `/d/:docId`: top bar, toolbar, left outline sidebar, right drawer, status bar.
- **Day 6–7 — Rich text & blocks**
  - Marks: bold, italic, underline, strike, code, highlight, color, super/subscript.
  - Blocks: headings H1–H6, lists (bullet/numbered/checklist), code block, blockquote, callout, divider, tables, images (R2 upload).
  - Slash `/` command menu, markdown shortcuts, floating selection toolbar, full keyboard shortcuts.

**DoD:** Sign in → create doc → write formatted rich text → reload and it persists. Deployed.

---

### Week 2 — Real-Time Collaboration + Comments
*Spec phases P2 + P3 (the core differentiator)*

**Goal:** Two browsers edit the same doc live, with cursors, presence, comments, and suggestions.

- **Day 8–9 — Yjs + Hocuspocus**
  - Bind Tiptap doc to Yjs (`y-prosemirror`). Stand up Hocuspocus on the server with auth hook (validate scoped JWT for `{docId, role}`).
  - Persistence hook: snapshot Yjs state to R2 + `document_versions` row; load latest snapshot on connect.
  - Redis pubsub extension so multiple server instances fan out updates.
- **Day 10 — Presence & awareness**
  - Multi-cursor with user-colored carets + name labels, live selection highlights.
  - Presence avatar stack (active/idle/away), follow-mode, typing indicator.
- **Day 11 — Offline + reconnect**
  - IndexedDB persistence (`y-indexeddb`); queue edits offline, replay on reconnect (CRDT convergence). Amber "connection lost" banner.
- **Day 12–13 — Comments**
  - Inline comments anchored to a text range (ProseMirror mark), threaded replies, resolve/reopen, reactions.
  - Comments side drawer with filters (open/resolved/mentioning me/by author). `@`-mentions.
- **Day 14 — Suggestion mode**
  - Tracked-changes mode: edits render as colored insertions/deletions an authorized user accepts/rejects.

**DoD:** Open same doc in two windows → see each other's cursors & edits in real time → comment with @mention → toggle suggestion mode and accept a change. Deployed.

---

### Week 3 — Versions + Sharing + Search + Notifications
*Spec phases P4 + P5 + parts of P6*

**Goal:** Documents are shareable with real permissions, searchable, versioned, and notify users.

- **Day 15–16 — Version history**
  - Auto-snapshot every ~30s of active editing + on session end; manual named versions.
  - `/d/:docId/history`: version list, side-by-side + inline diff colored by author, restore-as-current (one click, old version preserved).
  - Per-version export: PDF, DOCX, Markdown, HTML.
- **Day 17–18 — Sharing & permissions**
  - Per-doc roles (Owner/Editor/Commenter/Viewer), workspace roles (Admin/Member/Guest).
  - Share dialog: invite by email, shareable links with expiration + password, "anyone with link / only invited / workspace", domain-restricted sharing.
  - Centralized `packages/shared/permissions` (single source of truth, property-tested). Audit log of access/permission changes.
- **Day 19 — Search & discovery**
  - Postgres FTS (`tsvector` + `pg_trgm` for typo tolerance) across accessible docs.
  - `/search` with faceted filters (owner, last edited, has comments, type), in-doc find/replace with regex, recents & favorites.
- **Day 20–21 — Notifications**
  - In-app notification center (`/notifications`): mentions, replies, share invites, version restored.
  - Email via Resend (instant for mentions/invites; daily digest cron). Per-doc subscription settings.

**DoD:** Share a doc by link with expiry → recipient with Commenter role can comment but not edit → search finds it by fuzzy title → restore an old version → get notified of a mention. Deployed.

---

### Week 4 — AI + Admin + Polish + Launch
*Spec phases P6 + P7 (AI, admin, hardening, GA)*

**Goal:** AI assistance, workspace admin, accessibility/perf polish, and a public launchable demo.

- **Day 22–23 — AI assistance** (Claude API, prompt caching)
  - Inline AI: rewrite, summarize, translate, fix grammar, change tone (selection → menu).
  - Document Q&A with cited spans; auto TL;DR at top of long docs; smart auto-tagging.
- **Day 24 — Admin & workspace management**
  - `/settings/workspace`: name, logo, default permissions, allowed domains, member management (invite/role change/deactivate/transfer ownership).
  - `/admin` lite: audit log viewer, retention setting. Stripe test-mode billing page (plans/seats — optional).
  - Templates gallery (`/templates`: meeting notes, PRD, design doc, retro, OKRs) + import/export (.docx/.md/HTML/JSON).
- **Day 25–26 — Polish & hardening**
  - Accessibility pass: WCAG 2.1 AA, full keyboard nav, ARIA live regions for presence/saving, focus rings.
  - Performance: block virtualization for large docs, code-splitting per route, Web Workers for syntax highlight/markdown, image responsive variants. Hit the spec's frame/latency budgets where feasible.
  - Security: strict CSP + nonces, DOMPurify on paste (client + server re-validation), CSRF protection, rate limiting (Redis token bucket), Sentry, dependency scan.
  - Error/empty states: 404, 403, offline, no-docs, no-results, rate-limited.
- **Day 27 — Mobile / PWA**
  - Responsive layout, installable PWA (manifest + service worker pre-caching editor shell + recent docs), background sync.
- **Day 28 — Launch**
  - Seed a demo workspace with sample docs. Final E2E pass (Playwright on critical journeys).
  - README with architecture diagram + quickstart, short Loom walkthrough, OpenAPI/tRPC reference.
  - **Public demo on custom domain, verified working.** ✅

**DoD:** Anyone can visit the URL, sign in, and exercise every feature area. Documented and demoed.

---

## 4. Feature Coverage Matrix

How each spec feature area maps into the month. **Ship** = real & working · **MVP** = working but simplified · **Stub** = UI present, minimal logic · **Stretch** = post-month.

| Spec §  | Area | This month |
|---|---|---|
| 2.1 | Editing & formatting | **Ship** (Tiptap) — embeds (YouTube/Figma) MVP via oEmbed |
| 2.2 | Real-time collaboration | **Ship** (Yjs/Hocuspocus) — soft-locking shared embeds = MVP |
| 2.3 | Comments / suggestions / reviews | **Ship** |
| 2.4 | Version history + diff + export | **Ship** — DOCX/PDF export MVP |
| 2.5 | Sharing & permissions | **Ship** — audit log MVP |
| 2.6 | Search & discovery | **MVP** (Postgres FTS instead of OpenSearch) |
| 2.7 | Templates & imports | **MVP** — common templates + .md/.docx import |
| 2.8 | AI assistance | **Ship** (Claude API) |
| 2.9 | Notifications | **Ship** (in-app + email; digests MVP) |
| 2.10 | Mobile & offline | **MVP** (PWA + offline; native RN = stretch) |
| 2.11 | Admin & workspace mgmt | **MVP** — billing = Stub (Stripe test) |
| 2.12 | Compliance & security | **MVP** — CSP/encryption/rate-limit/audit; SOC2/HIPAA/SCIM = Stretch |
| — | SSO (SAML/OIDC), SCIM, multi-region, ClickHouse analytics | **Stretch / documented out-of-scope** |

Everything a user *clicks* exists. The cuts are operational-scale infra (multi-region, SOC2 audits, 100K-editor load), which can't be solo-built in a month and aren't visible in a demo.

---

## 5. Hosting Architecture (Managed PaaS)

```
                  ┌────────────────────────┐
   custom domain  │  Vercel (apps/web)     │   React SPA, PWA, edge CDN
   collabdocs.app │  static + edge          │
                  └───────────┬─────────────┘
                              │ HTTPS (tRPC/REST) + WSS (collab)
                  ┌───────────▼─────────────┐
                  │  Railway (apps/server)  │   Fastify + tRPC + Hocuspocus
                  │  + cron (digests/snap)  │
                  └──┬─────────┬─────────┬──┘
                     │         │         │
            ┌────────▼──┐ ┌────▼────┐ ┌──▼──────────────┐
            │ Postgres  │ │ Redis   │ │ Cloudflare R2   │
            │ (Railway) │ │(Upstash)│ │ snapshots/blobs │
            └───────────┘ └─────────┘ └─────────────────┘
   External: Resend (email) · Anthropic (AI) · Sentry · Stripe(test)
```

- **Vercel** auto-deploys `apps/web` on push; custom domain + automatic TLS.
- **Railway** runs `apps/server` (one service handles API + WebSocket collab) + cron for snapshots/digests; provides Postgres + Redis add-ons.
- **Cloudflare R2** for Yjs snapshots, image uploads, exports (zero egress).
- WebSockets work on Railway directly (no extra config) — important, since Vercel serverless doesn't hold WS connections.

**Estimated cost:** ~**$5–20/month** to start (Railway hobby + Postgres/Redis; Vercel + R2 free tiers; Resend free tier; Claude API pay-per-use). All have free tiers for a demo.

---

## 6. Simplified Data Model (Prisma)

Core tables carried over from spec §7, trimmed for a single Postgres:
`users · workspaces · workspace_members · documents · document_acl · document_versions · comments · notifications · audit_events · share_links`

Document **content** lives as Yjs snapshots in R2 (`snapshots/{docId}/{version}.ybin`), with the latest live state held by Hocuspocus and periodically materialized. Postgres stays the source of truth for all relational/metadata.

---

## 7. Risks & Mitigations (solo edition)

| Risk | Mitigation |
|---|---|
| Editor scope balloons (Week 1 overruns) | Tiptap ships most blocks for free; timebox embeds/tables to MVP, cut to Week 4 buffer if needed |
| Yjs/Hocuspocus auth + persistence fiddly | Use Hocuspocus official hooks; spike it Day 8 before building on top |
| WebSocket + serverless mismatch | Backend on Railway (persistent), **not** Vercel functions — decided up front |
| Diff/export rabbit hole | Use `prosemirror-changeset` for diff, `html-to-docx`/print-to-PDF for export at MVP depth |
| AI cost/latency | Prompt caching + Sonnet for inline; cap tokens; stream responses |
| Trying to do "all features deeply" | Breadth-first by design — see matrix; Week 4 buffer absorbs slips |

---

## 8. Definition of Done (end of month)

- ✅ Public URL on a custom domain, TLS, seeded demo workspace.
- ✅ Two users edit live with cursors, presence, offline reconnect.
- ✅ Comments, suggestions, version history + restore, sharing with roles, search, notifications, AI assist, admin — all reachable in the demo.
- ✅ Auth (Google + email), RBAC enforced via shared permissions package.
- ✅ CI green (lint + typecheck + tests), Sentry wired, README + walkthrough.

## 9. Documented Stretch (post-month)
SAML/OIDC SSO + SCIM · multi-region CRDT sharding · ClickHouse analytics · React Native co-editing (reuses `packages/editor`) · E2E encryption (per-doc keys) · SOC 2 readiness.

---

*Source: adapted from `Docs/DocFlow_FAANG_Project_Spec.pdf` (v1.0). Rebranded DocFlow → CollabDocs; scope re-scoped from 32-week/11-person to 4-week/solo, managed-PaaS, breadth-first.*
