/**
 * Catalogue types. These mirror the JSON Schemas in `schemas/` exactly — the schemas
 * are the contract, this file is the ergonomic view of it. If they disagree, the
 * schema wins and this file is wrong.
 */

export type AccessType =
  | 'open' | 'public' | 'register' | 'request'
  | 'research' | 'paid' | 'restricted' | 'unknown';

export type EndpointAuth =
  | 'none' | 'api_key' | 'oauth' | 'account'
  | 'application' | 'institutional' | 'unknown';

export type PublisherType =
  | 'government' | 'statutory-body' | 'local-authority' | 'academic'
  | 'commercial' | 'ngo' | 'community' | 'international' | 'other';

export interface Endpoint {
  type: string;
  url: string;
  label?: string;
  documentation?: string;
  format?: string;
  mime_type?: string;
  auth?: EndpointAuth;
  notes?: string;
}

export interface ResourceAccess {
  type: AccessType;
  registration_required?: boolean;
  paid?: boolean;
  details?: string;
}

export interface ResourceLicense {
  name?: string;
  url?: string;
  verified?: boolean;
  notes?: string;
}

export interface Geography {
  coverage?: string[];
  granularity?: string[];
}

export interface Temporal {
  start?: number | string;
  end?: number | string | null;
  frequency?: string;
}

export interface Provenance {
  discovered_from?: string;
  external_id?: string;
  discovered_at?: string;
}

export interface Resource {
  id: string;
  name: string;
  aliases?: string[];
  publisher: string;
  description: string;
  categories: string[];
  tags?: string[];
  access: ResourceAccess;
  license?: ResourceLicense;
  geography?: Geography;
  temporal?: Temporal;
  languages?: string[];
  endpoints: Endpoint[];
  provenance?: Provenance;
  last_verified: string;
  notes?: string;
  related_resources?: string[];
  contributors?: string[];
}

export interface Publisher {
  id: string;
  name: string;
  abbreviation?: string;
  type: PublisherType;
  url?: string;
  description?: string;
  aliases?: string[];
  country?: string;
  languages?: string[];
  notes?: string;
}

/** The on-disk shape of one file in `data/<publisher-type>/<publisher-id>.yaml`. */
export interface PublisherFile {
  publisher: Publisher;
  resources: Resource[];
}

/* ------------------------------------------------------------------ *
 * Derived shapes. Never authored by hand; always produced by load.ts.
 * ------------------------------------------------------------------ */

export type VerificationState = 'fresh' | 'aging' | 'stale';

/** A resource with everything the UI and API need precomputed. */
export interface CatalogueResource extends Resource {
  /** Resolved publisher name, for display without a second lookup. */
  publisherName: string;
  publisherAbbreviation?: string;
  publisherType: PublisherType;
  /** Unique endpoint types, sorted. Drives "formats available" and filters. */
  endpointTypes: string[];
  /** True when at least one endpoint is a machine-readable format. */
  machineReadable: boolean;
  /** True when at least one endpoint is an api / arcgis-rest / wfs style interface. */
  hasApi: boolean;
  /** True when any endpoint requires credentials. */
  requiresAuth: boolean;
  /** Human label for the access type, e.g. "Registration required". */
  accessLabel: string;
  /** Best URL to send a user to first. */
  primaryUrl: string;
  /** Lowercased haystack used by search. Built once, at build time. */
  searchText: string;
  verification: VerificationState;
  /** Non-blocking observations, surfaced in the UI and the API. */
  warnings: string[];
}

/** A publisher with its resources attached. */
export interface CataloguePublisher extends Publisher {
  resourceCount: number;
  categories: string[];
  accessTypes: AccessType[];
  endpointTypes: string[];
}

export interface Catalogue {
  resources: CatalogueResource[];
  publishers: CataloguePublisher[];
  /** id -> resource */
  byId: Map<string, CatalogueResource>;
  /** publisher id -> publisher */
  publishersById: Map<string, CataloguePublisher>;
  categories: CategorySummary[];
  tags: TagSummary[];
}

export interface CategorySummary {
  id: string;
  label: string;
  resourceCount: number;
  publisherCount: number;
}

export interface TagSummary {
  id: string;
  label: string;
  resourceCount: number;
}

export interface Problem {
  level: 'error' | 'warning';
  /** Where it came from, e.g. "data/government/dosm.yaml#dosm-population". */
  where: string;
  message: string;
}

/** The compact shape shipped to the browser and used for search/filter. */
export interface SearchRecord {
  /** id */ i: string;
  /** name */ n: string;
  /** publisher id */ p: string;
  /** publisher name */ pn: string;
  /** publisher abbreviation */ pa?: string;
  /** access type */ a: AccessType;
  /** categories */ c: string[];
  /** endpoint types */ e: string[];
  /** geography coverage */ g: string[];
  /** tags */ t: string[];
  /** verification state */ v: VerificationState;
  /** lowercased search haystack */ x: string;
}
