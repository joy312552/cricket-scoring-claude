# CREASE: live cricket scoring and broadcast overlays

Scoring console, broadcast control room, public scoreboard, and browser-source overlays (ARENA and PULSE themes).
No `npm install` and no build step: plain Node serverless functions plus static files. Deploys to Vercel as-is.

## Deploy (about 10 minutes)

1. **GitHub.** Upload every file of this folder to a new repository (keep the folder structure: `api/`, `lib/`, `public/`, `supabase/`, `vercel.json`, `package.json`).
2. **Supabase (database).** Create a free project at supabase.com. Open *SQL Editor -> New query*, paste `supabase/schema.sql`, press Run.
   Then *Project Settings -> API*: copy the **Project URL** and the **service_role** key.
3. **Vercel.** Import the GitHub repo. Framework Preset: **Other**. Leave build command and output directory empty.
   Add three Environment Variables, then Deploy:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_KEY` = service_role key (server-only, never put it in browser code)
   - `SESSION_SECRET` = any long random text (32+ characters)
4. Open your Vercel URL, click **Get started**, create an account.

Without the Supabase variables the site still runs, but data lives in memory and is lost. A warning banner shows in the dashboard.

## Use it

1. Dashboard: add **Teams** (logo, colours), **Players** (assign to teams), optionally a **Tournament**.
2. **Matches -> New match**, then pick the XI, toss and openers. Scoring starts.
3. **Scoring console** (`#/match/ID/score`): keypad, wicket sheet, extras, undo, edit last ball.
4. **Broadcast studio** (`#/match/ID/broadcast`): stage a graphic in PREVIEW, TAKE TO AIR, trigger celebrations, switch ARENA/PULSE.
5. Studio -> **Links & access**: copy the overlay URL. In OBS: Sources -> + -> Browser, paste the URL, width 1920, height 1080.
   `/o/TOKEN/all` is the one-link setup. Other panels have their own URLs.
6. Share `/m/MATCH_ID` for the public scoreboard, `/t/TOURNAMENT_ID` for the tournament page.

## Local run

    node dev-server.js     # http://localhost:3000 (data in .data/db.json)
    npm test               # Node 22+

## Architecture

- `lib/engine.js`: pure scoring engine. The per-innings command log is the source of truth; undo and edit rebuild state from it.
- `lib/api.js`: all API routes. Optimistic version locking on every write, idempotent commands (`command_id`), scorer lease.
- `lib/vm.js`: one view-model that the overlay, preview, public page and dashboard all render.
- `public/js/themes.js`: theme engine (ARENA, PULSE). Add a theme by adding renderers + CSS; no engine changes.
- Overlay tokens: 256-bit random, only the SHA-256 hash is used for lookup, revocable and rotatable, read-only.
- Celebrations carry an `event_seq`. The overlay ignores history on load, so refresh or reconnect never replays an animation.

## Features added in this version

- **Super Over** (after a tie): 3 batters, 1 over, repeats if tied again. NRR and points ignore Super Over innings.
- **Revised target (manual DLS)**: enter the target and overs from your DLS calculator; recorded in the audit trail.
- **Dead ball** button, **offline scoring queue** (IndexedDB, replayed in order with idempotent command ids; a conflict stops the queue and asks you).
- **Password reset** and **email verification** (optional, via Resend). Without `RESEND_API_KEY` the site works but reset links are not emailed.
- **QR codes** (public page, studio, and an on-air QR graphic), **CSV / JSON export**, **printable scorecard** (Print button, Save as PDF).

## Email setup (optional)

1. Create a free account at resend.com and an API key. 2. Add `RESEND_API_KEY` (and `EMAIL_FROM` once you verify a domain) in Vercel. 3. Redeploy.
Set `REQUIRE_VERIFIED=1` only after email works, otherwise nobody can sign in.

## Realtime (instant updates)

Updates are pushed with Supabase Realtime (Broadcast). The browser only receives a tiny "version changed" ping on a secret channel, then loads the real data through the normal authorised endpoints.
1. Supabase -> Project Settings -> API Keys: copy the **publishable** (anon) key. It is safe to be public.
2. Vercel -> add `SUPABASE_ANON_KEY` = that key, then Redeploy.
3. Supabase -> Project Settings -> Realtime: make sure public access is allowed.
Without `SUPABASE_ANON_KEY` everything still works using fast polling (about 1 second).
**Speed tip:** in Vercel -> Settings -> Functions, set the Function Region to the region closest to your Supabase project.

## Links

Share links use the form `/m/?id=MATCH_ID`, `/t/?id=TOURNAMENT_ID`, `/o/?t=TOKEN&p=all` (they work without any URL rewriting). Old path-style links still work when rewrites are active.

## Control room (v2)

- Click any switch and it goes on air immediately. Click again and it leaves with a transition. There is no preview or take-to-air step.
- **Main scoreboard** is one bar at the bottom: batters on the left, score and overs in the centre (CRR, projected score, target under it), bowler on the right.
- **Scoreboard sections** (timeline, projected score, target, partnership, match preview, toss, custom text) replace the batting/bowling area inside that bar.
- **Lower thirds** (batter card, bowler card, officials, drinks, rain, resumption, Player of the Match, champions, sponsors, QR) appear in a strip above the bar so the game stays visible.
- **Full panels** (scorecards, XIs, points table, charts, result, summary) use the centre of the screen.
- FOUR, SIX, WICKET, NO BALL and other celebrations play inside the scoreboard bar, not full screen.
- Two separate switches in Options: **Transition animations** and **Sound effects**. Sounds (whoosh, impact, crowd, brass) are synthesized in the browser. In OBS tick "Control audio via OBS" on the browser source to hear and mix them.
- Celebrations fill the whole scoreboard bar and show only the event word (FOUR, SIX, WICKET, NO BALL ...).
- Custom text shows both lines on the bowling side. A match-result graphic is available in the scoreboard sections.
- The public match page follows a Cricbuzz-style layout (Live, Scorecard, Commentary, Squads, Info). Matches can be deleted from the Matches list.

## Themes

ARENA (navy and gold), PULSE (graphite and lime), MOHUA (royal purple, cyan and gold, from the supplied design JSON). New graphics: timeline, projected score, over comparison bars, run progression line, both playing XIs.

## Match summary picture

Console, Studio -> Links & access, and the public page have a button that draws a branded 1080x1350 picture (download or share).

## Honest limits

- Realtime needs `SUPABASE_ANON_KEY` (see above) and could not be tested against a live Supabase from the build environment; polling is the automatic fallback.
- Not built: Test-match multi-innings, "social media info" graphic, a separate hand-designed layout for every table-style panel in each theme (the ticker, celebrations and key panels are distinct per theme; scorecards share structure).
- Rate limiting is in-memory per serverless instance (best effort).
- Row Level Security: the table has RLS on with no policies; only the server (service key) touches it.
- Visual design was not verified in a real browser or OBS in the build environment. Test each graphic in your setup before a live event.
