/**
 * Endpoint health check. Deliberately NOT part of the normal build or CI: it makes
 * outbound requests to third parties, which is a thing you do on purpose, on a schedule,
 * with a report you read — not on every commit.
 *
 *   npm run check:links                 check everything, write reports/endpoint-health.json
 *   npm run check:links -- --limit 20   sample, for a quick look
 *
 * Every request is SSRF-guarded before it is sent and again after every redirect. A URL
 * that resolves to a private, loopback, link-local or metadata address is refused rather
 * than fetched (VALIDATION.md, TSD §20).
 */

import { lookup } from 'node:dns/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalogue } from '../lib/load.ts';
import { isBlockedHostname, isBlockedIp, normaliseUrl } from '../lib/util.ts';

export type Health = 'ok' | 'redirect' | 'client_error' | 'server_error' | 'timeout' | 'dns_error' | 'blocked' | 'unknown';

export interface EndpointHealth {
  url: string;
  resourceId: string;
  status: Health;
  httpStatus?: number;
  finalUrl?: string;
  detail?: string;
  checkedAt: string;
}

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 5;
const USER_AGENT =
  'MalaysiaDataDirectory-LinkChecker/1.0 (+https://github.com/Stratum-Technologies/malaysia-open-data-project; endpoint health, contact via repository issues)';

/** Resolve a hostname and refuse anything that is not a public address. */
async function assertPublic(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error(`refusing non-public host "${hostname}"`);
  }
  const results = await lookup(hostname, { all: true, verbatim: true });
  if (results.length === 0) throw new Error(`could not resolve "${hostname}"`);
  for (const { address } of results) {
    if (isBlockedIp(address)) {
      throw new Error(`refusing "${hostname}" which resolves to non-public address ${address}`);
    }
  }
}

async function checkOne(url: string, resourceId: string): Promise<EndpointHealth> {
  const checkedAt = new Date().toISOString();
  let current = url;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = new URL(current);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { url, resourceId, status: 'blocked', detail: `refusing scheme ${parsed.protocol}`, checkedAt };
      }
      await assertPublic(parsed.hostname);

      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, range: 'bytes=0-2048' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { url, resourceId, status: 'unknown', httpStatus: response.status, detail: 'redirect without Location', checkedAt };
        }
        current = new URL(location, current).toString();
        continue;
      }

      const status: Health =
        response.status < 400 ? (hop > 0 ? 'redirect' : 'ok')
        : response.status < 500 ? 'client_error'
        : 'server_error';

      return {
        url,
        resourceId,
        status,
        httpStatus: response.status,
        ...(current !== url ? { finalUrl: current } : {}),
        checkedAt,
      };
    }
    return { url, resourceId, status: 'redirect', detail: `more than ${MAX_REDIRECTS} redirects`, checkedAt };
  } catch (error) {
    const message = (error as Error).message;
    const name = (error as Error).name;
    if (/refusing|scheme/.test(message)) return { url, resourceId, status: 'blocked', detail: message, checkedAt };
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|could not resolve/.test(message)) return { url, resourceId, status: 'dns_error', detail: message, checkedAt };
    if (name === 'TimeoutError' || name === 'AbortError') return { url, resourceId, status: 'timeout', checkedAt };
    return { url, resourceId, status: 'unknown', detail: message, checkedAt };
  }
}

const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(args[limitIndex + 1]) : Infinity;

const { catalogue } = loadCatalogue();

/** One row per distinct endpoint URL — the same CSV download shared by two resources is one check. */
const targets = new Map<string, string>();
for (const resource of catalogue.resources) {
  for (const endpoint of resource.endpoints) {
    const key = normaliseUrl(endpoint.url) ?? endpoint.url;
    if (!targets.has(key)) targets.set(key, resource.id);
  }
}

const queue = [...targets.entries()].slice(0, Number.isFinite(limit) ? limit : undefined);
console.log(`Checking ${queue.length} endpoint(s) with concurrency ${CONCURRENCY}…\n`);

const results: EndpointHealth[] = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (cursor < queue.length) {
      const [url, resourceId] = queue[cursor++] as [string, string];
      const result = await checkOne(url, resourceId);
      results.push(result);
      const mark = result.status === 'ok' ? 'ok     ' : result.status.padEnd(7);
      console.log(`  ${mark} ${result.httpStatus ?? '---'} ${url}${result.detail ? `  (${result.detail})` : ''}`);
    }
  }),
);

results.sort((a, b) => a.status.localeCompare(b.status) || a.url.localeCompare(b.url));

const tally = results.reduce<Record<string, number>>((acc, r) => {
  acc[r.status] = (acc[r.status] ?? 0) + 1;
  return acc;
}, {});

const report = {
  generated_at: new Date().toISOString(),
  checked: results.length,
  tally,
  results,
};

const outDir = join(fileURLToPath(new URL('../', import.meta.url)), 'reports');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'endpoint-health.json');
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n${JSON.stringify(tally)}`);
console.log(`Report written to ${outPath}`);
// Health problems are warnings, never a build failure (VALIDATION.md).
process.exit(0);
