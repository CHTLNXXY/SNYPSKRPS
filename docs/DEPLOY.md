# Deploying SNYP University

This replaces the unused STOCK-OPMNAME-TBS app with SNYP University, reusing that repo, its Vercel project
and its Upstash database. No GitHub connection to Claude and no GitHub token are needed.
You do every step in your own accounts. About 15 minutes.

## 1. Make the repo private (do this first)
GitHub → `STOCK-OPMNAME-TBS` → **Settings** → bottom (Danger Zone) → **Change visibility → Private**.
The repo is public today. SNYP puts your thesis files in `thesis-archive/`, so it must be private before you upload.

## 2. Replace the old files
1. Unzip `snyp-university-upload.zip`. You get a folder `snyp-university`.
2. In the repo, delete the old files: open each of `index.html`, `state.js`, `README.md`, `package.json`
   → … (top right) → **Delete file** → Commit. (Or keep them, see note below.)
3. Repo page → **Add file → Upload files** → select **everything inside** the `snyp-university` folder
   (including `.gitignore` and `.env.example`; on Mac press Cmd+Shift+. to see them) → drag it in → **Commit changes**.
4. Check the top level of the repo shows `api`, `lib`, `public`, `thesis-archive`, `test`, `docs`,
   `package.json`, `vercel.json`. They must not be inside an extra `snyp-university` folder.

If you keep the old files: `package.json` and `README.md` are replaced by the upload anyway. An old root
`index.html` or `state.js` does no harm (the site serves only `public/`), but deleting them avoids confusion.

**Why `thesis-archive` is safe here:** the repo is private and the website only publishes `public/`.
Thesis files are reachable only through the app after you log in.

## 3. Vercel and Upstash (existing project)
Upstash is already connected to this Vercel project, so there is nothing new to create.
The old stock data stays under its own key (`tcn-stock-state-v1`); SNYP only uses keys starting with `snyp:`.
If the project settings override the Output Directory, clear it: `vercel.json` sets it to `public`.

## 4. Environment variables
Vercel project → Settings → **Environment Variables** → add:

| Name | Value |
|---|---|
| `APP_PASSWORD` | the office password you will type to log in |
| `SESSION_SECRET` | any random text, 40+ characters |
| `ANTHROPIC_API_KEY` | optional, from console.anthropic.com. Claude, paid per use |
| `GEMINI_API_KEY` | optional, **free**, from aistudio.google.com → Get API key. The Librarian uses it with Google Search to check references |
| `GROQ_API_KEY` | optional, **free**, from console.groq.com → API Keys. Fast open models for chat and meetings |
| `OPENROUTER_API_KEY` | optional, **free models**, from openrouter.ai → Keys |

Any one AI key turns on the AI brain. Leave them all out to run without AI.
With several keys, each staff member uses the first that works in this order: Claude, Gemini, Groq, OpenRouter
(the Librarian tries Gemini first). If one hits its free limit, the next one answers.

Optional fine-tuning (only if you want it):
| Name | Example | What it does |
|---|---|---|
| `SNYP_AI_<STAFF>` | `SNYP_AI_STAT=groq` | Pick the provider for one staff member: `RINA`, `NADIA`, `STAT`, `METOD`, `LIB` |
| `GEMINI_MODEL` / `GROQ_MODEL` / `OPENROUTER_MODEL` | `gemini-flash-latest` | Change the model if a default is retired |

Free tiers: Google may use what you send on Gemini's free tier to improve its products, and that includes thesis text.

Keep the existing Upstash variables (`KV_REST_API_*` or `UPSTASH_REDIS_REST_*`). Both names work.
Secrets live only in Vercel: never in the code, the repo, the browser or a chat.

## 5. Redeploy
The upload in step 2 triggers a new deploy, but environment variables added afterwards need one more:
Deployments → … on the latest → **Redeploy**.

## 6. First run
1. Open the project's `https://….vercel.app` URL → log in with `APP_PASSWORD`.
2. The header must say **"Saved on server · shared across devices"**. If it shows LOCAL TEST MODE or an error, Redis is not connected to this project: check Storage, then redeploy.
3. **Backup** tab → Restore from ABB.json → choose `thesis-archive/05_Backup/ABB_original.json` → your 4 original tickets come back.
4. **Documents** tab → 16 journal PDFs listed → **Run draft check**.
5. Open the same URL on your phone, log in, and check you see the same tickets.

## Updating thesis documents later
Repo → the right folder in `thesis-archive` → **Add file → Upload files** → Commit. Vercel redeploys by itself.
Move old versions to `06_Archive` instead of deleting them.

## What lives where
| Kind | Where | Backup |
|---|---|---|
| Source code | the private GitHub repo | git history |
| Thesis documents | `thesis-archive/` in the same repo, plus `SNYP_Thesis/` in Claude project files | git history |
| App data (tickets, logs, meetings, settings) | Upstash Redis | Backup tab: Export ABB.json; automatic daily snapshot; snapshot before every restore |

The original 9.4 MB zip is not in the repo (the app cannot serve files over 4.5 MB). It stays in
`SNYP_Thesis/05_Backup` in the Claude project files and on your own computer.

## Recovering in a new chat or a rebuilt app
- New Claude chat: upload the latest exported ABB.json plus the documents you need.
- Rebuilt app: deploy the repo again on Vercel, connect Upstash, set step 4, then Backup → restore ABB.json.

## Running locally (developers)
```
npm install
npm run dev                          # http://localhost:3000, password: snyp-local, uses thesis-archive/
npm test                             # backend tests
node --test test/e2e.test.js         # browser tests (needs Playwright + Chromium)
```
