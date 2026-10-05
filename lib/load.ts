/**
 * Loads the canonical catalogue from `data/**\/*.yaml`, validates it, and produces the
 * derived shapes the site and API consume.
 *
 * Everything here is build-time. The output is plain data, so the Worker never reads
 * YAML and never needs to know the validation rules.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type {
  Catalogue, CataloguePublisher, CatalogueResource, Endpoint, Problem,
  Publisher, PublisherFile, Resource, VerificationState,
} from './types.ts';
import {
  ACCESS_LABELS, AGING_DAYS, FRESH_DAYS, endpointLabel, taxonomies,
} from './taxonomies.ts';
import { fold, humaniseTaxonomy, isHttpUrl, normaliseUrl, repoRoot, toDateString } from './util.ts';

const root = repoRoot();
export const DEFAULT_DATA_DIR = join(root, 'data');

export interface LoadOptions {
  dataDir?: string;
  /** Reference date for freshness. Injectable so tests are not time-dependent. */
  now?: Date;
}

export interface LoadResult {
  catalogue: Catalogue;
  problems: Problem[];
}

/* ------------------------------------------------------------------ *
 * Schema validation
 * ------------------------------------------------------------------ */

function loadSchema(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, 'schemas', name), 'utf8')) as Record<string, unknown>;
}

let resourceValidate: ValidateFunction | undefined;
let publisherValidate: ValidateFunction | undefined;

function validators(): { resource: ValidateFunction; publisher: ValidateFunction } {
  if (!resourceValidate || !publisherValidate) {
    // `strict: false` on purpose: the schemas are authored elsewhere and the real gate is
    // the semantic pass below, which is stricter than the schemas and lives in this repo.
    const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
    addFormats(ajv);
    resourceValidate = ajv.compile(loadSchema('resource.schema.json'));
    publisherValidate = ajv.compile(loadSchema('publisher.schema.json'));
  }
  return { resource: resourceValidate, publisher: publisherValidate };
}

const publisherTypes = new Set(taxonomies.publisherTypes);
const accessTypes = new Set(taxonomies.accessTypes);
const categoryIds = new Set(taxonomies.categories);
const endpointTypes = new Set(taxonomies.endpointTypes);
const granularityIds = new Set(taxonomies.geographyGranularity);
const frequencyIds = new Set(taxonomies.updateFrequency);

/* ------------------------------------------------------------------ *
 * Filesystem walk
 * ------------------------------------------------------------------ */

function yamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...yamlFiles(full));
    else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) out.push(full);
  }
  return out;
}

