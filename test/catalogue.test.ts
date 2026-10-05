/**
 * Catalogue integrity. These are the checks that must never fail on main: if any of them
 * break, the catalogue is wrong in a way a user would notice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { loadCatalogue } from '../lib/load.ts';
import { taxonomies } from '../lib/taxonomies.ts';
import { isHttpUrl } from '../lib/util.ts';

// Fixed reference date so freshness warnings never make the suite time-dependent.
const { catalogue, problems } = loadCatalogue({ now: new Date('2026-10-04T00:00:00Z') });

test('catalogue loads with no blocking problems', () => {
  const errors = problems.filter((p) => p.level === 'error');
  assert.deepEqual(
    errors.map((e) => `${e.where}: ${e.message}`),
    [],
    'catalogue must have zero errors',
  );
});

test('there is a catalogue to build', () => {
  assert.ok(catalogue.resources.length > 0, 'expected at least one resource');
  assert.ok(catalogue.publishers.length > 0, 'expected at least one publisher');
});

test('resource ids are unique and slug-shaped', () => {
  const seen = new Set<string>();
  for (const resource of catalogue.resources) {
    assert.ok(!seen.has(resource.id), `duplicate resource id: ${resource.id}`);
    seen.add(resource.id);
    assert.match(resource.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `bad id: ${resource.id}`);
  }
});

test('publisher ids are unique', () => {
  const seen = new Set<string>();
  for (const publisher of catalogue.publishers) {
    assert.ok(!seen.has(publisher.id), `duplicate publisher id: ${publisher.id}`);
    seen.add(publisher.id);
  }
});

test('every resource points at a publisher that exists', () => {
  for (const resource of catalogue.resources) {
    assert.ok(
      catalogue.publishersById.has(resource.publisher),
      `${resource.id} references unknown publisher ${resource.publisher}`,
    );
  }
});

test('controlled vocabularies are respected', () => {
  for (const resource of catalogue.resources) {
    for (const category of resource.categories) {
      assert.ok(taxonomies.categories.includes(category), `${resource.id}: bad category ${category}`);
    }
    assert.ok(
      taxonomies.accessTypes.includes(resource.access.type),
      `${resource.id}: bad access type ${resource.access.type}`,
    );
    for (const type of resource.endpointTypes) {
      assert.ok(taxonomies.endpointTypes.includes(type), `${resource.id}: bad endpoint type ${type}`);
    }
    for (const granularity of resource.geography?.granularity ?? []) {
      assert.ok(
        taxonomies.geographyGranularity.includes(granularity),
        `${resource.id}: bad granularity ${granularity}`,
      );
    }
    if (resource.temporal?.frequency) {
      assert.ok(
        taxonomies.updateFrequency.includes(resource.temporal.frequency),
        `${resource.id}: bad frequency ${resource.temporal.frequency}`,
      );
    }
  }
});

test('every endpoint url is http(s)', () => {
  for (const resource of catalogue.resources) {
    for (const endpoint of resource.endpoints) {
      assert.ok(isHttpUrl(endpoint.url), `${resource.id}: non-http endpoint ${endpoint.url}`);
    }
  }
});

test('verification dates are real dates and not in the future', () => {
  const reference = new Date('2026-10-04T00:00:00Z');
  for (const resource of catalogue.resources) {
    assert.match(resource.last_verified, /^\d{4}-\d{2}-\d{2}$/, `${resource.id}: bad last_verified`);
    assert.ok(
      new Date(`${resource.last_verified}T00:00:00Z`) <= reference,
      `${resource.id}: last_verified is in the future`,
    );
  }
});

test('no resource publishes a safe-looking but unsafe primary URL', () => {
  for (const resource of catalogue.resources) {
    assert.ok(isHttpUrl(resource.primaryUrl), `${resource.id}: unsafe primary url ${resource.primaryUrl}`);
    assert.ok(!/^(javascript|data|file|vbscript):/i.test(resource.primaryUrl));
  }
});

test('related_resources only reference ids that exist', () => {
  for (const resource of catalogue.resources) {
    for (const related of resource.related_resources ?? []) {
      assert.ok(catalogue.byId.has(related), `${resource.id}: unknown related resource ${related}`);
    }
  }
});
