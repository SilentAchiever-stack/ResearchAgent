# Research Agent — API

Takes a topic, plans a few specific searches, searches the real web,
synthesizes the results into a written report with citations, and
saves it as a markdown document. Runs as a real API you can call from
anywhere — a frontend, another service, or just for testing.

## The agent pattern this demonstrates

This is a genuine multi-step agent — not one API call, but a chain:

1. **Plan** — the topic gets broken into 3 specific search queries
   (better coverage than one broad search)
2. **Search** — each query hits the real web via Tavily's search API
3. **Synthesize** — all the raw results get turned into one coherent,
   organized report, with the model told explicitly to only use the
   provided sources, not invent facts
4. **Save** — the report gets written to a real `.md` file on disk,
   with a sources list at the bottom

## Setup

1. Get a free Tavily API key at tavily.com (no card needed for the
   free tier)
2. Get a free Gemini API key at aistudio.google.com/app/apikey
3. Copy `.env.example` to `.env`, fill in `GEMINI_API_KEY`,
   `TAVILY_API_KEY`, and a `PORT` (pick a unique port if you're running
   this alongside other local projects — see note below)
4. Install:
   ```
   npm install
   ```

## Running it — two modes

**API mode (default)** — starts a real server, stays running, waits
for requests:
```
node researchAgent.js
```
You should see: `Research Agent API running on http://localhost:<PORT>`

**CLI mode** — runs once from the terminal, for a quick manual test:
```
node researchAgent.js --cli "your topic here"
```

## Calling the API

**Trigger research on a topic** (POST):
```powershell
Invoke-RestMethod -Uri "http://localhost:3004/api/research" -Method POST -ContentType "application/json" -Body '{"topic": "the history of jollof rice"}'
```
Returns JSON containing the topic, the planned search queries, the
full report text, the raw sources used, and the saved filename.

**Download the saved report file directly** (GET):
```
http://localhost:3004/reports/report-the-history-of-jollof-rice.md
```
(filename comes from the response of the POST call above)

## Why this uses Tavily instead of a generic search API

Tavily is built specifically for AI agents — results come back
pre-cleaned (title, URL, readable content extracted), rather than raw
search-engine HTML you'd have to parse yourself.

## Known limitations (intentional, for a learning project)

- No re-ranking of results — takes Tavily's top results as-is
- No evaluation of source quality/reliability
- Saves as markdown, not a polished Word document
- No retry/backoff on temporary API failures (see "Rate limits" below)
  — a failed request just returns an error, rather than automatically
  retrying

## Rate limits — a real thing you'll hit while testing

The free Gemini tier limits how many requests you can make per day,
and this varies significantly by model name (some models cap at just
20/day, others allow ~1,500/day). If you get a `429` or `503` error:

- **429 (quota exceeded)** — you've hit your daily limit for that
  specific model. Wait for the reset (daily quotas reset at midnight
  Pacific Time), or try a different model name like
  `gemini-flash-latest`
- **503 (high demand)** — temporary server overload on Google's end,
  unrelated to your usage. Just retry in a moment.

If you're also running the restaurant assistant, multi-platform bot,
or email bot projects with the same `GEMINI_API_KEY`, they all share
the same daily quota — heavy testing across multiple projects in one
day adds up fast.

## Port conflicts

If you're running this alongside other local projects, make sure each
one has a different `PORT` set in its own `.env` file — running two
projects on the same port will cause one to fail with an
`EADDRINUSE` error.