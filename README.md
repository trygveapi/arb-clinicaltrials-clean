# ClinicalTrials.gov v2 Clean REST Wrapper

Flattened, cached REST wrapper over the ClinicalTrials.gov v2 API. Normalizes the nested study schema into a flat record per trial with stable identifiers, normalized sponsor and condition fields, and indexed status and date columns for efficient filtering. Backed by a periodically refreshed mirror of the public dataset.

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
