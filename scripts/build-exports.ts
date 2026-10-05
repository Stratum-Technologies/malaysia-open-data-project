/**
 * Builds the catalogue exports from `data/**`.
 *
 *   npm run catalogue            write the exports
 *   npm run catalogue -- --check verify the committed exports are current (CI)
 *
 * `--check` exists so the committed exports cannot silently drift from the YAML that produced
 * them. If they differ the build fails and a human regenerates them.
 *
 * `generated/` is this repository's interface to everything downstream. Nothing here reads it
 * back: the YAML under `data/` is the source, these files are the product.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogue, hasErrors } from '../lib/load.ts';
import { buildCsv, buildDirectory, SCHEMA_VERSION } from '../lib/export.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = join(root, 'generated');
const check = process.argv.includes('--check');

/** Where a consumer can render an individual resource, recorded as `resource_url`. */
const SITE_ORIGIN = 'https://data.stratum.my';

/** This repository, recorded in the exports so a copy can be traced to where it came from. */
const SOURCE = 'https://github.com/minimalviability/malaysia-data';

/**
 * Provenance for the exports: the commit that last changed `data/`, not HEAD.
 *
 * These files describe the records, so they must not change when something unrelated is
 * committed. Deriving them from HEAD would rewrite every export on every commit to the
 * repository and leave a dirty tree after any rebuild. Read from `data/`'s history, a rebuild
 * after a commit that did not touch the records is byte-identical.
 *
 * Outside a git checkout both fields are empty rather than invented.
 */
function dataProvenance(): { commit: string; generated_at: string } {
  try {
    const [commit = '', timestamp = ''] = execFileSync(
      'git',
      ['log', '-1', '--format=%H%n%cI', '--', 'data'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .trim()
      .split('\n');
    return { commit: commit || 'unknown', generated_at: timestamp };
  } catch {
    return { commit: 'unknown', generated_at: '' };
  }
}

const sha256 = (contents: string): string => createHash('sha256').update(contents).digest('hex');

const started = Date.now();
const { catalogue, problems } = loadCatalogue();

const errors = problems.filter((p) => p.level === 'error');
const warnings = problems.filter((p) => p.level === 'warning');

for (const problem of errors) console.error(`  error   ${problem.where}: ${problem.message}`);
for (const problem of warnings) console.warn(`  warning ${problem.where}: ${problem.message}`);

if (hasErrors(problems)) {
  console.error(`\nCatalogue build failed: ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(1);
}

const { commit, generated_at } = dataProvenance();

const provenance = {
  schema_version: SCHEMA_VERSION,
  generated_at,
  commit,
  source: SOURCE,
};

/**
 * Provenance fields that change on every rebuild.
 *
 * They are excluded from the drift comparison and from the integrity hashes: they describe the
 * build, not the data, so including them would make `--check` fail on a correct tree.
 */
const VOLATILE_PROVENANCE = ['generated_at', 'commit'];

const files: Array<{ name: string; contents: string }> = [
  {
    // The whole catalogue in one file, including the vocabularies and every derived field.
    // This is what a consumer loads instead of parsing the YAML.
    name: 'catalogue.json',
    contents: `${JSON.stringify(
      {
        ...provenance,
        resources: catalogue.resources,
        publishers: catalogue.publishers,
        categories: catalogue.categories,
        tags: catalogue.tags,
      },
      null,
      0,
    )}\n`,
  },
  {
    // The flat, read-optimised export: one record per resource, no vocabularies.
    name: 'directory.json',
    contents: `${JSON.stringify(buildDirectory(catalogue, provenance, SITE_ORIGIN), null, 2)}\n`,
  },
  { name: 'directory.csv', contents: buildCsv(catalogue.resources) },
  {
    // The interface a consumer checks first: which schema version, built from which commit.
    name: 'contract.json',
    contents: `${JSON.stringify(
      {
        schema_version: SCHEMA_VERSION,
        generated_at: provenance.generated_at,
        commit: provenance.commit,
        source: SOURCE,
        checksums: 'checksums.json',
        // This repository validates its own records, so it publishes how many problems it
        // found. A consumer that displays those counts should read them here rather than
        // re-validating records it does not own.
        problems: {
          errors: problems.filter((p) => p.level === 'error').length,
          warnings: problems.filter((p) => p.level === 'warning').length,
        },
      },
      null,
      2,
    )}\n`,
  },
];

// The integrity manifest covers the payload files, and is added last because it cannot cover
// itself. Authenticity comes from the commit a consumer pins; this only proves the bytes of
// that commit arrived intact.
//
// Hashes are taken over `comparable` content: `generated_at` and `commit` change on every
// rebuild and are provenance, not data, so hashing them raw would make this file different
// every time and `--check` could never pass. The reader is told exactly what was normalised.
files.push({
  name: 'checksums.json',
  contents: `${JSON.stringify(
    {
      algorithm: 'sha256',
      normalised: VOLATILE_PROVENANCE,
      files: Object.fromEntries(
        files.map((file) => [file.name, sha256(comparable(file.name, file.contents))]),
      ),
    },
    null,
    2,
  )}\n`,
});

/**
 * Comparison form for the drift check.
 *
 * `generated_at` and `commit` are provenance, not content. They cannot be compared
 * byte-for-byte against a committed file: the commit SHA in the exports is by definition the
 * commit *before* the one that adds them. Their presence is asserted elsewhere; here we only
 * care that the catalogue content matches the YAML.
 */
function comparable(name: string, contents: string): string {
  if (!name.endsWith('.json')) return contents;
  try {
    const parsed: unknown = JSON.parse(contents);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = { ...(parsed as Record<string, unknown>) };
      for (const key of VOLATILE_PROVENANCE) delete record[key];
      return JSON.stringify(record);
    }
    return JSON.stringify(parsed);
  } catch {
    return contents;
  }
}

if (check) {
  const drifted: string[] = [];
  for (const file of files) {
    const path = join(outDir, file.name);
    if (!existsSync(path)) {
      drifted.push(file.name);
      continue;
    }
    if (comparable(file.name, readFileSync(path, 'utf8')) !== comparable(file.name, file.contents)) {
      drifted.push(file.name);
    }
  }
  if (drifted.length > 0) {
    console.error(`\nCommitted exports are out of date: ${drifted.join(', ')}.`);
    console.error('Run `npm run catalogue` and commit the result.');
    process.exit(1);
  }
  console.log('Exports are current.');
} else {
  mkdirSync(outDir, { recursive: true });
  for (const file of files) writeFileSync(join(outDir, file.name), file.contents);
  console.log(
    `Wrote ${files.length} files: ${catalogue.resources.length} resources, ` +
    `${catalogue.publishers.length} publishers, ${warnings.length} warning(s) in ${Date.now() - started} ms.`,
  );
}
