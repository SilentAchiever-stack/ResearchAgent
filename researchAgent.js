// researchAgent.js
// Takes a topic, searches the web, synthesizes a report, saves it as a
// markdown document — now available BOTH as a terminal command AND as
// a real API endpoint.
//
// Requires: npm install express dotenv
// Requires a free Tavily API key (built specifically for AI agents to
// search the web) — get one at tavily.com, free tier included
//
// Run as an API:  node researchAgent.js
// Run as a CLI:   node researchAgent.js --cli "your topic here"

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

async function searchWeb(query) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: 5,
      include_answer: false
    })
  });
  const data = await response.json();
  return data.results || [];
}

async function planSearches(topic) {
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GEMINI_API_KEY}` },
      body: JSON.stringify({
        model:'gemini-flash-latest',
        messages: [
          {
            role: 'system',
            content: `Given a research topic, break it into 3 specific, distinct search queries that together would give good, well-rounded coverage of the topic. Respond with ONLY valid JSON, no other text, in this shape:
{"queries": ["query one", "query two", "query three"]}`
          },
          { role: 'user', content: topic }
        ]
      })
    }
  );
  const data = await response.json();

  if (!data.choices || !data.choices[0]) {
    console.error('planSearches — unexpected API response:', JSON.stringify(data));
    throw new Error('Failed to plan search queries — API error (see server log for details, possibly a rate limit).');
  }

  const cleaned = data.choices[0].message.content.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned).queries;
}

async function synthesizeReport(topic, allResults) {
  const sourcesText = allResults.map((r, i) =>
    `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.content}\n`
  ).join('\n');

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GEMINI_API_KEY}` },
      body: JSON.stringify({
        model:'gemini-flash-latest',
        messages: [
          {
            role: 'system',
            content: `You are a research assistant. Write a clear, well-organized report on the given topic, using ONLY the source material provided below. Structure it with a brief introduction, a few clearly-labeled sections covering different aspects of the topic, and a short conclusion. Cite sources inline like [Source 1] where relevant. Do not invent facts not present in the sources. Write in markdown format with headers.\n\nSource material:\n${sourcesText}`
          },
          { role: 'user', content: `Write a report on: ${topic}` }
        ]
      })
    }
  );
  const data = await response.json();

  if (!data.choices || !data.choices[0]) {
    console.error('synthesizeReport — unexpected API response:', JSON.stringify(data));
    throw new Error('Failed to synthesize report — API error (see server log for details, possibly a rate limit).');
  }

  return data.choices[0].message.content;
}

function saveReport(topic, reportText, sources) {
  const safeFilename = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
  const filename = `report-${safeFilename}.md`;
  const filepath = path.join(__dirname, 'reports', filename);

  fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });

  const sourcesList = sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join('\n');
  const fullDocument = `# ${topic}\n\n${reportText}\n\n---\n\n## Sources\n\n${sourcesList}\n`;

  fs.writeFileSync(filepath, fullDocument);
  return { filepath, filename };
}

async function runResearchAgent(topic) {
  console.log(`Researching: "${topic}"`);

  const queries = await planSearches(topic);
  console.log('Queries:', queries);

  let allResults = [];
  for (const query of queries) {
    console.log(`  Searching: "${query}"`);
    const results = await searchWeb(query);
    allResults = allResults.concat(results);
  }
  console.log(`Found ${allResults.length} sources total.`);

  const report = await synthesizeReport(topic, allResults);
  const { filepath, filename } = saveReport(topic, report, allResults);
  console.log(`Report saved to: ${filepath}`);

  return { topic, queries, report, sources: allResults, filename };
}

function startApiServer() {
  const app = express();
  app.use(express.json());

  app.post('/api/research', async (req, res) => {
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'topic is required' });
    }

    try {
      const result = await runResearchAgent(topic);
      res.json(result);
    } catch (err) {
      console.error('Research error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/reports/:filename', (req, res) => {
    const filepath = path.join(__dirname, 'reports', req.params.filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.sendFile(filepath);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Research Agent API running on http://localhost:${PORT}`));
}

async function runCli() {
  const args = process.argv.slice(2);
  const topic = args.slice(1).join(' ');

  if (!topic) {
    console.error('Usage: node researchAgent.js --cli "your topic here"');
    process.exit(1);
  }

  try {
    await runResearchAgent(topic);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

if (process.argv.includes('--cli')) {
  runCli();
} else {
  startApiServer();
}