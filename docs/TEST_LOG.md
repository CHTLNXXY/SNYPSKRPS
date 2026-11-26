# Test log

Run on 26 Nov 2026 in a cloud container (Node 22, Chromium via Playwright). Data: the original ABB.json and the
real thesis archive (`SNYP_Thesis`). "Tested" here means an automated test ran and passed. Nothing below
was tested on the real Vercel, Upstash or GitHub services yet, because those need your accounts.

## Results

| Suite | Command | Result |
|---|---|---|
| Backend, local store | `node --test test/backend.test.js` | 13 / 13 pass |
| Backend through the real `@upstash/redis` client against a local server that speaks the Upstash REST protocol | `node --test test/redis.test.js` | 14 / 14 pass |
| Browser end-to-end, two browser "devices", time ×60 | `node --test test/e2e.test.js` | 9 / 9 pass |
| Real-speed check (no time acceleration) | manual script | Rina received, routed, carried and delivered a request in 11.5 s |
| Phone layout (iPhone 13 emulation) | screenshot | No horizontal scroll; office on top, panel below |

## What each requirement was tested with

| Requirement | Tested by | Status |
|---|---|---|
| Login required; wrong password refused; brute-force throttle | backend 1, 11; e2e 1; documents refuse anonymous access (e2e 8) | Tested |
| ABB.json imports: 4 tickets, assignees, numbering, last draft revision | backend 2 | Tested |
| Rina analyses, routes (rule-based), picks up, climbs stairs, delivers, returns | e2e 2 (event trace: routed → picked up → stairs 0→1 → delivered → stairs 1→0 → back at reception) | Tested |
| Staff never start without your go-ahead | backend 4 (server refuses), e2e 2 (status stays "delivered") | Tested |
| Working animation → printer trip → "ready" → your approval; full history | e2e 3 | Tested (AI off: you hand over the result text) |
| Director patrols all 5 stations, flags waiting work and the #3/#4 duplicate, never moves or edits a ticket | e2e 4, backend 4 (server refuses Director approve/edit/close) | Tested |
| Rooftop meeting: request in progress kept safe, everyone walks up, you at the head seat, 6 role views + yours, Nadia's minutes, action → ticket, all return, held ticket delivered afterwards | e2e 5, backend 8 | Tested (template views, AI off) |
| Cross-device: same data on a second device, change on B appears on A, only one device drives the office | e2e 6, backend 6 (simultaneous changes both survive) | Tested locally with two browser contexts on one server |
| Night Shift: night tickets wait until Night Shift is on | e2e 7 | Tested |
| Document archive: 16 PDFs listed, exact bytes served, path tricks blocked | backend 10, e2e 8 | Tested from the bundled thesis-archive/ folder |
| Automatic draft check finds the same issues as the old app (3.2.2, 3.4, 6 of 7 references) and creates no duplicate tickets | backend 7, e2e 8 | Tested |
| Export ABB.json, restore, snapshot before restore, daily snapshot, reject foreign files | backend 9, e2e 9 | Tested |
| Fails loudly on Vercel without Redis (no silent browser fallback) | backend 13 | Tested |

## Not tested yet (needs your accounts or a key)
1. **Real Vercel deployment** (routing of `api/*.js`, `outputDirectory: public`, cookies over HTTPS).
2. **Real Upstash Redis.** The protocol path is tested against a local stand-in, not the real service.
3. **Real cross-device use** over the internet (phone + laptop).
4. **Archive bundled on Vercel** (`includeFiles: thesis-archive/**`). The same code path is tested locally from the bundled folder.
5. **AI mode** (`ANTHROPIC_API_KEY`): Rina's AI routing, staff-drafted results, AI meeting views and minutes. Without a key the endpoint correctly reports "AI off" (backend 12).

These are the checks in `DEPLOY.md` step 6 (First run).
