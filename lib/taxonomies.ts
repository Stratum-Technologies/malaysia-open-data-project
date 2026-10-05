/**
 * Loads the controlled vocabularies from `taxonomies/`.
 *
 * These files are the single source of truth for the vocabularies: validation rejects anything
 * outside them, and the UI renders their labels. Adding an endpoint type should be a data change
 * reviewed in a pull request, never a code change (DECISIONS.md D14).
 *
 * Build-time only: this module reads the filesystem at import. The Worker must never import it.
 * Pure vocabulary knowledge — labels, descriptions, derived sets — lives in `vocabulary.ts`,
 * which is safe anywhere.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { API_LIKE, MACHINE_READABLE } from './vocabulary.ts';
import { repoRoot } from './util.ts';

// Re-exported so callers that already import labels from here keep working.
export * from './vocabulary.ts';

export interface Taxonomies {
  accessTypes: string[];
  categories: string[];
  endpointTypes: string[];
  geographyGranularity: string[];
  publisherTypes: string[];
  updateFrequency: string[];
  /** Endpoint types counted as machine-readable data rather than prose or a view. */
  machineReadable: Set<string>;
  /** Endpoint types that represent a queryable interface. */
  apiLike: Set<string>;
}

const dir = join(repoRoot(), 'taxonomies');

function read(name: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
    throw new Error(`taxonomies/${name} must be a JSON array of strings`);
  }
  return parsed as string[];
}

export const taxonomies: Taxonomies = {
  accessTypes: read('access-types.json'),
  categories: read('categories.json'),
  endpointTypes: read('endpoint-types.json'),
  geographyGranularity: read('geography-granularity.json'),
  publisherTypes: read('publisher-types.json'),
  updateFrequency: read('update-frequency.json'),
  machineReadable: MACHINE_READABLE,
  apiLike: API_LIKE,
};
