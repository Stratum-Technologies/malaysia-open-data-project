/**
 * Exports and reproducibility.
 *
 * The exports are the product's public API for machines, so they get tested like one: stable
 * shape, correct escaping, provenance present, and identical to what is committed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { loadCatalogue } from '../lib/load.ts';
import {
  SCHEMA_VERSION,
  buildCsv,
  buildDirectory,
  buildMeta,
  toExportResource,
} from '../lib/export.ts';
import { repoRoot } from '../lib/util.ts';

const { catalogue, problems } = loadCatalogue({ now: new Date('2026-10-04T00:00:00Z') });
const provenance = {
  schema_version: SCHEMA_VERSION,
  generated_at: '2026-10-04T00:00:00.000Z',
  commit: 'test',
  source: 'https://github.com/minimalviability/malaysia-data',
};

/** Minimal RFC 4180 reader — enough to prove the writer quotes and escapes correctly. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

test('every export carries provenance', () => {
  const directory = buildDirectory(catalogue, provenance, 'https://data.stratum.my');
  assert.equal(directory.schema_version, SCHEMA_VERSION);
  assert.equal(directory.generated_at, provenance.generated_at);
  assert.equal(directory.commit, 'test');
  assert.equal(directory.source, provenance.source);
  assert.equal(directory.count, catalogue.resources.length);

  const meta = buildMeta(catalogue, provenance, problems);
  assert.equal(meta.schema_version, SCHEMA_VERSION);
  assert.equal(meta.commit, 'test');
  assert.equal(meta.counts.resources, catalogue.resources.length);
});

test('the CSV round-trips through a real parser with consistent columns', () => {
  const rows = parseCsv(buildCsv(catalogue.resources));
  const header = rows[0];
  assert.ok(header, 'expected a header row');
  assert.equal(header.length, rows[1]?.length, 'row 1 has a different field count to the header');
  for (const row of rows.slice(1)) {
    assert.equal(row.length, header.length, `ragged row: ${JSON.stringify(row.slice(0, 3))}`);
  }
  assert.equal(rows.length - 1, catalogue.resources.length, 'one row per resource');
});

test('CSV escaping survives commas, quotes and newlines', () => {
  const tricky = {
    ...catalogue.resources[0]!,
    description: 'Contains, a comma and "quotes" and\na newline.',
  };
  const rows = parseCsv(buildCsv([tricky]));
  const header = rows[0]!;
  const index = header.indexOf('description');
  assert.ok(index >= 0, 'description column missing');
  assert.equal(rows[1]?.[index], 'Contains, a comma and "quotes" and\na newline.');
});

test('exported resources carry a canonical resource URL', () => {
  const exported = toExportResource(catalogue.resources[0]!, 'https://data.stratum.my');
  assert.equal(exported.resource_url, `https://data.stratum.my/resources/${catalogue.resources[0]!.id}`);
});

test('the committed exports match the catalogue in the repository', () => {
  const path = join(repoRoot(), 'generated', 'catalogue.json');
  assert.ok(existsSync(path), 'generated/catalogue.json is missing — run `npm run catalogue`');
  const committed = JSON.parse(readFileSync(path, 'utf8')) as { resources: unknown[]; source: string };
  assert.equal(
    committed.resources.length,
    catalogue.resources.length,
    'committed exports are out of date — run `npm run catalogue` and commit',
  );
  assert.ok(committed.source.includes('malaysia-data'), 'provenance must name this repository');
});
