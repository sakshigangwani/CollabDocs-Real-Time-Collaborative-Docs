# CollabDocs — Completion Plan (What's Left)

Gap analysis against `Docs/DocFlow_FAANG_Project_Spec.pdf`, with a phased roadmap to finish every feature area. Priorities (P0/P1/P2) and section numbers are taken from the spec. Effort: **S** = ~½–1 day, **M** = ~2–4 days, **L** = ~1 week+ (solo).

---

## 1. Status snapshot

### ✅ Done
- Monorepo (web + server), design tokens, light/dark toggle, animated landing page
- **Auth** — email+password (Argon2id), Google + GitHub OAuth, DB-session cookies
- **Workspaces** — auto-created on signup; `WorkspaceMember` roles in schema
- **Dashboard** — document list, create, search, collapsible sidebar
- **Trash** — soft-delete, restore, permanent-delete (spec §2.x trash)
- **Sharing & permissions** (Phase A) — central `permissions` module (ACL-driven, role hierarchy Owner>Editor>Commenter>Viewer), server-side enforcement on all doc routes, Share dialog (invite by email + per-person roles), share links (`ShareLink`: role/scope/expiry/password + claim flow), per-doc audit log, read-only editor for non-editors, working "Shared with me" view
- **Document content** — `content` jsonb, `GET /:id`, `PATCH` (title/content)
- **Editor (single-user)** — Tiptap: headings, bold/italic/underline/strike/code, **text color + highlight**, lists, quote, code block, markdown shortcuts, editable title, **debounced autosave**, word count

### ⚙️ Partially done
- **Search** — client-side title filter only; **no full-text / facets / find-replace**
- **Mobile** — responsive layout; **no PWA / offline**
- **Security** — Argon2 + sessions; **no rate limiting, CSP, audit log, etc.**

### ❌ Not started
Real-time collaboration · Comments/suggestions · Version history · Notifications · Admin console · Templates/imports · AI assistance · Embeds/tables/images/slash-menu · Compliance hardening · Hosting/deploy

---

## 2. What's left, by feature area

### 2.1 Editing & Formatting (P0) — *enrich the editor* — **M**
Have: marks, headings, lists, quote, code block, color/highlight, **slash `/` menu**, **task lists**, **tables**, **floating selection toolbar**.
Missing:
- [x] ~~Slash `/` command menu~~ — done (`components/editor/SlashCommand.ts`)
- [x] ~~Tables~~ — done (`@tiptap/extension-table` TableKit)
- [x] ~~Task list (checklist)~~ — done
- [x] ~~Floating selection toolbar~~ — done (BubbleMenu)
- [ ] **Images** — drag/drop + upload (needs file storage → R2), resize, alt text
- [ ] **Embeds** — YouTube/Figma/Loom via oEmbed + server proxy
- [ ] **More blocks** — callout (have divider/hr)
- [ ] **Inline** — links UI, mentions (`@user`), math (LaTeX), emoji
- [ ] **Page-level** — cover image + icon picker, subtitle

### 2.2 Real-Time Collaboration (P0) — *the headline feature* — **L**
- [ ] Swap content model to **Yjs CRDT** (bind Tiptap via `y-prosemirror`)
- [ ] **Hocuspocus** WebSocket server (new `apps/server` module or service) with JWT auth + Postgres/R2 persistence
- [ ] **Snapshot-on-idle** worker → materialize Yjs state to storage
- [ ] **Presence/awareness** — multi-cursor with colored carets + name labels, live selection
- [ ] Presence **avatar stack** (active/idle/away), **follow mode**, **typing indicator**
- [ ] **Offline editing** — IndexedDB (`y-indexeddb`), queue + replay on reconnect, "connection lost" banner
- [ ] Soft-locking shared embeds
- *Note:* this **replaces** the current debounced JSON autosave with live CRDT sync.

### 2.3 Comments, Suggestions & Reviews (P0) — **M/L**
- [ ] Schema: `Comment` (anchor JSONB range, thread, author, body, resolvedAt), reactions
- [ ] Inline comments anchored to text range (ProseMirror mark) + threaded replies + resolve/reopen
- [ ] Comments side drawer + filters (open/resolved/mentioning me/by author)
- [ ] **Suggestion mode** — tracked changes (insert/delete) accept/reject
- [ ] `@`-mentions wiring (→ notifications)

### 2.4 Version History (P0) — **M**
- [ ] Schema: `DocumentVersion` (snapshot key, label, author, createdAt) — *partly modeled already*
- [ ] Auto-snapshot every ~30s of active editing + named versions
- [ ] `/d/:id/history` — version list, side-by-side + inline diff (colored by author)
- [ ] Restore-as-current (old version preserved)
- [ ] Per-version export: PDF / DOCX / Markdown / HTML

### 2.5 Sharing & Permissions (P0) — **M** — ✅ done (Phase A)
- [x] **Share dialog** (modal) — invite by email, role per person
- [x] **Shareable links** — `ShareLink` table, expiry + password, "anyone with link / workspace members"; claim flow grants ACL
- [ ] Domain-restricted sharing *(deferred — needs verified workspace domains)*
- [x] **Enforce roles** server-side (Owner > Editor > Commenter > Viewer) in a central `permissions` module
- [x] Per-document **audit log** of access/permission changes

