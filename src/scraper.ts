interface Env {
  DB: D1Database;
}

interface ScraperSummary {
  fetched: number;
  upserted: number;
  changed: number;
  pages: number;
  errors: string[];
}

interface StudyRow {
  nct_id: string;
  brief_title: string | null;
  overall_status: string | null;
  phase: string | null;
  lead_sponsor: string | null;
  primary_condition: string | null;
  country: string | null;
  enrollment_count: number | null;
  start_date: string | null;
  last_update_posted: string | null;
}

interface CTGStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
    };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: { date?: string };
      lastUpdatePostDateStruct?: { date?: string };
    };
    designModule?: {
      phases?: string[];
      enrollmentInfo?: { count?: number };
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name?: string };
    };
    conditionsModule?: {
      conditions?: string[];
    };
    contactsLocationsModule?: {
      locations?: Array<{ country?: string }>;
    };
  };
}

interface CTGResponse {
  studies?: CTGStudy[];
  nextPageToken?: string;
}

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

const PHASE_RANK: Record<string, number> = {
  NA: 0,
  EARLY_PHASE1: 1,
  PHASE1: 2,
  PHASE1_PHASE2: 3,
  PHASE2: 4,
  PHASE2_PHASE3: 5,
  PHASE3: 6,
  PHASE4: 7,
};

function pickHighestPhase(phases: string[] | undefined): string | null {
  if (!phases || phases.length === 0) return null;
  let best: string | null = null;
  let bestRank = -1;
  for (const raw of phases) {
    const p = String(raw).toUpperCase().replace(/\s+/g, "_");
    const rank = PHASE_RANK[p] ?? -1;
    if (rank > bestRank) {
      bestRank = rank;
      best = p;
    }
  }
  return best;
}

function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

function deriveCountry(locations: Array<{ country?: string }> | undefined): string | null {
  if (!locations || locations.length === 0) return null;
  const countries = new Set<string>();
  for (const loc of locations) {
    if (loc.country && loc.country.trim()) countries.add(loc.country.trim());
  }
  if (countries.size === 0) return null;
  if (countries.size > 1) return "MULTI";
  const first = locations.find((l) => l.country && l.country.trim());
  return first?.country?.trim() ?? null;
}

function flattenStudy(study: CTGStudy): StudyRow | null {
  const ps = study.protocolSection;
  if (!ps) return null;
  const nctId = ps.identificationModule?.nctId?.trim();
  if (!nctId) return null;

  const conditions = ps.conditionsModule?.conditions ?? [];
  const primaryCondition =
    conditions.length > 0 && typeof conditions[0] === "string"
      ? conditions[0].trim().toLowerCase()
      : null;

  const enrollmentRaw = ps.designModule?.enrollmentInfo?.count;
  const enrollment =
    typeof enrollmentRaw === "number" && Number.isFinite(enrollmentRaw)
      ? Math.trunc(enrollmentRaw)
      : null;

  return {
    nct_id: nctId,
    brief_title: ps.identificationModule?.briefTitle?.trim() ?? null,
    overall_status: ps.statusModule?.overallStatus?.trim().toUpperCase() ?? null,
    phase: pickHighestPhase(ps.designModule?.phases),
    lead_sponsor: ps.sponsorCollaboratorsModule?.leadSponsor?.name?.trim() ?? null,
    primary_condition: primaryCondition,
    country: deriveCountry(ps.contactsLocationsModule?.locations),
    enrollment_count: enrollment,
    start_date: normalizeDate(ps.statusModule?.startDateStruct?.date),
    last_update_posted: normalizeDate(ps.statusModule?.lastUpdatePostDateStruct?.date),
  };
}

async function ensureTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS studies (
        nct_id TEXT PRIMARY KEY,
        brief_title TEXT,
        overall_status TEXT,
        phase TEXT,
        lead_sponsor TEXT,
        primary_condition TEXT,
        country TEXT,
        enrollment_count INTEGER,
        start_date TEXT,
        last_update_posted TEXT
      )`,
    )
    .run();
  const indexes: string[] = [
    "CREATE INDEX IF NOT EXISTS idx_studies_nct_id ON studies(nct_id)",
    "CREATE INDEX IF NOT EXISTS idx_studies_overall_status ON studies(overall_status)",
    "CREATE INDEX IF NOT EXISTS idx_studies_phase ON studies(phase)",
    "CREATE INDEX IF NOT EXISTS idx_studies_lead_sponsor ON studies(lead_sponsor)",
    "CREATE INDEX IF NOT EXISTS idx_studies_primary_condition ON studies(primary_condition)",
    "CREATE INDEX IF NOT EXISTS idx_studies_country ON studies(country)",
    "CREATE INDEX IF NOT EXISTS idx_studies_start_date ON studies(start_date)",
    "CREATE INDEX IF NOT EXISTS idx_studies_last_update_posted ON studies(last_update_posted)",
  ];
  for (const stmt of indexes) {
    await db.prepare(stmt).run();
  }
}

async function fetchPage(pageToken: string | null): Promise<CTGResponse> {
  const url = new URL(API_BASE);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("countTotal", "false");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url.toString(), {
    headers: { accept: "application/json", "user-agent": "ctg-clean-rest/1.0" },
  });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov returned HTTP ${res.status}`);
  }
  return (await res.json()) as CTGResponse;
}

