/**
 * Catalogue validation. This is the check CI runs and the check a contributor should run
 * before opening a pull request.
 *
 *   npm run validate                      report problems, exit 1 on errors
 *   npm run validate -- --strict-export   also assert the committed exports are current
 *
 * Blocking: schema, duplicate ids, malformed URLs, unknown vocabulary, broken references,
 * duplicate primary endpoints, and anything that stops the catalogue building.
 * Non-blocking: unknown licence, stale verification, missing frequency, http-only
 * endpoints, suspected duplicates, and unreachable publishers. Government sites fall over
 * regularly and that must never invalidate an otherwise correct contribution.
 */

import { loadCatalogue } from '../lib/load.ts';

const { catalogue, problems } = loadCatalogue();

const errors = problems.filter((p) => p.level === 'error');
const warnings = problems.filter((p) => p.level === 'warning');

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):\n`);
  for (const problem of errors) console.error(`  ${problem.where}\n    ${problem.message}`);
}
if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s) — these do not block a contribution:\n`);
  for (const problem of warnings) console.warn(`  ${problem.where}\n    ${problem.message}`);
}

console.log(
  `\n${catalogue.resources.length} resources across ${catalogue.publishers.length} publishers. ` +
  `${errors.length} error(s), ${warnings.length} warning(s).`,
);

if (errors.length > 0) process.exit(1);

if (process.argv.includes('--strict-export')) {
  const { execFileSync } = await import('node:child_process');
  execFileSync('npx', ['tsx', 'scripts/build-exports.ts', '--check'], { stdio: 'inherit' });
}