### 2.6 Search & Discovery (P0) — **M**
- [ ] **Full-text search** — Postgres `tsvector` + `pg_trgm` (typo tolerance) across accessible docs
- [ ] `/search` page — faceted filters (owner, last edited, has comments, type), snippets
- [ ] In-document **find/replace** with regex
- [ ] Recents + favorites; workspace home personalized feed

### 2.7 Templates & Imports (P1) — **M**
- [ ] Template gallery (`/templates`) — meeting notes, PRD, design doc, retro, OKRs
- [ ] Import — `.docx`, `.md`, HTML, Notion export
- [ ] Export — `.docx`, `.pdf`, `.md`, HTML, JSON

### 2.8 AI Assistance (P1) — **M**
- [ ] AI service (Claude API, `ai-service` or a server module) with prompt caching
- [ ] Inline AI — rewrite, summarize, translate, fix grammar, change tone (on selection)
- [ ] Document Q&A with cited spans; auto TL;DR; smart auto-tagging

### 2.9 Notifications (P0) — **M**
- [ ] Schema: `Notification` (already modeled in spec)
- [ ] In-app notification center (`/notifications`) — mentions, replies, share invites, version restored
- [ ] Email via **Resend** — instant (mentions/invites) + daily/weekly digests (cron)
- [ ] Per-document subscription settings

### 2.10 Mobile & Offline (P1) — **S/M**
- [ ] PWA — manifest + service worker (pre-cache editor shell + recent docs)
- [ ] Offline read/write + background sync (ties into §2.2 IndexedDB)
- [ ] Mobile editor polish

### 2.11 Admin & Workspace Management (P0) — **M**
- [ ] `/settings/workspace` — name, logo, default permissions, allowed domains
- [ ] Member management — invite, role change, deactivate, transfer ownership
- [ ] `/admin` — audit log viewer, retention settings
- [ ] Billing (Stripe **test mode**) — plans, seats, invoices *(can stay minimal)*

### 2.12 Compliance & Security (P0) — **M, ongoing**
- [ ] **Rate limiting** (Redis token bucket) on auth/AI/API
- [ ] Strict **CSP** + nonces, Trusted Types; DOMPurify on paste (client + server)
- [ ] CSRF protection on mutations
- [ ] **Audit events** table + writes
- [ ] Encryption at rest review, dependency/SAST scan in CI
- *(SOC2/HIPAA/SAML/SCIM = out of scope for a solo build; document as enterprise stretch.)*

### Cross-cutting infra still needed
- [ ] **Redis** (presence, rate-limit, pubsub) — Upstash/Railway
- [ ] **Object storage** — Cloudflare R2 (images, exports, snapshots)
- [ ] **Email** — Resend
- [ ] **Hosting/deploy** — Vercel (web) + Railway (server + Postgres + Redis), custom domain, env/secrets, CI
- [ ] Lazy-load editor route (bundle is ~750KB), Sentry, basic tests (Vitest/Playwright)

---

## 3. Phased roadmap to finish

Ordered by priority + dependencies. Each phase ends deployed & demoable.

| Phase | Scope | Spec | Effort |
|---|---|---|---|
| ~~**A. Permissions + Sharing**~~ ✅ | Central `permissions` module, enforce roles, Share dialog, share links, audit log | §2.5, 2.12 | M |
| **B. Real-time collaboration** | Yjs + Hocuspocus, presence/cursors, offline, snapshots (replaces autosave) | §2.2 | L |
| **C. Comments & Suggestions** | Inline comments, threads, resolve, suggestion mode | §2.3 | M/L |
| **D. Version history** | Snapshots, diff view, restore, exports | §2.4 | M |
| **E. Notifications** | In-app center + email (Resend) + digests; wires mentions/invites | §2.9 | M |
| **F. Editor enrichment** | Slash menu, images (R2), tables, embeds, task list, page cover/icon, find/replace | §2.1, 2.6 | M |
| **G. Full-text search** | Postgres FTS, `/search` with facets, recents/favorites | §2.6 | M |
| **H. Admin & workspace** | Settings, members, transfer ownership, audit viewer, billing (test) | §2.11 | M |
| **I. AI assistance** | Claude API: inline actions, Q&A, TL;DR, auto-tag | §2.8 | M |
| **J. Templates & imports** | Template gallery, import/export (docx/md/html/json) | §2.7 | M |
| **K. Mobile/PWA & hardening** | PWA + offline, rate limiting, CSP, CSRF, Sentry, tests | §2.10, 2.12 | M |
| **L. Hosting & launch** | R2 + Redis + Resend wired, deploy to Vercel+Railway, custom domain, seed demo | §16 | S/M |

**Phase A (Permissions + Sharing) is done.** Next phase: **B (Real-time collaboration)** — Yjs + Hocuspocus, presence/cursors, offline, snapshots; the centerpiece feature. (C comments and E notifications build on top of it.)

---

## 4. Deliverables to "done" (spec §16)
- [ ] Public demo on a custom domain with seeded data
- [ ] README + architecture diagram + quickstart (partly done)
- [ ] Short walkthrough video(s)
- [ ] CI green (lint + typecheck + tests)
- [ ] A few ADRs (CRDT vs OT, sessions vs JWT, etc.)

---

*Reality check: the full spec is a 32-week / 11-person scope. This plan completes every **user-facing feature area** at portfolio depth. Operational-scale items (multi-region, SOC2/HIPAA, SAML/SCIM, ClickHouse analytics, 100K-editor load) remain documented as enterprise stretch goals, not built.*
