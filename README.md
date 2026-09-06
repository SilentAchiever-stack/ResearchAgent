# Research Agent - API

Takes a topic, plans a few specific searches, searches the real web,
synthesizes the results into a written report with citations, and
saves it as a markdown document. Runs as a real API you can call from
anywhere - a frontend, another service, or just for testing.

## Live deployment

This is deployed and running at:
```
https://researchagent-2y8u.onrender.com
```

**Render free tier "cold starts":** the service spins down after a
period of no traffic and takes 30-60 seconds to wake up on the next
request. The first call after inactivity may feel slow or briefly
time out - that's normal free-tier behavior, not a bug. Just retry
if the first call fails.

**Important - saved report files don't persist:** this project saves
each report as a `.md` file on disk. On Render's free tier, that disk
is wiped every time the service restarts or spins down from
inactivity - so the `/reports/:filename` download link only works
reliably for a short time after generating a report, not indefinitely.
For a real production version, you'd save reports to a database or
cloud storage (like S3) instead of local disk. For this project,
**the full report text is already included directly in the API
response** - so you don't actually need the file download to get the
result.

## The agent pattern this demonstrates

This is a genuine multi-step agent - not one API call, but a chain:

1. **Plan** - the topic gets broken into 3 specific search queries
   (better coverage than one broad search)
2. **Search** - each query hits the real web via Tavily's search API
3. **Synthesize** - all the raw results get turned into one coherent,
   organized report, with the model told explicitly to only use the
   provided sources, not invent facts
4. **Save** - the report gets written to a real `.md` file on disk,
   with a sources list at the bottom

## Setup (for running your own copy locally)

1. Get a free Tavily API key at tavily.com (no card needed for the
   free tier)
2. Get a free Gemini API key at aistudio.google.com/app/apikey
3. Copy `.env.example` to `.env`, fill in `GEMINI_API_KEY`,
   `TAVILY_API_KEY`, and a `PORT` (pick a unique port if you're running
   this alongside other local projects - see note below)
4. Install:
   ```
   npm install
   ```

**If deploying your own copy to Render**: add each environment
variable individually under the service's Environment settings tab,
rather than uploading a `.env` file - keeps real API keys out of your
GitHub repo. Render assigns its own `PORT` automatically in
production, which the code already handles via
`process.env.PORT || 3000`.

## Running it - two modes

**API mode (default)** - starts a real server, stays running, waits
for requests:
```
node researchAgent.js
```
You should see: `Research Agent API running on http://localhost:<PORT>`

**CLI mode** - runs once from the terminal, for a quick manual test:
```
node researchAgent.js --cli "your topic here"
```

## How to use it - step by step

**1. Trigger research on any topic** (POST request):
```powershell
Invoke-RestMethod -Uri "https://researchagent-2y8u.onrender.com/api/research" -Method POST -ContentType "application/json" -Body '{"topic": "the history of jollof rice"}'
```

**2. Wait for it to finish** - this takes a bit longer than a normal
chat request, since it's doing multiple steps behind the scenes:
planning search queries, running several real web searches, then
writing the full report. Expect anywhere from 10-30 seconds, longer
if it's waking up from a cold start.

**3. Read the response** - it comes back as JSON containing:
   - `topic` - what you asked for
   - `queries` - the 3 search queries the agent planned on its own
   - `report` - the full, ready-to-read report text (markdown format)
   - `sources` - the raw web sources used, with titles and URLs
   - `filename` - the name of the saved report file (see note above
     about it not persisting long-term)

**4. (Optional) Download the file version**, only useful shortly
after generating it, before the server potentially spins down:
```
https://researchagent-2y8u.onrender.com/reports/<filename-from-step-3>
```

## API Reference (for frontend developers integrating this)

**Base URL:** `https://researchagent-2y8u.onrender.com`

CORS is enabled - this API can be called directly from browser-based
frontends on any domain.

### `POST /api/research`

Generates a research report on a given topic.

**Request body:**
```json
{
  "topic": "the history of jollof rice"
}
```

**Success response - `200 OK`:**
```json
{
  "topic": "the history of jollof rice",
  "queries": ["search query 1", "search query 2", "search query 3"],
  "report": "# the history of jollof rice\n\nFull markdown report text...",
  "sources": [
    { "title": "Source title", "url": "https://...", "content": "..." }
  ],
  "filename": "report-the-history-of-jollof-rice.md"
}
```

**Error responses:**
- `400 Bad Request` - `{"error": "topic is required"}` - sent if
  `topic` is missing from the request body
- `500 Internal Server Error` - `{"error": "..."}` - sent if the AI or
  search API fails (rate limits, temporary outages, etc.). The message
  will describe which step failed (planning, searching, or synthesis)

**Typical response time:** 10-30 seconds (this runs multiple steps
internally - see "The agent pattern" above). Longer on a cold start
(see note above).

### `GET /reports/:filename`

Downloads a previously generated report as a raw markdown file.
Only reliable shortly after generation - see the ephemeral storage
note above. Most integrations won't need this, since the full report
text is already included in the `/api/research` response.

### Minimal frontend integration example

```javascript
async function getReport(topic) {
  const res = await fetch('https://researchagent-2y8u.onrender.com/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic })
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Request failed');
  }

  const data = await res.json();
  return data.report; // ready-to-render markdown string
}
```

## Why this uses Tavily instead of a generic search API

Tavily is built specifically for AI agents - results come back
pre-cleaned (title, URL, readable content extracted), rather than raw
search-engine HTML you'd have to parse yourself.

## Known limitations (intentional, for a learning project)

- No re-ranking of results - takes Tavily's top results as-is
- No evaluation of source quality/reliability
- Saves as markdown, not a polished Word document
- No retry/backoff on temporary API failures (see "Rate limits" below)
  - a failed request just returns an error, rather than automatically
  retrying

## Rate limits - a real thing you'll hit while testing

The free Gemini tier limits how many requests you can make per day,
and this varies significantly by model name (some models cap at just
20/day, others allow ~1,500/day). If you get a `429` or `503` error:

- **429 (quota exceeded)** - you've hit your daily limit for that
  specific model. Wait for the reset (daily quotas reset at midnight
  Pacific Time), or try a different model name like
  `gemini-flash-latest`
- **503 (high demand)** - temporary server overload on Google's end,
  unrelated to your usage. Just retry in a moment.

If you're also running the restaurant assistant, multi-platform bot,
or email bot projects with the same `GEMINI_API_KEY`, they all share
the same daily quota - heavy testing across multiple projects in one
day adds up fast.

## Port conflicts

If you're running this alongside other local projects, make sure each
one has a different `PORT` set in its own `.env` file - running two
projects on the same port will cause one to fail with an
`EADDRINUSE` error.