function rowsEqual(a: StudyRow, b: StudyRow): boolean {
  return (
    a.brief_title === b.brief_title &&
    a.overall_status === b.overall_status &&
    a.phase === b.phase &&
    a.lead_sponsor === b.lead_sponsor &&
    a.primary_condition === b.primary_condition &&
    a.country === b.country &&
    a.enrollment_count === b.enrollment_count &&
    a.start_date === b.start_date &&
    a.last_update_posted === b.last_update_posted
  );
}

async function upsertBatch(
  db: D1Database,
  rows: StudyRow[],
  summary: ScraperSummary,
): Promise<void> {
  if (rows.length === 0) return;

  const ids = rows.map((r) => r.nct_id);
  const placeholders = ids.map(() => "?").join(",");
  const existingRes = await db
    .prepare(`SELECT * FROM studies WHERE nct_id IN (${placeholders})`)
    .bind(...ids)
    .all<StudyRow>();
  const existing = new Map<string, StudyRow>();
  for (const r of existingRes.results ?? []) {
    existing.set(r.nct_id, r);
  }

  const upsertSql = `INSERT INTO studies
    (nct_id, brief_title, overall_status, phase, lead_sponsor, primary_condition, country, enrollment_count, start_date, last_update_posted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(nct_id) DO UPDATE SET
      brief_title=excluded.brief_title,
      overall_status=excluded.overall_status,
      phase=excluded.phase,
      lead_sponsor=excluded.lead_sponsor,
      primary_condition=excluded.primary_condition,
      country=excluded.country,
      enrollment_count=excluded.enrollment_count,
      start_date=excluded.start_date,
      last_update_posted=excluded.last_update_posted`;

  const stmts: D1PreparedStatement[] = [];
  for (const row of rows) {
    const prev = existing.get(row.nct_id);
    if (!prev || !rowsEqual(prev, row)) {
      summary.changed += 1;
    }
    stmts.push(
      db
        .prepare(upsertSql)
        .bind(
          row.nct_id,
          row.brief_title,
          row.overall_status,
          row.phase,
          row.lead_sponsor,
          row.primary_condition,
          row.country,
          row.enrollment_count,
          row.start_date,
          row.last_update_posted,
        ),
    );
    summary.upserted += 1;
  }

  await db.batch(stmts);
}

export async function runScraper(env: Env): Promise<ScraperSummary> {
  const summary: ScraperSummary = {
    fetched: 0,
    upserted: 0,
    changed: 0,
    pages: 0,
    errors: [],
  };

  try {
    await ensureTable(env.DB);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push(`ensureTable: ${msg}`);
    console.error("[scraper] ensureTable failed", msg);
    return summary;
  }

  let pageToken: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let payload: CTGResponse;
    try {
      payload = await fetchPage(pageToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`page ${page}: ${msg}`);
      console.error("[scraper] fetch failed", msg);
      break;
    }

    summary.pages += 1;
    const studies = payload.studies ?? [];
    summary.fetched += studies.length;

    const rows: StudyRow[] = [];
    const seen = new Set<string>();
    for (const s of studies) {
      const flat = flattenStudy(s);
      if (flat && !seen.has(flat.nct_id)) {
        seen.add(flat.nct_id);
        rows.push(flat);
      }
    }

    try {
      await upsertBatch(env.DB, rows, summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`upsert page ${page}: ${msg}`);
      console.error("[scraper] upsert failed", msg);
      break;
    }

    if (!payload.nextPageToken) break;
    pageToken = payload.nextPageToken;
  }

  console.log(
    `[scraper] done pages=${summary.pages} fetched=${summary.fetched} upserted=${summary.upserted} changed=${summary.changed} errors=${summary.errors.length}`,
  );
  return summary;
}