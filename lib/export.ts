/**
 * Public exports. These are the downloadable artefacts and the API's data source.
 *
 * They describe the *directory*, not the datasets it points at (TSD §28). Every export
 * carries provenance — schema version, generation time, commit — so a citation or a
 * downstream analysis can say exactly which revision it came from.
 */

import type { Catalogue, CataloguePublisher, CatalogueResource } from './types.ts';

export const SCHEMA_VERSION = '1.0.0';

export interface Provenance {
  schema_version: string;
  generated_at: string;
  /** Commit the catalogue was built from, or "unknown" outside a git checkout. */
  commit: string;
  /** Where the canonical data lives, so a consumer can find the source of truth. */
  source: string;
}

export interface DirectoryExport extends Provenance {
  count: number;
  publishers_count: number;
  resources: ExportResource[];
  publishers: CataloguePublisher[];
}

/** What a consumer of the export gets. Flattened where it saves them a join. */
export interface ExportResource {
  id: string;
  name: string;
  aliases: string[];
  publisher: string;
  publisher_name: string;
  publisher_abbreviation?: string;
  publisher_type: string;
  description: string;
  categories: string[];
  tags: string[];
  access: {
    type: string;
    label: string;
    registration_required?: boolean;
    paid?: boolean;
    details?: string;
  };
  license?: CatalogueResource['license'];
  geography?: CatalogueResource['geography'];
  temporal?: CatalogueResource['temporal'];
  languages?: string[];
  endpoints: Array<{
    type: string;
    url: string;
    label?: string;
    documentation?: string;
    format?: string;
    auth?: string;
    notes?: string;
  }>;
  endpoint_types: string[];
  machine_readable: boolean;
  has_api: boolean;
  primary_url: string;
  resource_url: string;
  last_verified: string;
  verification: string;
  warnings: string[];
}

export function toExportResource(resource: CatalogueResource, siteOrigin: string): ExportResource {
  return {
    id: resource.id,
    name: resource.name,
    aliases: resource.aliases ?? [],
    publisher: resource.publisher,
    publisher_name: resource.publisherName,
    ...(resource.publisherAbbreviation ? { publisher_abbreviation: resource.publisherAbbreviation } : {}),
    publisher_type: resource.publisherType,
    description: resource.description,
    categories: resource.categories,
    tags: resource.tags ?? [],
    access: {
      type: resource.access.type,
      label: resource.accessLabel,
      ...(resource.access.registration_required !== undefined ? { registration_required: resource.access.registration_required } : {}),
      ...(resource.access.paid !== undefined ? { paid: resource.access.paid } : {}),
      ...(resource.access.details ? { details: resource.access.details } : {}),
    },
    ...(resource.license ? { license: resource.license } : {}),
    ...(resource.geography ? { geography: resource.geography } : {}),
    ...(resource.temporal ? { temporal: resource.temporal } : {}),
    ...(resource.languages ? { languages: resource.languages } : {}),
    endpoints: resource.endpoints.map((e) => ({
      type: e.type,
      url: e.url,
      ...(e.label ? { label: e.label } : {}),
      ...(e.documentation ? { documentation: e.documentation } : {}),
      ...(e.format ? { format: e.format } : {}),
      ...(e.auth ? { auth: e.auth } : {}),
      ...(e.notes ? { notes: e.notes } : {}),
    })),
    endpoint_types: resource.endpointTypes,
    machine_readable: resource.machineReadable,
    has_api: resource.hasApi,
    primary_url: resource.primaryUrl,
    resource_url: `${siteOrigin}/resources/${resource.id}`,
    last_verified: resource.last_verified,
    verification: resource.verification,
    warnings: resource.warnings,
  };
}

export function buildDirectory(
  catalogue: Catalogue,
  provenance: Provenance,
  siteOrigin: string,
): DirectoryExport {
  return {
    ...provenance,
    count: catalogue.resources.length,
    publishers_count: catalogue.publishers.length,
    resources: catalogue.resources.map((r) => toExportResource(r, siteOrigin)),
    publishers: catalogue.publishers,
  };
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

const CSV_COLUMNS = [
  'id', 'name', 'publisher_id', 'publisher_name', 'publisher_abbreviation', 'publisher_type',
  'description', 'categories', 'tags', 'access_type', 'access_label', 'registration_required',
  'paid', 'license_name', 'license_url', 'geography_coverage', 'geography_granularity',
  'temporal_start', 'temporal_end', 'temporal_frequency', 'endpoint_types', 'endpoint_count',
  'machine_readable', 'has_api', 'primary_url', 'last_verified', 'verification',
] as const;

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  // Quote when the value could break the row. Double quotes escape themselves.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(resources: readonly CatalogueResource[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of resources) {
    lines.push([
      r.id,
      r.name,
      r.publisher,
      r.publisherName,
      r.publisherAbbreviation ?? '',
      r.publisherType,
      r.description,
      r.categories.join('|'),
      (r.tags ?? []).join('|'),
      r.access.type,
      r.accessLabel,
      r.access.registration_required ?? '',
      r.access.paid ?? '',
      r.license?.name ?? '',
      r.license?.url ?? '',
      (r.geography?.coverage ?? []).join('|'),
      (r.geography?.granularity ?? []).join('|'),
      r.temporal?.start ?? '',
      r.temporal?.end ?? '',
      r.temporal?.frequency ?? '',
      r.endpointTypes.join('|'),
      r.endpoints.length,
      r.machineReadable,
      r.hasApi,
      r.primaryUrl,
      r.last_verified,
      r.verification,
    ].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------ *
 * Meta — the small file the site and API read for counts and provenance.
 * ------------------------------------------------------------------ */

export interface MetaExport extends Provenance {
  counts: {
    resources: number;
    publishers: number;
    categories: number;
    tags: number;
    endpoints: number;
  };
  exports: {
    json: string;
    csv: string;
    parquet: string | null;
  };
  /** Set when the build had warnings. Lets the site say "some records need attention". */
  warnings: number;
  errors: number;
}

export function buildMeta(
  catalogue: Catalogue,
  provenance: Provenance,
  problems: { level: 'error' | 'warning' }[],
): MetaExport {
  return {
    ...provenance,
    counts: {
      resources: catalogue.resources.length,
      publishers: catalogue.publishers.length,
      categories: catalogue.categories.filter((c) => c.resourceCount > 0).length,
      tags: catalogue.tags.length,
      endpoints: catalogue.resources.reduce((sum, r) => sum + r.endpoints.length, 0),
    },
    exports: {
      json: '/data/directory.json',
      csv: '/data/directory.csv',
      // Planned, not produced yet: it needs DuckDB and only pays off at a larger corpus.
      parquet: null,
    },
    warnings: problems.filter((p) => p.level === 'warning').length,
    errors: problems.filter((p) => p.level === 'error').length,
  };
}

/** Format bytes for the UI, so payload growth is visible to maintainers. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
