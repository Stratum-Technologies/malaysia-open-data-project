# Validation Rules

## Blocking
Schema-invalid records, duplicate IDs, invalid controlled values, malformed URLs, unresolved internal references, duplicate canonical endpoint URLs within conflicting resources, or failure to build normalized output.

## Warnings
Unknown licence, stale verification, redirects, endpoint timeouts/errors, missing frequency, suspected near-duplicate records, and non-preferred mirrors.

## URL normalization
Lowercase hostnames, remove default ports and known tracking parameters, preserve meaningful query parameters, follow canonical redirect analysis only in derived checks, and never rewrite canonical source records automatically.

## Link checking
Network failures are warnings by default. Use conservative concurrency, identify the checker, obey rate limits, and protect all server-side fetching against SSRF/private-network targets.
