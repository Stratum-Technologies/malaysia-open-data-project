/**
 * URL and SSRF helpers. These are security-relevant, so they get explicit tests rather than
 * being assumed correct.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hostOf,
  isBlockedHostname,
  isBlockedIp,
  isHttpUrl,
  normaliseUrl,
  slugify,
  fold,
  toDateString,
} from '../lib/util.ts';

test('loopback, private, link-local and metadata addresses are blocked', () => {
  const blocked = [
    '127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.31.255.254', '192.168.0.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',      // carrier-grade NAT
    '198.18.0.1',
    '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1',
    '::ffff:127.0.0.1',
  ];
  for (const ip of blocked) {
    assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`);
  }
});

test('public addresses are not blocked', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '203.115.1.1', '2001:4860:4860::8888']) {
    assert.equal(isBlockedIp(ip), false, `${ip} should be allowed`);
  }
});

test('internal hostnames are blocked', () => {
  for (const host of ['localhost', 'LOCALHOST', 'localhost.', 'metadata.google.internal', 'api.internal', 'thing.local']) {
    assert.equal(isBlockedHostname(host), true, `${host} should be blocked`);
  }
});

test('ordinary hostnames are allowed', () => {
  for (const host of ['data.gov.my', 'api.data.gov.my', 'www.dosm.gov.my']) {
    assert.equal(isBlockedHostname(host), false, `${host} should be allowed`);
  }
});

test('an IP literal as a hostname is checked as an IP', () => {
  assert.equal(isBlockedHostname('169.254.169.254'), true);
  assert.equal(isBlockedHostname('8.8.8.8'), false);
});

test('only http(s) urls are accepted', () => {
  assert.equal(isHttpUrl('https://data.gov.my/'), true);
  assert.equal(isHttpUrl('http://data.gov.my/'), true);
  for (const bad of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd', 'mailto:a@b.c', 'ftp://x.y/z', 'not a url']) {
    assert.equal(isHttpUrl(bad), false, `${bad} should be rejected`);
  }
});

test('normalisation lowercases the host and drops default ports and tracking params', () => {
  assert.equal(normaliseUrl('HTTPS://Data.Gov.My:443/a/?utm_source=x&utm_medium=y&page=2'), 'https://data.gov.my/a/?page=2');
  assert.equal(normaliseUrl('http://data.gov.my:80/a'), 'http://data.gov.my/a');
});

test('normalisation preserves meaningful query parameters and order', () => {
  assert.equal(normaliseUrl('https://api.data.gov.my/data-catalogue?id=population_state'), 'https://api.data.gov.my/data-catalogue?id=population_state');
});

test('normalisation returns null for anything unusable', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url', '']) {
    assert.equal(normaliseUrl(bad), null, `${bad} should not normalise`);
  }
});

test('hostOf extracts the hostname, or empty string when there is none', () => {
  assert.equal(hostOf('https://api.data.gov.my/x'), 'api.data.gov.my');
  assert.equal(hostOf('javascript:alert(1)'), '');
});

test('fold lowercases, strips diacritics and collapses whitespace', () => {
  assert.equal(fold('  Pulau  Pinang  '), 'pulau pinang');
  assert.equal(fold('Kuala Lumpur'), 'kuala lumpur');
});

test('slugify produces id-safe strings', () => {
  assert.equal(slugify('Population by State'), 'population-by-state');
  assert.match(slugify('Electric Vehicle (EV) Chargers!'), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('toDateString handles Date objects from YAML parsers', () => {
  assert.equal(toDateString(new Date('2026-10-04T00:00:00Z')), '2026-10-04');
  assert.equal(toDateString('2026-10-04'), '2026-10-04');
});
