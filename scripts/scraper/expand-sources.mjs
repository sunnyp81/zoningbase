#!/usr/bin/env node
/**
 * ZoningBase — Auto-expand sources.json with US cities
 *
 * Uses Gemini Flash to generate city lists for all 50 US states.
 * Only adds cities not already in sources.json.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/scraper/expand-sources.mjs
 *   GEMINI_API_KEY=... node scripts/scraper/expand-sources.mjs --min-pop 100000
 *   GEMINI_API_KEY=... node scripts/scraper/expand-sources.mjs --state "Ohio"
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_PATH = join(__dirname, 'sources.json');
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// All 50 US states + DC
const ALL_STATES = [
  { name: 'Alabama', abbreviation: 'AL' },
  { name: 'Alaska', abbreviation: 'AK' },
  { name: 'Arizona', abbreviation: 'AZ' },
  { name: 'Arkansas', abbreviation: 'AR' },
  { name: 'California', abbreviation: 'CA' },
  { name: 'Colorado', abbreviation: 'CO' },
  { name: 'Connecticut', abbreviation: 'CT' },
  { name: 'Delaware', abbreviation: 'DE' },
  { name: 'District of Columbia', abbreviation: 'DC' },
  { name: 'Florida', abbreviation: 'FL' },
  { name: 'Georgia', abbreviation: 'GA' },
  { name: 'Hawaii', abbreviation: 'HI' },
  { name: 'Idaho', abbreviation: 'ID' },
  { name: 'Illinois', abbreviation: 'IL' },
  { name: 'Indiana', abbreviation: 'IN' },
  { name: 'Iowa', abbreviation: 'IA' },
  { name: 'Kansas', abbreviation: 'KS' },
  { name: 'Kentucky', abbreviation: 'KY' },
  { name: 'Louisiana', abbreviation: 'LA' },
  { name: 'Maine', abbreviation: 'ME' },
  { name: 'Maryland', abbreviation: 'MD' },
  { name: 'Massachusetts', abbreviation: 'MA' },
  { name: 'Michigan', abbreviation: 'MI' },
  { name: 'Minnesota', abbreviation: 'MN' },
  { name: 'Mississippi', abbreviation: 'MS' },
  { name: 'Missouri', abbreviation: 'MO' },
  { name: 'Montana', abbreviation: 'MT' },
  { name: 'Nebraska', abbreviation: 'NE' },
  { name: 'Nevada', abbreviation: 'NV' },
  { name: 'New Hampshire', abbreviation: 'NH' },
  { name: 'New Jersey', abbreviation: 'NJ' },
  { name: 'New Mexico', abbreviation: 'NM' },
  { name: 'North Carolina', abbreviation: 'NC' },
  { name: 'North Dakota', abbreviation: 'ND' },
  { name: 'Ohio', abbreviation: 'OH' },
  { name: 'Oklahoma', abbreviation: 'OK' },
  { name: 'Oregon', abbreviation: 'OR' },
  { name: 'Pennsylvania', abbreviation: 'PA' },
  { name: 'Rhode Island', abbreviation: 'RI' },
  { name: 'South Carolina', abbreviation: 'SC' },
  { name: 'South Dakota', abbreviation: 'SD' },
  { name: 'Tennessee', abbreviation: 'TN' },
  { name: 'Texas', abbreviation: 'TX' },
  { name: 'Utah', abbreviation: 'UT' },
  { name: 'Vermont', abbreviation: 'VT' },
  { name: 'Virginia', abbreviation: 'VA' },
  { name: 'Washington', abbreviation: 'WA' },
  { name: 'West Virginia', abbreviation: 'WV' },
  { name: 'Wisconsin', abbreviation: 'WI' },
  { name: 'Wyoming', abbreviation: 'WY' },
];

async function getCitiesForState(stateName, stateAbbr, minPop) {
  const prompt = `List all cities in ${stateName} (${stateAbbr}) with population above ${minPop.toLocaleString()}.

For each city provide:
- name: City name (official, no abbreviations)
- county: Full county name including "County" suffix (e.g. "Harris County")
- population: Estimated population (integer)
- latitude: City center latitude (decimal, 4 places)
- longitude: City center longitude (decimal, 4 places)

Return ONLY a valid JSON array. No markdown, no explanation. Example:
[{"name":"Phoenix","county":"Maricopa County","population":1608139,"latitude":33.4484,"longitude":-112.0740}]`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  let cities;
  try {
    cities = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const fixed = match[0].replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']').replace(/\n/g, ' ');
      cities = JSON.parse(fixed);
    } else {
      throw new Error('No JSON array in response');
    }
  }

  return cities.filter(c => c.name && c.county && c.population >= minPop);
}

async function main() {
  if (!GEMINI_KEY) {
    console.error('GEMINI_API_KEY required.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const minPop = parseInt(args.find((a, i) => args[i - 1] === '--min-pop') || '100000');
  const filterState = args.find((a, i) => args[i - 1] === '--state');

  console.log(`Expanding sources.json — min population: ${minPop.toLocaleString()}`);
  if (filterState) console.log(`Filtering to state: ${filterState}`);

  // Load existing sources
  const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf-8'));

  // Build set of existing cities for dedup
  const existingCities = new Set();
  for (const state of sources.states) {
    for (const city of state.cities) {
      existingCities.add(`${city.name}|${state.name}`.toLowerCase());
    }
  }

  const statesToProcess = filterState
    ? ALL_STATES.filter(s => s.name.toLowerCase() === filterState.toLowerCase())
    : ALL_STATES.filter(s => !sources.states.find(es => es.name === s.name));

  if (statesToProcess.length === 0) {
    console.log('No new states to process. All states already in sources.json.');
    return;
  }

  console.log(`Processing ${statesToProcess.length} states...\n`);

  let totalAdded = 0;

  for (const state of statesToProcess) {
    try {
      console.log(`── ${state.name} (${state.abbreviation}) ──`);
      const cities = await getCitiesForState(state.name, state.abbreviation, minPop);

      // Filter out already-existing cities
      const newCities = cities.filter(c => !existingCities.has(`${c.name}|${state.name}`.toLowerCase()));

      if (newCities.length === 0) {
        console.log(`  No new cities above ${minPop.toLocaleString()} pop.`);
        await sleep(4000);
        continue;
      }

      // Find or create state entry
      let stateEntry = sources.states.find(s => s.name === state.name);
      if (!stateEntry) {
        stateEntry = { name: state.name, abbreviation: state.abbreviation, cities: [] };
        sources.states.push(stateEntry);
      }

      // Add new cities
      for (const city of newCities) {
        stateEntry.cities.push({
          name: city.name,
          county: city.county,
          population: city.population,
          latitude: city.latitude,
          longitude: city.longitude,
          platform: 'gemini',
          urls: [],
        });
        existingCities.add(`${city.name}|${state.name}`.toLowerCase());
      }

      console.log(`  +${newCities.length} cities: ${newCities.map(c => c.name).join(', ')}`);
      totalAdded += newCities.length;

      // Rate limit
      await sleep(4500);
    } catch (err) {
      console.error(`  [error] ${state.name}: ${err.message}`);
      await sleep(2000);
    }
  }

  // Sort states alphabetically
  sources.states.sort((a, b) => a.name.localeCompare(b.name));

  // Write updated sources
  writeFileSync(SOURCES_PATH, JSON.stringify(sources, null, 2) + '\n', 'utf-8');

  console.log(`\n── Done ──`);
  console.log(`Added ${totalAdded} cities across ${statesToProcess.length} states`);
  console.log(`Total states: ${sources.states.length}`);
  console.log(`Total cities: ${sources.states.reduce((s, st) => s + st.cities.length, 0)}`);
  console.log(`\nNext: push to GitHub — the weekly cron will extract zoning data automatically.`);
}

main().catch(console.error);