/** Fatal problems fail the build. Warnings are reported and shipped to the UI. */
export function hasErrors(problems: Problem[]): boolean {
  return problems.some((p) => p.level === 'error');
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

export function loadCatalogue(options: LoadOptions = {}): LoadResult {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const now = options.now ?? new Date();
  const problems: Problem[] = [];
  const { resource: validateResource, publisher: validatePublisher } = validators();

  const files: Array<{ path: string; relative: string; file: PublisherFile }> = [];

  for (const path of yamlFiles(dataDir)) {
    const relative = path.slice(root.length);
    let parsed: unknown;
    try {
      parsed = parseYaml(readFileSync(path, 'utf8'));
    } catch (error) {
      problems.push({ level: 'error', where: relative, message: `YAML did not parse: ${(error as Error).message}` });
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      problems.push({ level: 'error', where: relative, message: 'Expected a mapping with `publisher` and `resources`.' });
      continue;
    }
    const candidate = parsed as PublisherFile;

    if (!candidate.publisher) {
      problems.push({ level: 'error', where: relative, message: 'Missing `publisher` block.' });
      continue;
    }
    if (!validatePublisher(candidate.publisher)) {
      for (const err of validatePublisher.errors ?? []) {
        problems.push({ level: 'error', where: `${relative}#publisher${err.instancePath}`, message: err.message ?? 'invalid' });
      }
    }
    if (!Array.isArray(candidate.resources) || candidate.resources.length === 0) {
      problems.push({ level: 'error', where: relative, message: '`resources` must be a non-empty list.' });
      continue;
    }

    const resources: Resource[] = [];
    for (let index = 0; index < candidate.resources.length; index += 1) {
      const resource = candidate.resources[index] as Resource;
      const where = `${relative}#${resource?.id ?? `index-${index}`}`;
      // Normalise YAML date resolution before validating.
      if (resource && typeof resource === 'object') {
        (resource as { last_verified: unknown }).last_verified = toDateString(resource.last_verified);
        if (resource.provenance?.discovered_at) {
          (resource.provenance as { discovered_at: unknown }).discovered_at = String(resource.provenance.discovered_at);
        }
      }
      if (!validateResource(resource)) {
        for (const err of validateResource.errors ?? []) {
          problems.push({ level: 'error', where: `${where}${err.instancePath}`, message: err.message ?? 'invalid' });
        }
        continue;
      }
      resources.push(resource);
    }

    files.push({ path, relative, file: { publisher: candidate.publisher, resources } });
  }

  if (files.length === 0) {
    problems.push({ level: 'error', where: dataDir, message: 'No catalogue files found under data/.' });
  }

  /* ---- publishers: merge files, enforce identity consistency ---- */
  const publishersById = new Map<string, { publisher: Publisher; sources: string[] }>();
  for (const { relative, file } of files) {
    const { publisher } = file;
    if (!publisherTypes.has(publisher.type)) {
      problems.push({ level: 'error', where: `${relative}#publisher.type`, message: `Unknown publisher type "${publisher.type}".` });
    }
    // The directory name must match the publisher type, so layout can be trusted.
    const dirType = relative.split('/').slice(0, -1).pop() ?? '';
    if (dirType !== publisher.type) {
      problems.push({
        level: 'error',
        where: `${relative}#publisher.type`,
        message: `Publisher type "${publisher.type}" must match its directory "${dirType}".`,
      });
    }
    const existing = publishersById.get(publisher.id);
    if (!existing) {
      publishersById.set(publisher.id, { publisher, sources: [relative] });
    } else {
      existing.sources.push(relative);
      if (existing.publisher.name !== publisher.name || existing.publisher.type !== publisher.type) {
        problems.push({
          level: 'error',
          where: `${relative}#publisher`,
          message: `Publisher "${publisher.id}" is declared with a different name or type in ${existing.sources[0]}.`,
        });
      }
    }
  }

  /* ---- resources: semantic checks ---- */
  const seenIds = new Map<string, string>();
  const primaryUrlOwners = new Map<string, string>();
  const normalisedNames = new Map<string, string>();
  const resources: CatalogueResource[] = [];

  for (const { relative, file } of files) {
    for (const resource of file.resources) {
      const where = `${relative}#${resource.id}`;

      if (seenIds.has(resource.id)) {
        problems.push({ level: 'error', where, message: `Duplicate resource id, also defined in ${seenIds.get(resource.id)}.` });
        continue;
      }
      seenIds.set(resource.id, where);

      const publisherEntry = publishersById.get(resource.publisher);
      if (!publisherEntry) {
        problems.push({ level: 'error', where, message: `Unknown publisher reference "${resource.publisher}".` });
        continue;
      }

      validateResourceFields(resource, where, problems, now);

      // Duplicate canonical URLs across *different* resources defeat the "one logical
      // resource, many endpoints" rule, so they are an error rather than a warning.
      const primary = primaryEndpoint(resource.endpoints);
      const primaryKey = normaliseUrl(primary.url);
      if (primaryKey) {
        const owner = primaryUrlOwners.get(primaryKey);
        if (owner && owner !== resource.id) {
          problems.push({
            level: 'error',
            where,
            message: `Endpoint URL ${primary.url} is already the primary endpoint of "${owner}". Merge them into one resource with multiple endpoints.`,
          });
        } else {
          primaryUrlOwners.set(primaryKey, resource.id);
        }
      }

      const nameKey = `${resource.publisher}::${fold(resource.name)}`;
      const twin = normalisedNames.get(nameKey);
      if (twin && twin !== resource.id) {
        problems.push({ level: 'warning', where, message: `Possible near-duplicate of "${twin}": same publisher and name.` });
      } else {
        normalisedNames.set(nameKey, resource.id);
      }

      resources.push(normalise(resource, publisherEntry.publisher, now, where, problems));
    }
  }

  /* ---- internal references ---- */
  const allIds = new Set(resources.map((r) => r.id));
  for (const resource of resources) {
    for (const related of resource.related_resources ?? []) {
      if (!allIds.has(related)) {
        problems.push({ level: 'error', where: `${resource.id}#related_resources`, message: `Reference to unknown resource "${related}".` });
      }
    }
  }

  resources.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  /* ---- derived collections ---- */
  const byId = new Map(resources.map((r) => [r.id, r]));
  const publishers: CataloguePublisher[] = [...publishersById.values()]
    .map(({ publisher }) => {
      const owned = resources.filter((r) => r.publisher === publisher.id);
      return {
        ...publisher,
        resourceCount: owned.length,
        categories: [...new Set(owned.flatMap((r) => r.categories))].sort(),
        accessTypes: [...new Set(owned.map((r) => r.access.type))].sort() as CataloguePublisher['accessTypes'],
        endpointTypes: [...new Set(owned.flatMap((r) => r.endpointTypes))].sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const categories = taxonomies.categories.map((id) => {
    const owned = resources.filter((r) => r.categories.includes(id));
    return {
      id,
      label: humaniseTaxonomy(id),
      resourceCount: owned.length,
      publisherCount: new Set(owned.map((r) => r.publisher)).size,
    };
  });

  const tagCounts = new Map<string, number>();
  for (const resource of resources) {
    for (const tag of resource.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const tags = [...tagCounts.entries()]
    .map(([id, resourceCount]) => ({ id, label: humaniseTaxonomy(id), resourceCount }))
    .sort((a, b) => b.resourceCount - a.resourceCount || a.id.localeCompare(b.id));

  return {
    catalogue: { resources, publishers, byId, publishersById: new Map(publishers.map((p) => [p.id, p])), categories, tags },
    problems,
  };
}

/* ------------------------------------------------------------------ *
 * Field-level checks
 * ------------------------------------------------------------------ */

function validateResourceFields(resource: Resource, where: string, problems: Problem[], now: Date): void {
  for (const category of resource.categories) {
    if (!categoryIds.has(category)) {
      problems.push({ level: 'error', where: `${where}#categories`, message: `Unknown category "${category}".` });
    }
  }
  if (!accessTypes.has(resource.access.type)) {
    problems.push({ level: 'error', where: `${where}#access.type`, message: `Unknown access type "${resource.access.type}".` });
  }
  for (const [index, endpoint] of resource.endpoints.entries()) {
    const at = `${where}#endpoints[${index}]`;
    if (!endpointTypes.has(endpoint.type)) {
      problems.push({ level: 'error', where: at, message: `Unknown endpoint type "${endpoint.type}".` });
    }
    if (!isHttpUrl(endpoint.url)) {
      problems.push({ level: 'error', where: at, message: `Endpoint URL must be absolute http(s): "${endpoint.url}".` });
    } else if (!endpoint.url.startsWith('https://')) {
      problems.push({ level: 'warning', where: at, message: 'Endpoint is not served over HTTPS.' });
    }
    if (endpoint.documentation && !isHttpUrl(endpoint.documentation)) {
      problems.push({ level: 'error', where: at, message: 'Endpoint documentation must be an absolute http(s) URL.' });
    }
  }
  for (const granularity of resource.geography?.granularity ?? []) {
    if (!granularityIds.has(granularity)) {
      problems.push({ level: 'error', where: `${where}#geography.granularity`, message: `Unknown granularity "${granularity}".` });
    }
  }
  const frequency = resource.temporal?.frequency;
  if (frequency && !frequencyIds.has(frequency)) {
    problems.push({ level: 'error', where: `${where}#temporal.frequency`, message: `Unknown update frequency "${frequency}".` });
  }

  /* Warnings — never block a contribution (brief §24). */
  if (!frequency) {
    problems.push({ level: 'warning', where: `${where}#temporal.frequency`, message: 'Update frequency is not recorded.' });
  }
  if (!resource.license?.name) {
    problems.push({ level: 'warning', where: `${where}#license`, message: 'Licence is not recorded. Do not infer it from public access.' });
  }
  if (!(resource.geography?.granularity ?? []).length) {
    problems.push({ level: 'warning', where: `${where}#geography.granularity`, message: 'Geographic granularity is not recorded.' });
  }
  const verified = new Date(`${resource.last_verified}T00:00:00Z`);
  if (Number.isNaN(verified.getTime())) {
    problems.push({ level: 'error', where: `${where}#last_verified`, message: `"${resource.last_verified}" is not a date.` });
  } else if (verified.getTime() > now.getTime()) {
    problems.push({ level: 'error', where: `${where}#last_verified`, message: 'Verification date is in the future.' });
  }
}

/** The endpoint a user should be sent to first, and the one used for duplicate detection. */
export function primaryEndpoint(endpoints: Endpoint[]): Endpoint {
  const order = ['landing-page', 'catalogue', 'api-docs', 'api', 'dashboard', 'explorer', 'search', 'registry'];
  for (const type of order) {
    const match = endpoints.find((e) => e.type === type);
    if (match) return match;
  }
  return endpoints[0] as Endpoint;
}

function verificationOf(lastVerified: string, now: Date): VerificationState {
  const then = new Date(`${lastVerified}T00:00:00Z`).getTime();
  const days = (now.getTime() - then) / 86_400_000;
  if (days <= FRESH_DAYS) return 'fresh';
  if (days <= AGING_DAYS) return 'aging';
  return 'stale';
}

function normalise(
  resource: Resource,
  publisher: Publisher,
  now: Date,
  where: string,
  problems: Problem[],
): CatalogueResource {
  const endpointTypesSorted = [...new Set(resource.endpoints.map((e) => e.type))].sort();
  const primary = primaryEndpoint(resource.endpoints);
  const machineReadable = endpointTypesSorted.some((t) => taxonomies.machineReadable.has(t));
  const hasApi = endpointTypesSorted.some((t) => taxonomies.apiLike.has(t));
  const requiresAuth = resource.endpoints.some((e) => e.auth && e.auth !== 'none');
  const verification = verificationOf(resource.last_verified, now);

  if (verification === 'stale') {
    problems.push({ level: 'warning', where, message: `Last verified ${resource.last_verified}: over a year ago.` });
  } else if (verification === 'aging') {
    problems.push({ level: 'warning', where, message: `Last verified ${resource.last_verified}: worth re-checking.` });
  }

  // The haystack is built here, once, so the browser and the API never re-derive it.
  const searchText = fold([
    resource.name,
    ...(resource.aliases ?? []),
    publisher.name,
    publisher.abbreviation ?? '',
    ...(publisher.aliases ?? []),
    resource.publisher,
    resource.description,
    ...resource.categories,
    ...(resource.tags ?? []),
    ...endpointTypesSorted.map(endpointLabel),
    ...endpointTypesSorted,
    ...(resource.geography?.coverage ?? []),
    ...(resource.geography?.granularity ?? []),
  ].join(' '));

  return {
    ...resource,
    publisherName: publisher.name,
    publisherAbbreviation: publisher.abbreviation,
    publisherType: publisher.type,
    endpointTypes: endpointTypesSorted,
    machineReadable,
    hasApi,
    requiresAuth,
    accessLabel: ACCESS_LABELS[resource.access.type] ?? resource.access.type,
    primaryUrl: primary.url,
    searchText,
    verification,
    warnings: problems.filter((p) => p.level === 'warning' && p.where.startsWith(where)).map((p) => p.message),
  };
}
