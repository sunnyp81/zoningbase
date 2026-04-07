#!/usr/bin/env node
/**
 * ZoningBase — Gemini Flash Zoning Data Extractor
 *
 * Fetches municipal code pages and uses Gemini Flash (free tier)
 * to extract structured zoning data.
 *
 * Usage:
 *   node scripts/scraper/extract.mjs [--state texas] [--city dallas]
 *   node scripts/scraper/extract.mjs --all
 *
 * Env: GEMINI_API_KEY (required)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

const OUTPUT_DIR = join(__dirname, '..', '..', 'db', 'scraped');
const CACHE_DIR = join(__dirname, '.cache');

// ── Helpers ─────────────────────────────────────────────────

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPage(url) {
  const cacheFile = join(CACHE_DIR, slugify(url) + '.html');
  if (existsSync(cacheFile)) {
    console.log(`  [cache] ${url}`);
    return readFileSync(cacheFile, 'utf-8');
  }

  console.log(`  [fetch] ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ZoningBase/1.0; +https://zoningbase.com)',
      'Accept': 'text/html',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cacheFile, html, 'utf-8');
  return html;
}

function extractTextFromHTML(html, maxChars = 30000) {
  const $ = cheerio.load(html);

  // Remove scripts, styles, nav, footer
  $('script, style, nav, footer, header, .sidebar, #sidebar').remove();

  // Try to find main content area
  let text = '';
  const selectors = [
    '#content-wrapper', '.chunk-content', '.code-content',
    'article', 'main', '#main-content', '.document-content',
    'body',
  ];

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 500) {
      text = el.text();
      break;
    }
  }

  if (!text) text = $('body').text();

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Truncate for Gemini context
  if (text.length > maxChars) {
    text = text.substring(0, maxChars) + '\n[...truncated]';
  }

  return text;
}

// ── Gemini Flash Extraction ─────────────────────────────────

const EXTRACTION_PROMPT = `You are a zoning code data extraction specialist. Analyze the following municipal zoning ordinance text and extract ALL zoning districts mentioned.

For each zoning district, extract:
- zone_code: The official district code (e.g., "R-1", "MF-4", "C-2", "I-1")
- zone_name: Full name of the district
- description: 1-2 sentence description of the district's purpose
- max_height_ft: Maximum building height in feet (number or null)
- far: Floor Area Ratio (decimal number or null)
- min_lot_size_sqft: Minimum lot size in square feet (number or null)
- max_impervious_cover_pct: Maximum impervious cover percentage (number or null)
- setback_front_ft: Front yard setback in feet (number or null)
- setback_rear_ft: Rear yard setback in feet (number or null)
- setback_side_ft: Side yard setback in feet (number or null)
- parking_requirement: Parking requirement text (string or null)
- permitted_uses: Array of {name, category} where category is one of: Residential, Commercial, Civic, Industrial

IMPORTANT RULES:
- Only extract ACTUAL data found in the text. Use null for missing values.
- Zone codes must match what's in the ordinance exactly.
- For permitted_uses, only include uses explicitly mentioned for that district.
- If a page only lists district names without details, still include them with null values.
- Return VALID JSON only — no markdown, no explanation.

Return a JSON array of zone objects. Example:
[
  {
    "zone_code": "R-1",
    "zone_name": "Single-Family Residential",
    "description": "Low-density single-family residential district.",
    "max_height_ft": 35,
    "far": 0.4,
    "min_lot_size_sqft": 7500,
    "max_impervious_cover_pct": 45,
    "setback_front_ft": 25,
    "setback_rear_ft": 5,
    "setback_side_ft": 5,
    "parking_requirement": "2 spaces per dwelling unit.",
    "permitted_uses": [
      {"name": "Single-Family Detached", "category": "Residential"},
      {"name": "Home Occupation", "category": "Residential"}
    ]
  }
]

MUNICIPAL CODE TEXT:
`;

async function extractWithGemini(text) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');

  const body = {
    contents: [{
      parts: [{ text: EXTRACTION_PROMPT + text }],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!responseText) throw new Error('No response from Gemini');

  try {
    return JSON.parse(responseText);
  } catch {
    // Try to extract JSON from response
    const match = responseText.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse Gemini response as JSON');
  }
}

// ── SQL Generator ───────────────────────────────────────────

function esc(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  return `'${String(val).replace(/'/g, "''")}'`;
}

function generateCitySQL(stateInfo, cityInfo, zones) {
  const lines = [];
  const stateSlug = slugify(stateInfo.name);
  const countySlug = slugify(cityInfo.county);
  const citySlug = slugify(cityInfo.name);

  lines.push(`-- Auto-scraped: ${cityInfo.name}, ${stateInfo.abbreviation}`);
  lines.push(`-- Source: ${cityInfo.platform} | ${new Date().toISOString()}`);
  lines.push(`-- Zones extracted: ${zones.length}`);
  lines.push('');
  lines.push('PRAGMA foreign_keys = ON;');
  lines.push('');

  // State
  lines.push(`INSERT INTO states (name, slug, abbreviation) VALUES (${esc(stateInfo.name)}, ${esc(stateSlug)}, ${esc(stateInfo.abbreviation)}) ON CONFLICT (slug) DO NOTHING;`);

  // County
  lines.push(`INSERT INTO counties (state_id, name, slug) VALUES ((SELECT id FROM states WHERE slug = ${esc(stateSlug)}), ${esc(cityInfo.county)}, ${esc(countySlug)}) ON CONFLICT (state_id, slug) DO NOTHING;`);

  // City
  lines.push(`INSERT INTO cities (county_id, name, slug, latitude, longitude, population) VALUES ((SELECT id FROM counties WHERE slug = ${esc(countySlug)} AND state_id = (SELECT id FROM states WHERE slug = ${esc(stateSlug)})), ${esc(cityInfo.name)}, ${esc(citySlug)}, ${cityInfo.latitude}, ${cityInfo.longitude}, ${cityInfo.population}) ON CONFLICT (county_id, slug) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, population = excluded.population;`);
  lines.push('');

  // Collect unique uses
  const allUses = new Map();
  for (const z of zones) {
    for (const u of (z.permitted_uses || [])) {
      allUses.set(`${u.name}|${u.category}`, u);
    }
  }

  // Insert uses
  for (const u of allUses.values()) {
    lines.push(`INSERT INTO permitted_uses (name, category) VALUES (${esc(u.name)}, ${esc(u.category)}) ON CONFLICT (name, category) DO NOTHING;`);
  }
  lines.push('');

  // Zones
  for (const z of zones) {
    if (!z.zone_code) continue;
    const zoneSlug = slugify(z.zone_code);

    lines.push(`INSERT INTO zones (city_id, zone_code, zone_code_slug, zone_name, description, max_height_ft, far, min_lot_size_sqft, max_impervious_cover_pct, setback_front_ft, setback_rear_ft, setback_side_ft, parking_requirement)`);
    lines.push(`  VALUES ((SELECT id FROM cities WHERE slug = ${esc(citySlug)}), ${esc(z.zone_code)}, ${esc(zoneSlug)}, ${esc(z.zone_name || z.zone_code)}, ${esc(z.description)}, ${esc(z.max_height_ft)}, ${esc(z.far)}, ${esc(z.min_lot_size_sqft)}, ${esc(z.max_impervious_cover_pct)}, ${esc(z.setback_front_ft)}, ${esc(z.setback_rear_ft)}, ${esc(z.setback_side_ft)}, ${esc(z.parking_requirement)})`);
    lines.push(`  ON CONFLICT (city_id, zone_code_slug) DO UPDATE SET zone_name = excluded.zone_name, description = excluded.description, max_height_ft = excluded.max_height_ft, far = excluded.far, min_lot_size_sqft = excluded.min_lot_size_sqft, max_impervious_cover_pct = excluded.max_impervious_cover_pct, setback_front_ft = excluded.setback_front_ft, setback_rear_ft = excluded.setback_rear_ft, setback_side_ft = excluded.setback_side_ft, parking_requirement = excluded.parking_requirement;`);

    // Link uses
    if (z.permitted_uses?.length) {
      const useNames = z.permitted_uses.map(u => esc(u.name)).join(', ');
      lines.push(`INSERT INTO zone_permitted_uses (zone_id, permitted_use_id) SELECT z.id, pu.id FROM zones z, permitted_uses pu WHERE z.zone_code_slug = ${esc(zoneSlug)} AND z.city_id = (SELECT id FROM cities WHERE slug = ${esc(citySlug)}) AND pu.name IN (${useNames}) ON CONFLICT DO NOTHING;`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────

async function processCity(stateInfo, cityInfo) {
  console.log(`\n── ${cityInfo.name}, ${stateInfo.abbreviation} (${cityInfo.platform}) ──`);

  let allZones = [];

  for (const url of cityInfo.urls) {
    try {
      const html = await fetchPage(url);
      const text = extractTextFromHTML(html);

      if (text.length < 200) {
        console.log(`  [skip] Page too short (${text.length} chars) — likely JS-rendered`);

        // For JS-rendered pages, try Municode API
        if (cityInfo.platform === 'municode') {
          console.log(`  [info] Municode is JS-rendered. Using cached/manual data if available.`);
        }
        continue;
      }

      console.log(`  [text] ${text.length} chars extracted`);

      // Send to Gemini
      console.log(`  [gemini] Extracting zones...`);
      const zones = await extractWithGemini(text);
      console.log(`  [ok] ${zones.length} zones extracted`);
      allZones.push(...zones);

      // Rate limit: Gemini free tier is 15 RPM
      await sleep(4500);
    } catch (err) {
      console.error(`  [error] ${err.message}`);
    }
  }

  if (allZones.length === 0) {
    console.log(`  [skip] No zones extracted for ${cityInfo.name}`);
    return null;
  }

  // Generate SQL
  const sql = generateCitySQL(stateInfo, cityInfo, allZones);
  const filename = `${slugify(stateInfo.name)}-${slugify(cityInfo.name)}.sql`;
  const outputPath = join(OUTPUT_DIR, filename);

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(outputPath, sql, 'utf-8');
  console.log(`  [saved] ${filename} (${allZones.length} zones)`);

  return { city: cityInfo.name, zones: allZones.length, file: filename };
}

async function main() {
  if (!GEMINI_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable required.');
    console.error('Usage: GEMINI_API_KEY=your-key node scripts/scraper/extract.mjs');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const filterState = args.find((a, i) => args[i - 1] === '--state')?.toLowerCase();
  const filterCity = args.find((a, i) => args[i - 1] === '--city')?.toLowerCase();
  const runAll = args.includes('--all');

  const sources = JSON.parse(readFileSync(join(__dirname, 'sources.json'), 'utf-8'));
  const results = [];

  for (const state of sources.states) {
    if (filterState && slugify(state.name) !== filterState) continue;

    for (const city of state.cities) {
      if (filterCity && slugify(city.name) !== filterCity) continue;
      if (!runAll && !filterCity && !filterState) {
        console.log(`Skipping ${city.name} (use --all, --state, or --city to run)`);
        continue;
      }

      const result = await processCity(state, city);
      if (result) results.push(result);
    }
  }

  console.log('\n── Summary ──');
  if (results.length === 0) {
    console.log('No cities processed.');
  } else {
    let totalZones = 0;
    for (const r of results) {
      console.log(`  ${r.city}: ${r.zones} zones → ${r.file}`);
      totalZones += r.zones;
    }
    console.log(`\nTotal: ${results.length} cities, ${totalZones} zones`);
    console.log(`\nTo ingest: node scripts/scraper/ingest.mjs`);
  }
}

main().catch(console.error);
