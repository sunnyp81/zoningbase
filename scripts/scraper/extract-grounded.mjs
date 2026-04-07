#!/usr/bin/env node
/**
 * ZoningBase — Gemini Grounded Zoning Extractor
 *
 * Uses Gemini Flash with Google Search grounding to extract
 * zoning data directly — no web scraping needed.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/scraper/extract-grounded.mjs --all
 *   GEMINI_API_KEY=... node scripts/scraper/extract-grounded.mjs --city "Fort Worth"
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
const OUTPUT_DIR = join(__dirname, '..', '..', 'db', 'scraped');

function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return v.toString();
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractCity(cityName, stateName, stateAbbr) {
  console.log(`\n── ${cityName}, ${stateAbbr} ──`);

  const prompt = `Search for the official zoning ordinance of ${cityName}, ${stateName} and extract ALL base zoning districts.

For each zoning district found, provide:
- zone_code: Official district code exactly as written in ordinance (e.g., "R-1", "MF-4", "C-2")
- zone_name: Full district name
- description: 1-2 sentence description of purpose
- max_height_ft: Maximum building height in feet (number or null if not found)
- far: Floor Area Ratio (number or null)
- min_lot_size_sqft: Minimum lot size in square feet (number or null)
- max_impervious_cover_pct: Max impervious cover % (number or null)
- setback_front_ft: Front setback in feet (number or null)
- setback_rear_ft: Rear setback in feet (number or null)
- setback_side_ft: Side setback in feet (number or null)
- parking_requirement: Text description or null
- permitted_uses: Array of {"name": "Use Name", "category": "Residential|Commercial|Civic|Industrial"}

Include at least residential, commercial, industrial, and mixed-use districts if they exist.
Limit to the 10 most important/common base zoning districts to keep the response manageable.
Return ONLY a valid JSON array of zone objects. No markdown, no explanation.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16384,
    },
  };

  console.log('  [gemini] Searching and extracting...');
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map(p => p.text)
    .filter(Boolean)
    .join('') || '';

  if (!text) throw new Error('Empty Gemini response');

  // Extract JSON from response — Gemini sometimes produces malformed JSON
  let zones;
  const jsonText = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    zones = JSON.parse(jsonText);
  } catch {
    // Try extracting JSON array
    const match = jsonText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        zones = JSON.parse(match[0]);
      } catch {
        // Fix common Gemini JSON issues: trailing commas, unescaped quotes
        let fixed = match[0]
          .replace(/,\s*}/g, '}')
          .replace(/,\s*\]/g, ']')
          .replace(/\n/g, ' ')
          .replace(/\t/g, ' ');
        try {
          zones = JSON.parse(fixed);
        } catch (e2) {
          console.log('  [debug] Response (first 800 chars):', jsonText.substring(0, 800));
          throw new Error('Could not parse JSON: ' + e2.message);
        }
      }
    } else {
      console.log('  [debug] Response (first 800 chars):', jsonText.substring(0, 800));
      throw new Error('No JSON array found in Gemini response');
    }
  }

  if (!Array.isArray(zones)) {
    throw new Error('Gemini response is not an array');
  }

  // Filter out invalid entries
  zones = zones.filter(z => z.zone_code && z.zone_code.trim());
  console.log(`  [ok] ${zones.length} zones extracted`);

  return zones;
}

function generateCitySQL(stateInfo, cityInfo, zones) {
  const lines = [];
  const stateSlug = slugify(stateInfo.name);
  const countySlug = slugify(cityInfo.county);
  const citySlug = slugify(cityInfo.name);

  lines.push(`-- Gemini-extracted: ${cityInfo.name}, ${stateInfo.abbreviation}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Zones: ${zones.length}`);
  lines.push('PRAGMA foreign_keys = ON;');
  lines.push('');
  lines.push(`INSERT INTO states (name, slug, abbreviation) VALUES (${esc(stateInfo.name)}, ${esc(stateSlug)}, ${esc(stateInfo.abbreviation)}) ON CONFLICT (slug) DO NOTHING;`);
  lines.push(`INSERT INTO counties (state_id, name, slug) VALUES ((SELECT id FROM states WHERE slug = ${esc(stateSlug)}), ${esc(cityInfo.county)}, ${esc(countySlug)}) ON CONFLICT (state_id, slug) DO NOTHING;`);
  lines.push(`INSERT INTO cities (county_id, name, slug, latitude, longitude, population) VALUES ((SELECT id FROM counties WHERE slug = ${esc(countySlug)} AND state_id = (SELECT id FROM states WHERE slug = ${esc(stateSlug)})), ${esc(cityInfo.name)}, ${esc(citySlug)}, ${cityInfo.latitude}, ${cityInfo.longitude}, ${cityInfo.population}) ON CONFLICT (county_id, slug) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude, population = excluded.population;`);
  lines.push('');

  // Unique uses
  const uses = new Map();
  for (const z of zones) for (const u of (z.permitted_uses || [])) uses.set(`${u.name}|${u.category}`, u);
  for (const u of uses.values()) lines.push(`INSERT INTO permitted_uses (name, category) VALUES (${esc(u.name)}, ${esc(u.category)}) ON CONFLICT (name, category) DO NOTHING;`);
  lines.push('');

  for (const z of zones) {
    const zs = slugify(z.zone_code);
    lines.push(`INSERT INTO zones (city_id, zone_code, zone_code_slug, zone_name, description, max_height_ft, far, min_lot_size_sqft, max_impervious_cover_pct, setback_front_ft, setback_rear_ft, setback_side_ft, parking_requirement) VALUES ((SELECT id FROM cities WHERE slug = ${esc(citySlug)}), ${esc(z.zone_code)}, ${esc(zs)}, ${esc(z.zone_name || z.zone_code)}, ${esc(z.description)}, ${esc(z.max_height_ft)}, ${esc(z.far)}, ${esc(z.min_lot_size_sqft)}, ${esc(z.max_impervious_cover_pct)}, ${esc(z.setback_front_ft)}, ${esc(z.setback_rear_ft)}, ${esc(z.setback_side_ft)}, ${esc(z.parking_requirement)}) ON CONFLICT (city_id, zone_code_slug) DO UPDATE SET zone_name = excluded.zone_name, description = excluded.description, max_height_ft = excluded.max_height_ft, far = excluded.far, min_lot_size_sqft = excluded.min_lot_size_sqft, max_impervious_cover_pct = excluded.max_impervious_cover_pct, setback_front_ft = excluded.setback_front_ft, setback_rear_ft = excluded.setback_rear_ft, setback_side_ft = excluded.setback_side_ft, parking_requirement = excluded.parking_requirement;`);
    if (z.permitted_uses?.length) {
      const uNames = z.permitted_uses.map(u => esc(u.name)).join(', ');
      lines.push(`INSERT INTO zone_permitted_uses (zone_id, permitted_use_id) SELECT z.id, pu.id FROM zones z, permitted_uses pu WHERE z.zone_code_slug = ${esc(zs)} AND z.city_id = (SELECT id FROM cities WHERE slug = ${esc(citySlug)}) AND pu.name IN (${uNames}) ON CONFLICT DO NOTHING;`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  if (!GEMINI_KEY) {
    console.error('GEMINI_API_KEY required. Usage:');
    console.error('  GEMINI_API_KEY=your-key node scripts/scraper/extract-grounded.mjs --all');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const filterCity = args.find((a, i) => args[i - 1] === '--city');
  const runAll = args.includes('--all');

  const sources = JSON.parse(readFileSync(join(__dirname, 'sources.json'), 'utf-8'));
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];

  for (const state of sources.states) {
    for (const city of state.cities) {
      if (filterCity && city.name.toLowerCase() !== filterCity.toLowerCase()) continue;
      if (!runAll && !filterCity) {
        console.log(`Skip ${city.name} — use --all or --city "${city.name}"`);
        continue;
      }

      try {
        const zones = await extractCity(city.name, state.name, state.abbreviation);

        if (zones.length > 0) {
          const sql = generateCitySQL(state, city, zones);
          const filename = `${slugify(state.name)}-${slugify(city.name)}.sql`;
          writeFileSync(join(OUTPUT_DIR, filename), sql, 'utf-8');
          console.log(`  [saved] ${filename}`);
          results.push({ city: city.name, zones: zones.length, file: filename });
        }

        // Rate limit: ~4s between requests (15 RPM free tier)
        await sleep(5000);
      } catch (err) {
        console.error(`  [error] ${city.name}: ${err.message}`);
      }
    }
  }

  console.log('\n── Summary ──');
  let total = 0;
  for (const r of results) {
    console.log(`  ${r.city}: ${r.zones} zones → ${r.file}`);
    total += r.zones;
  }
  console.log(`\nTotal: ${results.length} cities, ${total} zones`);
  if (results.length > 0) {
    console.log('\nTo ingest into D1:');
    console.log('  node scripts/scraper/ingest.mjs');
  }
}

main().catch(console.error);
