# ClinicalTrials.gov Clean REST Wrapper

A flattened, cache-friendly REST wrapper around the ClinicalTrials.gov v2 API. Normalizes the deeply nested protocol section into a single flat resource per study, exposing stable NCT identifiers, status, phase, sponsor, condition, and key date fields suitable for filtering and indexing by pharma, CRO, and compliance applications.

## Quick start

```bash
curl -H "Authorization: Bearer YOUR_KEY" https://clinicaltrials-clean.workers.dev/v1/studies
```

## Endpoints

- `GET /healthz` — liveness check (no auth)
- `GET /openapi.json` — machine-readable spec
- `GET /docs` — interactive Swagger UI
- `GET /v1/studies` — list with pagination
- `GET /v1/studies/:id` — single record

Full schema: see `/openapi.json`.

## Pricing

| Tier    | Requests / month | Price |
|---------|------------------|-------|
| Free    | 100              | $0    |
| Starter | 10,000           | $9    |
| Pro     | 100,000          | $29   |

Get a key: https://clinicaltrials-clean.workers.dev/docs

## Source data

This API is a clean wrapper of the public source at https://clinicaltrials.gov/data-api/api.
We refresh the cache on a `0 */6 * * *` schedule.

## License

The wrapped API itself is MIT. Underlying data: see https://clinicaltrials.gov/data-api/api.
