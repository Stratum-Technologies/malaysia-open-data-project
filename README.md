# Malaysia Data Directory

**Where can I get data about this, in Malaysia?**

An open directory of Malaysian data resources — datasets, APIs, databases, dashboards, maps,
registries and statistical publications. It tells you what exists, who publishes it, and how to get
to it.

This repository is the catalogue: the records, the schema they are validated against, and the
exports built from both. The website that renders it is a separate consumer and does not live here.

Maintained by [Stratum](https://stratum.my) with the community. An open project by Stratum.

- **Browse the directory:** <https://data.stratum.my>
- **Read every record:** [`generated/catalogue.json`](generated/catalogue.json)
- **Take the flat export:** [JSON](generated/directory.json) · [CSV](generated/directory.csv)
- **Suggest a resource:** [open an issue](https://github.com/Stratum-Technologies/malaysia-open-data-project/issues/new?template=new-resource.yml)

---

## What this is

A catalogue of *pointers*. For each resource we record what the data is, who publishes it, how you
get to it, what conditions apply, and when someone last confirmed it still exists.

It is deliberately not a data warehouse. We do not copy, mirror or redistribute anybody's datasets.
Every record points at the publisher.

## What it is not

- **Not only open data.** Public, government, academic, community, commercial, international and
  restricted sources all belong here. A source does not have to be open to be listed. Knowing that
  the data exists and who controls it is useful even when you cannot have it today.
- **Not a ranking.** Listings are not ordered by any commercial relationship. Relevance and
  authority decide what surfaces.
- **Not a licence statement.** `access` and `licence` are different things. Publicly readable does
  not mean openly licensed. Check the publisher's terms before you reuse anything.

## What is indexed

Anything that genuinely helps someone obtain, query, purchase, request or otherwise access data
relevant to Malaysia — CSVs, APIs, Parquet, spreadsheets, GIS layers, WMS/WFS, ArcGIS services,
databases, bulk downloads, dashboards, maps, PDFs, statistical releases, commercial databases,
research repositories, and request-only or controlled-access datasets.

## Using the data

`generated/` holds five files, all built from `data/`, all committed. CI fails if they drift from
the YAML, so the copies in this repository always match the records they came from.

| File | What it is for |
|---|---|
| `catalogue.json` | Every record with every field, plus the publisher, category and tag vocabularies. One request, no YAML parser needed. |
| `directory.json` | The resources flattened to the fields that are useful outside this project, each with a `resource_url`. |
| `directory.csv` | The same flattened export as CSV, for spreadsheets. |
| `contract.json` | `schema_version`, the commit that last changed `data/`, and this repository's URL. Read it before parsing anything else. |
| `checksums.json` | SHA-256 of each payload file, taken over its content with `generated_at` and `commit` removed — the file names what was normalised. It proves a copy arrived intact. It does not prove the data is authentic; the commit you pin does that. |

The three JSON files carry `schema_version`, `generated_at`, `commit` and `source`. The categories,
tags, formats and geographies a record may use are defined in `taxonomies/` and validated against
`schemas/`, so a record that validates is a record a consumer can parse without special cases.

Fetching this repository needs no credentials and the exports need no build step. If you mirror or
consume the data, pin a commit rather than tracking `main`. Records change only through reviewed
pull requests against `data/`, so a pinned commit is exactly the data a maintainer approved.

## Contributing

Two routes, both welcome.

**If you are comfortable with Git:** add or edit a YAML file under `data/` and open a pull request.
Run `npm run validate` first — CI runs the same check.

**If you are not:** use the [New data resource issue form](https://github.com/Stratum-Technologies/malaysia-open-data-project/issues/new?template=new-resource.yml).
It asks for everything a reviewer needs. A maintainer will turn it into a pull request. Nothing is
published without review.

If your change affects the exports, run `npm run catalogue` and commit `generated/`. CI compares the
two and fails on drift.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full process, [EDITORIAL.md](EDITORIAL.md) for what
gets accepted and why, and [VALIDATION.md](VALIDATION.md) for the rules CI enforces.

Two things we ask of every contribution: **do not guess** metadata you have not verified (use
`unknown` or leave it out), and **never infer an open licence from public access**.

## Running it locally

Node 20+ and nothing else. No credentials, and no network access except the optional endpoint check.

```
npm ci
npm run validate         # schema, taxonomy and editorial rules over data/
npm test                 # loader, exports and URL safety
npm run typecheck
npm run catalogue        # rewrite generated/ from data/
npm run check:catalogue  # fail if generated/ has drifted from data/
npm run check:links      # optional: probe endpoints, writes reports/
```

## How it is put together

```
data/        one YAML file per resource, grouped by publisher — the only thing humans edit
schemas/     JSON Schema every record is validated against
taxonomies/  controlled vocabularies: categories, tags, formats, geographies
examples/    minimal valid records, used by the tests
lib/         loader, validation, normalisation, taxonomy access, export builders
scripts/     validate, build the exports, check endpoints
generated/   built from data/ and committed; never hand-edit
test/        node:test suites for everything above
```

The website that renders this catalogue is not here. It consumes `generated/` and owns its own
search, ranking and presentation.

## Licensing

**Code** — `lib/`, `scripts/`, `test/` and the CI workflows are [Apache-2.0](LICENSE-CODE): use,
modify and redistribute them, including commercially, with attribution and no warranty.

**Directory metadata** — the catalogue records in `data/` and the generated exports — is intended
for release under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): use it, remix it,
no permission needed. That is the project's stated policy; see [DATA-LICENSE.md](DATA-LICENSE.md),
which also notes that this is product policy rather than a settled legal position, and applies only
to metadata authored here.

**The datasets we point at** are not ours and are not covered by the above. Each resource keeps its
own licence, and where we know it we record it on the record. Where we do not know it, we say so
rather than guess. Always check the publisher's terms.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md). Catalogue content is treated as
untrusted input: it is escaped on render, URL schemes are validated, and the endpoint checker is
guarded against SSRF.
