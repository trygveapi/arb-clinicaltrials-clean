# ClinicalTrials.gov v2 — Clean REST Wrapper

Flat JSON, normalized sponsors, status webhooks. 500K+ studies. No auth dance, no FHIR gymnastics.

The raw ClinicalTrials.gov v2 API returns FHIR-style nested JSON. A sponsor name sits 4 levels deep; conditions come back as coded arrays; phase labels vary by casing across records. This wrapper flattens every study into a single-level object — `study.sponsor`, `study.conditions[]`, `study.phase`, `study.status` — so you can filter, sort, and store without writing a schema traversal layer first.

On top of normalization, the wrapper deduplicates sponsor names against a canonical lookup table (`"Pfizer Inc."`, `"PFIZER"`, and `"Pfizer"` resolve to one key), caches responses with a configurable TTL, and fires status-change webhooks. When a trial moves from `RECRUITING` to `ACTIVE_NOT_RECRUITING`, your endpoint receives a POST containing the NCT ID, old status, new status, timestamp, and a field diff.

The underlying dataset covers 500,000+ studies across 221 countries, refreshed daily by ClinicalTrials.gov. Pharma developers and compliance teams use it to track competitor pipelines, monitor regulatory milestones, and feed trial-matching engines. Authentication and rate limiting live in this wrapper; the upstream ClinicalTrials.gov endpoint requires neither.

## Use cases

### Search recruiting trials by condition and phase

```bash
curl -H 'Authorization: Bearer KEY' \
  'https://clinicaltrials-clean.trygve-api.workers.dev/studies?condition=NSCLC&phase=2&status=RECRUITING&limit=10'
```

```python
import httpx

r = httpx.get(
    "https://clinicaltrials-clean.trygve-api.workers.dev/studies",
    headers={"Authorization": "Bearer KEY"},
    params={"condition": "NSCLC", "phase": "2", "status": "RECRUITING", "limit": 10},
)
for s in r.json()["studies"]:
    print(s["nct_id"], s["sponsor"], s["title"])
```

```javascript
const r = await fetch(
  "https://clinicaltrials-clean.trygve-api.workers.dev/studies?condition=NSCLC&phase=2&status=RECRUITING&limit=10",
  { headers: { Authorization: "Bearer KEY" } }
);
const { studies } = await r.json();
studies.forEach(s => console.log(s.nct_id, s.sponsor, s.title));
```

### Fetch a sponsor's full active pipeline

```bash
curl -H 'Authorization: Bearer KEY' \
  'https://clinicaltrials-clean.trygve-api.workers.dev/sponsors/Pfizer/studies?status=RECRUITING'
```

```python
import httpx

r = httpx.get(
    "https://clinicaltrials-clean.trygve-api.workers.dev/sponsors/Pfizer/studies",
    headers={"Authorization": "Bearer KEY"},
    params={"status": "RECRUITING"},
)
pipeline = r.json()["studies"]
print(f"{len(pipeline)} active Pfizer trials across {len({s['condition'] for s in pipeline})} conditions")
```

```javascript
const r = await fetch(
  "https://clinicaltrials-clean.trygve-api.workers.dev/sponsors/Pfizer/studies?status=RECRUITING",
  { headers: { Authorization: "Bearer KEY" } }
);
const { studies } = await r.json();
const conditions = new Set(studies.map(s => s.condition));
console.log(`${studies.length} trials across ${conditions.size} conditions`);
```

### Register a status-change webhook on a specific trial

```bash
curl -X POST \
  -H 'Authorization: Bearer KEY' \
  -H 'Content-Type: application/json' \
  -d '{"nct_id":"NCT02835729","url":"https://your-app.com/hooks/trials"}' \
  'https://clinicaltrials-clean.trygve-api.workers.dev/webhooks'
```

```python
import httpx

r = httpx.post(
    "https://clinicaltrials-clean.trygve-api.workers.dev/webhooks",
    headers={"Authorization": "Bearer KEY"},
    json={
        "nct_id": "NCT02835729",
        "url": "https://your-app.com/hooks/trials",
    },
)
# {"webhook_id": "wh_abc123", "status": "active", "nct_id": "NCT02835729"}
print(r.json())
```

```javascript
const r = await fetch(
  "https://clinicaltrials-clean.trygve-api.workers.dev/webhooks",
  {
    method: "POST",
    headers: { Authorization: "Bearer KEY", "Content-Type": "application/json" },
    body: JSON.stringify({ nct_id: "NCT02835729", url: "https://your-app.com/hooks/trials" }),
  }
);
const { webhook_id } = await r.json();
console.log(webhook_id); // wh_abc123
```

## Pricing

| Tier | Quota / month | Price |
|---|---|---|
| Free | 100 | $0 |
| Starter | 10,000 | $9 |
| Pro | 100,000 | $29 |

## FAQ

**Why wrap a free, public API at all?**

ClinicalTrials.gov v2 returns valid but deeply nested JSON modeled after FHIR. Sponsor names appear in 3–5 variations across records; conditions are coded arrays, not strings; phase labels are inconsistently cased. Getting a flat, filterable row out of one study takes 20–40 lines of parsing code. This wrapper does that once, consistently, for every study.

**How current is the data?**

ClinicalTrials.gov publishes daily updates. Endpoints are cached for 1 hour by default; the Pro plan lets you set a custom TTL per request via the `Cache-Control` header. Webhook checks run against the latest daily snapshot every 6 hours.

**What does a status-change webhook payload look like?**

A POST to your registered URL with: `{"nct_id": "NCT02835729", "event": "status_changed", "old_status": "RECRUITING", "new_status": "ACTIVE_NOT_RECRUITING", "changed_at": "2025-11-12T08:00:00Z", "diff": {"enrollment": {"old": 240, "new": 240}, "completion_date": {"old": null, "new": "2026-03-01"}}}`. Delivery is retried up to 3 times with exponential backoff on non-2xx responses.

**Which plans include webhooks and what are the rate limits?**

Basic ($20/mo): study search and sponsor endpoints, 10,000 requests/month, no webhooks. Pro ($50/mo): all endpoints, 100,000 requests/month, up to 50 active webhooks. Enterprise: custom limits and SLA. Overage is billed at $0.002 per request.

**Can I query by NCT ID directly, or only by condition and sponsor?**

Both. `GET /studies/{nct_id}` returns a single normalized study object. Bulk endpoints accept `condition`, `sponsor`, `phase`, `status`, `country`, `start_date_from`, and `start_date_to` as query parameters, combinable in any order.

## Endpoints

See [`/openapi.json`](https://clinicaltrials-clean.trygve-api.workers.dev/openapi.json) and the interactive
[Swagger UI](https://clinicaltrials-clean.trygve-api.workers.dev/docs).

## Source data

This API is a clean wrapper of https://clinicaltrials.gov/data-api/api.
