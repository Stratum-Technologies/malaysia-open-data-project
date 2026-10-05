# Changelog

Notable changes to the records, the schema and the exports. The machine-readable version a consumer should depend on is `schema_version` inside the exports, which is not the same number as a release here.

## Unreleased

## 1.0.0

First release as a standalone catalogue repository.

### Added

- `data/` — the records, one YAML file per resource, grouped by publisher.
- `schemas/` — the JSON Schema every record is validated against.
- `taxonomies/` — controlled vocabularies for categories, tags, formats and geographies.
- `examples/` — minimal valid records, used by the tests.
- `generated/` — `catalogue.json`, `directory.json`, `directory.csv`, plus `contract.json` and `checksums.json` for consumers that need to check what they received.
- `lib/` and `scripts/` — the loader, validator, normalisation, taxonomy access, export builders and endpoint checker.
- `test/` — `node:test` suites for the loader, the exports and URL safety.
- CI on every pull request: schema validation, export drift, types and tests.

### Notes

- The workflows in this repository hold no secrets and request `contents: read`.
- The website that renders this catalogue is a separate repository and consumes `generated/`.
