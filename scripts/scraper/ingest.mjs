#!/usr/bin/env node
/**
 * ZoningBase — Batch D1 Ingestion
 *
 * Reads all scraped SQL files from db/scraped/ and executes them
 * against the remote D1 database via wrangler.
 *
 * Usage:
 *   node scripts/scraper/ingest.mjs           # ingest all scraped files
 *   node scripts/scraper/ingest.mjs --local   # ingest to local D1 only
 *   node scripts/scraper/ingest.mjs --file texas-dallas.sql  # single file
 */

import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPED_DIR = join(__dirname, '..', '..', 'db', 'scraped');
const PROJECT_DIR = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const localOnly = args.includes('--local');
const singleFile = args.find((a, i) => args[i - 1] === '--file');

function ingestFile(filename, remote = true) {
  const filepath = join(SCRAPED_DIR, filename);
  const remoteFlag = remote ? '--remote' : '--local';

  console.log(`  [${remote ? 'remote' : 'local'}] ${filename}...`);

  try {
    const cmd = `npx wrangler d1 execute zoningbase-prod ${remoteFlag} --file="${filepath}"`;
    const output = execSync(cmd, {
      cwd: PROJECT_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    }).toString();

    // Extract stats
    const queriesMatch = output.match(/Executed (\d+) queries/);
    const rowsMatch = output.match(/(\d+) rows written/);
    if (queriesMatch) {
      console.log(`  [ok] ${queriesMatch[1]} queries, ${rowsMatch?.[1] || '?'} rows written`);
    } else {
      console.log(`  [ok] Executed successfully`);
    }
    return true;
  } catch (err) {
    console.error(`  [error] ${err.message.split('\n')[0]}`);
    return false;
  }
}

function main() {
  if (!existsSync(SCRAPED_DIR)) {
    console.error(`No scraped data found at ${SCRAPED_DIR}`);
    console.error('Run: node scripts/scraper/extract.mjs --all');
    process.exit(1);
  }

  const files = singleFile
    ? [singleFile]
    : readdirSync(SCRAPED_DIR).filter(f => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.log('No SQL files to ingest.');
    return;
  }

  console.log(`\n── Ingesting ${files.length} file(s) ${localOnly ? '(local)' : '(remote + local)'} ──\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    // Always ingest locally
    const localOk = ingestFile(file, false);

    // Also ingest remotely unless --local
    if (!localOnly) {
      const remoteOk = ingestFile(file, true);
      if (localOk && remoteOk) success++;
      else failed++;
    } else {
      if (localOk) success++;
      else failed++;
    }
  }

  console.log(`\n── Done: ${success} succeeded, ${failed} failed ──`);

  if (!localOnly && success > 0) {
    console.log('\nPages are live immediately (SSR) — no redeploy needed.');
    console.log('Verify at: https://zoningbase.pages.dev/');
  }
}

main();
