# SNYP University

A persistent virtual thesis office: a three-floor isometric office (lobby and reception, staff workspace,
rooftop meeting area) where every movement follows real work. Rina receives your requests, opens a ticket
and walks it to the responsible staff member. Staff start only after your go-ahead, show when results are
ready, and wait for your approval. The Director patrols and flags stuck work but can never approve or edit.
Meetings bring everyone to the rooftop; Nadia records minutes and action items become tickets.

- Shared, persistent storage: Vercel Serverless Functions + Upstash Redis (no browser-only storage)
- Password login; all secrets only in Vercel environment variables
- Thesis document archive (`thesis-archive/`) served only behind the login
- ABB.json export/restore, automatic daily snapshots
- Optional AI brain: Claude (paid) or free Gemini, Groq and OpenRouter keys; the Librarian can check references with Google Search

Deploy: see [docs/DEPLOY.md](docs/DEPLOY.md). Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
What has been tested, and how: [docs/TEST_LOG.md](docs/TEST_LOG.md).
