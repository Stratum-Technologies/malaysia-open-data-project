/**
 * Small shared helpers. Deliberately hand-rolled: each one is a few lines and a
 * dependency would be larger than the code it replaces.
 */

import { isIP } from 'node:net';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Repository root, for locating `schemas/`, `taxonomies/` and `data/`.
 *
 * Prefer the working directory: that is correct for `npm run`, tsx scripts and Astro's
 * prerender pass, and it survives being bundled into `dist/` (where `import.meta.url`
 * points at a chunk rather than at the source tree). The `import.meta.url` fallback keeps
 * the module usable if someone imports it from an unusual place.
 *
 * Contract: commands are run from the repository root. Documented in the README.
 */
export function repoRoot(): string {
  try {
    const cwd = process.cwd();
    if (cwd && existsSync(join(cwd, 'schemas'))) return cwd;
  } catch {
    // Not a Node-like runtime; fall through.
  }
  return fileURLToPath(new URL('../', import.meta.url));
}

/** Collapse whitespace, lowercase, strip diacritics. Used for every text match. */
export function fold(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Turn a title into a stable slug: "Population by State" -> "population-by-state". */
export function slugify(input: string): string {
  return fold(input).replace(/ /g, '-').replace(/^-+|-+$/g, '');
}

/** Title-case a taxonomy id: "prices-cost-of-living" -> "Prices & cost of living". */
export function humaniseTaxonomy(id: string): string {
  const text = id.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Normalise a URL for comparison only.
 * Follows the VALIDATION.md rules: lowercase host, drop default ports, drop known
 * tracking parameters, keep meaningful query parameters, keep the path.
 * Never used to rewrite a canonical record — only to compare and deduplicate.
 */
const TRACKING = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref', 'source',
]);

export function normaliseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Only http(s) is a catalogue URL. Without this, `javascript:` and `data:` parse happily
  // and would be treated as valid and "already normalised".
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hostname = url.hostname.toLowerCase();
  url.hash = '';
  if ((url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  let out = url.toString();
  if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1);
  return out;
}

/** True for http(s) only. Everything else — javascript:, data:, file:, vbscript: — is rejected. */
export function isHttpUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Display host, for provenance lines. */
export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* ---------------------------------------------------------------- *
 * SSRF guard. Used by the endpoint checker before any request and
 * again for every redirect hop.
 * ---------------------------------------------------------------- */

const BLOCKED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'metadata', 'metadata.google.internal',
  'instance-data', 'kubernetes.default',
]);

/** True when an IP literal is loopback, private, link-local, CGNAT, multicast or reserved. */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a = 0, b = 0] = parts;
    if (a === 0 || a === 10 || a === 127) return true;             // this-host, private, loopback
    if (a === 100 && b >= 64 && b <= 127) return true;             // CGNAT 100.64/10
    if (a === 169 && b === 254) return true;                       // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;              // private
    if (a === 192 && b === 168) return true;                       // private
    if (a === 192 && b === 0) return true;                         // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true;          // benchmarking
    if (a >= 224) return true;                                     // multicast + reserved + broadcast
    return false;
  }
  if (version === 6) {
    const addr = ip.toLowerCase();
    if (addr === '::' || addr === '::1') return true;
    if (addr.startsWith('fe80') || addr.startsWith('fec0')) return true;  // link-local / site-local
    if (addr.startsWith('fc') || addr.startsWith('fd')) return true;      // unique local
    if (addr.startsWith('ff')) return true;                               // multicast
    // IPv4-mapped, e.g. ::ffff:127.0.0.1
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isBlockedIp(mapped[1]);
    return false;
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (isIP(host) && isBlockedIp(host)) return true;
  return false;
}

/** Turn a value that might be a Date (some YAML parsers resolve dates) into an ISO date string. */
export function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
