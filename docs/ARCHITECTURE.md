# SNYP University — Architecture and Build Plan

Status: built and tested locally, 26 Nov 2026. Nothing here is "working" until the test log (`docs/TEST_LOG.md`) says it was tested.

## 1. Reuse, rebuild, missing

### Reusable
| Item | From | How it is reused |
|---|---|---|
| Ticket data model (id, no, title, detail, assignee, kind, priority, section, source, status, night, parent, createdAt) | ABB.json | Kept field-for-field, so ABB.json imports without conversion |
| Activity log, meetings, reviews, chats, state (lastCheckedFile, lastCheckedRevision, nextNo) | ABB.json | Same keys; becomes the export format |
| Staff ids `rina`, `stat`, `metod`, `lib` | ABB.json | Kept as character ids |
| Draft-check revision check (MD5 of the draft) | ABB.json `lastCheckedRevision` | Same hash method, so the app recognises the current draft as already checked |
| Server storage pattern: Vercel function + `@upstash/redis`, env names `KV_REST_API_*` or `UPSTASH_REDIS_REST_*` | STOCK-OPMNAME-TBS `state.js` | Same client and env names. File placed correctly in `api/` |
| Backend detection with clear "where is my data saved" label | STOCK-OPMNAME-TBS `index.html` | Same idea, but the app refuses to silently fall back to browser storage once deployed |
| Deploy guide structure | STOCK-OPMNAME-TBS `README.md` | Adapted |

### Must be rebuilt
| Item | Why |
|---|---|
| The whole SNYP front end: 3-floor isometric office, characters, panels | Original source not found anywhere |
| Storage API | Reference saves the whole state as one blob (last write wins) and has no login. Rebuilt as per-record operations with a password |
| Draft check rules | Only their output survives (placeholder, incomplete-reference findings). Rules re-implemented from those findings |

### Missing (needs you, or unknown)
| Item | Default until you decide |
|---|---|
| What Night Shift did | Tickets flagged `night` queue for an after-hours shift: office goes dark, night staff work them, results still wait for your approval |
| Names of `stat`, `metod`, `lib`, Nadia's id, the Director | Statistician, Methodologist, Librarian, Nadia (secretary), Director |
| AI "brain" (Anthropic API key) | App works without it using rule-based routing and templates. With `ANTHROPIC_API_KEY` set in Vercel, Rina's analysis, staff drafts and meeting contributions use Claude |
| Original visual style | New isometric style, same floor layout |

## 2. Architecture

```
Browser (any device)                       Vercel                              Storage
┌──────────────────────────┐   HTTPS   ┌──────────────────────────┐     ┌────────────────────────┐
│ public/index.html        │ ───────▶  │ api/login.js  (password) │     │ Upstash Redis          │
│  office.js  (renderer,   │           │ api/state.js  (read/ops) │ ──▶ │  snyp:tickets  (hash)  │
│   pathfinding, behavior) │ ◀───────  │ api/backup.js (ABB.json) │     │  snyp:meetings (hash)  │
│  store.js   (sync, 8 s)  │           │ api/docs.js   (archive)  │     │  snyp:activity (list)  │
│  ui.js      (panels)     │           │ api/ai.js     (optional) │     │  snyp:meta / settings  │
└──────────────────────────┘           └────────────┬─────────────┘     └────────────────────────┘
                                                    │ reads files bundled with the functions
                                                    ▼
                                        thesis-archive/ in the same private repo (the 01–06 folders)
```

Rules:
- Character positions are never stored. They are computed in the browser from ticket and meeting states, so every device shows the same story and storage stays small.
- Every change is a named operation (`ticket.create`, `ticket.update`, `meeting.start`…) applied on the server, so two devices never overwrite each other's work.
- No staff member, the Director included, can approve or change thesis files. Approval is a button only you press, behind the login.
- Secrets live only in Vercel environment variables: `APP_PASSWORD`, `SESSION_SECRET`, `UPSTASH_REDIS_REST_URL/TOKEN`, optional `ANTHROPIC_API_KEY`.

### Three kinds of data, kept apart
| Kind | Lives in | Backed up by |
|---|---|---|
| Source code | private GitHub repo (the former STOCK-OPMNAME-TBS, made private) | Git history |
| App data (tickets, logs, meetings, settings) | Upstash Redis | Export ABB.json button + automatic daily snapshot key |
| Thesis documents | `thesis-archive/` in the same private repo + project files `SNYP_Thesis/` | Git history + `05_Backup` originals |

## 3. Folder structure

```
snyp-university/                  (app repo, private)
├── api/          login.js state.js backup.js docs.js draftcheck.js ai.js   (Vercel functions)
├── lib/          store.js (Redis or local file) ops.js (all changes) auth.js archive.js draftcheck.js http.js
├── public/       index.html css/app.css
│   └── js/       roster.js (staff, states, permissions) world.js (floors, stairs, A*) api.js (sync)
│                 sim.js (behaviour engine) render.js (isometric canvas) ui.js (panels)
├── test/         backend.test.js redis.test.js e2e.test.js fake-upstash.js helpers.js
├── docs/         ARCHITECTURE.md DEPLOY.md TEST_LOG.md
├── dev-server.js runs everything locally with no accounts
└── package.json  vercel.json .gitignore .env.example

└── thesis-archive/  the 01–06 thesis folders (outside public/, served only via /api/docs after login)
```

## 4. Technical limitations (known before building)
1. **Vercel request/response limit ~4.5 MB.** PDFs (max 1.5 MB) pass through. The 9.4 MB original zip is therefore kept out of the repo (it stays in project files).
2. **The office lives only while a page is open.** The Director patrols and staff walk while you watch. Nothing moves on the server; state changes are what persist.
3. **Upstash free tier is about 500k commands per month.** Syncing every 8 s, paused when the tab is hidden, uses roughly 4k per open hour. Fine for one person.
4. **Without an API key, staff cannot write thesis text themselves.** They route, track and remind; the content comes from you or from Claude in chat, pasted into the ticket.
5. **I cannot create GitHub repos or Vercel projects, or log in to your accounts.** You upload one zip to a private repo yourself; no GitHub connection to Claude is needed. Real cross-device and deployment tests can only happen after you do the manual steps in `DEPLOY.md`. Until then, tests run on a local server that uses the same code paths with a local store.
6. **The app cannot edit .docx files in place.** Fixes are delivered as ready-to-paste replacement text, as the original tickets already asked.
