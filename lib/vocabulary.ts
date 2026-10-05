/**
 * Vocabulary knowledge: labels, descriptions and the derived sets.
 *
 * Deliberately free of imports and free of filesystem access. This module is pulled into the
 * Worker bundle by the search page and the API, and the Worker has no filesystem — an earlier
 * version of the taxonomy loader read JSON at module scope, which made every request-time
 * route fail with a 500. Anything that needs to read `taxonomies/*.json` belongs in
 * `taxonomies.ts`, which is build-time only.
 */

/** Access labels. Public is public — it is never presented as an open licence. */
export const ACCESS_LABELS: Record<string, string> = {
  open: 'Open',
  public: 'Public',
  register: 'Registration required',
  request: 'Request',
  research: 'Research access',
  paid: 'Paid',
  restricted: 'Restricted',
  unknown: 'Access not verified',
};

/** One-line explanations, used in filter help text and the access legend. */
export const ACCESS_DESCRIPTIONS: Record<string, string> = {
  open: 'Downloadable by anyone, with a licence that permits reuse.',
  public: 'Viewable by anyone. Reuse may still be restricted.',
  register: 'Free to use, but you must create an account first.',
  request: 'You must ask the publisher for access.',
  research: 'Access is limited to approved research use.',
  paid: 'Available for a fee.',
  restricted: 'Eligibility or legal conditions limit who may access it.',
  unknown: 'The access conditions have not been verified yet.',
};

/** Endpoint labels, for chips and grouping. Short — these sit inside a result row. */
export const ENDPOINT_LABELS: Record<string, string> = {
  'api': 'API',
  'api-docs': 'API docs',
  'arcgis-rest': 'ArcGIS REST',
  'bulk-download': 'Bulk download',
  'catalogue': 'Catalogue',
  'commercial-access': 'Commercial access',
  'csv': 'CSV',
  'dashboard': 'Dashboard',
  'data-dump': 'Data dump',
  'explorer': 'Explorer',
  'geojson': 'GeoJSON',
  'geopackage': 'GeoPackage',
  'json': 'JSON',
  'jsonl': 'JSON Lines',
  'kml': 'KML',
  'landing-page': 'Landing page',
  'map': 'Map',
  'parquet': 'Parquet',
  'pdf': 'PDF',
  'publication': 'Publication',
  'registry': 'Registry',
  'report': 'Report',
  'request-form': 'Request form',
  'research-access': 'Research access',
  'search': 'Search',
  'shapefile': 'Shapefile',
  'sql-database': 'SQL database',
  'statistical-release': 'Statistical release',
  'tile-service': 'Tile service',
  'tsv': 'TSV',
  'wfs': 'WFS',
  'wms': 'WMS',
  'xls': 'XLS',
  'xlsx': 'XLSX',
  'xml': 'XML',
};

export function endpointLabel(type: string): string {
  return ENDPOINT_LABELS[type] ?? type.replace(/-/g, ' ');
}

/**
 * Machine-readable means "a program can consume this without scraping prose".
 * `dashboard`, `explorer`, `map` and `search` are interactive views — genuinely useful,
 * but not machine-readable, and conflating them would mislead API-seeking users.
 */
export const MACHINE_READABLE = new Set([
  'api', 'csv', 'tsv', 'xls', 'xlsx', 'json', 'jsonl', 'xml', 'parquet',
  'geojson', 'shapefile', 'geopackage', 'kml', 'wms', 'wfs', 'arcgis-rest',
  'sql-database', 'bulk-download', 'data-dump',
]);

/** Interfaces you can query rather than download. */
export const API_LIKE = new Set(['api', 'arcgis-rest', 'wfs', 'wms', 'tile-service', 'sql-database']);

/** Verification freshness thresholds, in days. Documented in VALIDATION.md. */
export const FRESH_DAYS = 180;
export const AGING_DAYS = 365;
