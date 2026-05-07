interface Env {
	DB: D1Database;
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
	completion_date: string | null;
	last_update_posted: string | null;
}

interface CtgStudy {
	protocolSection?: {
		identificationModule?: {
			nctId?: string;
			briefTitle?: string;
		};
		statusModule?: {
			overallStatus?: string;
			startDateStruct?: { date?: string };
			primaryCompletionDateStruct?: { date?: string };
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

interface CtgResponse {
	studies?: CtgStudy[];
	nextPageToken?: string;
}

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 200;
const MAX_PAGES = 50;

const ISO_COUNTRY: Record<string, string> = {
	"United States": "US",
	"United Kingdom": "GB",
	Canada: "CA",
	Germany: "DE",
	France: "FR",
	Spain: "ES",
	Italy: "IT",
	Netherlands: "NL",
	Belgium: "BE",
	Switzerland: "CH",
	Sweden: "SE",
	Norway: "NO",
	Denmark: "DK",
	Finland: "FI",
	Poland: "PL",
	Australia: "AU",
	"New Zealand": "NZ",
	Japan: "JP",
	China: "CN",
	"Korea, Republic of": "KR",
	India: "IN",
	Brazil: "BR",
	Mexico: "MX",
	Argentina: "AR",
	Israel: "IL",
	Turkey: "TR",
	"Russian Federation": "RU",
	Ukraine: "UA",
	Austria: "AT",
	Ireland: "IE",
	Portugal: "PT",
	"Czech Republic": "CZ",
	Hungary: "HU",
	Greece: "GR",
	"South Africa": "ZA",
	Egypt: "EG",
	Singapore: "SG",
	"Taiwan, Province of China": "TW",
	"Hong Kong": "HK",
	Thailand: "TH",
	Malaysia: "MY",
	Indonesia: "ID",
	Philippines: "PH",
	Vietnam: "VN",
	"Iran, Islamic Republic of": "IR",
	"Saudi Arabia": "SA",
	"United Arab Emirates": "AE",
	Chile: "CL",
	Colombia: "CO",
	Peru: "PE",
};

function toIsoCountry(name: string | undefined): string | null {
	if (!name) return null;
	return ISO_COUNTRY[name] ?? name.toUpperCase().slice(0, 2);
}

function normalizeDate(d: string | undefined): string | null {
	if (!d) return null;
	const m = d.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
	if (!m) return null;
	const year = m[1];
	const month = m[2] ?? "01";
	const day = m[3] ?? "01";
	return `${year}-${month}-${day}`;
}

function normalizeSponsor(name: string | undefined): string | null {
	if (!name) return null;
	return name.trim().replace(/\s+/g, " ");
}

function normalizePhase(phases: string[] | undefined): string | null {
	if (!phases || phases.length === 0) return "NA";
	const p = phases[0].toUpperCase().replace(/\s+/g, "").replace("PHASE", "PHASE");
	return p || "NA";
}

function flatten(study: CtgStudy): StudyRow | null {
	const id = study.protocolSection?.identificationModule?.nctId;
	if (!id) return null;

	const locations = study.protocolSection?.contactsLocationsModule?.locations ?? [];
	const countries = new Set<string>();
	for (const loc of locations) {
		const c = toIsoCountry(loc.country);
		if (c) countries.add(c);
	}
	const country =
		countries.size === 0 ? null : countries.size === 1 ? [...countries][0] : "MULTI";

	const conditions = study.protocolSection?.conditionsModule?.conditions ?? [];
	const primaryCondition = conditions.length > 0 ? conditions[0].trim() : null;

	const enrollment = study.protocolSection?.designModule?.enrollmentInfo?.count;

	return {
		nct_id: id,
		brief_title: study.protocolSection?.identificationModule?.briefTitle ?? null,
		overall_status: study.protocolSection?.statusModule?.overallStatus ?? null,
		phase: normalizePhase(study.protocolSection?.designModule?.phases),
		lead_sponsor: normalizeSponsor(
			study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name,
		),
		primary_condition: primaryCondition,
		country,
		enrollment_count: typeof enrollment === "number" ? enrollment : null,
		start_date: normalizeDate(study.protocolSection?.statusModule?.startDateStruct?.date),
		completion_date: normalizeDate(
			study.protocolSection?.statusModule?.primaryCompletionDateStruct?.date,
		),
		last_update_posted: normalizeDate(
			study.protocolSection?.statusModule?.lastUpdatePostDateStruct?.date,
		),
	};
}

async function fetchPage(pageToken: string | null): Promise<CtgResponse | null> {
	const params = new URLSearchParams({
		format: "json",
		pageSize: String(PAGE_SIZE),
		countTotal: "false",
	});
	if (pageToken) params.set("pageToken", pageToken);
	const url = `${API_BASE}?${params.toString()}`;
	try {
		const res = await fetch(url, {
			headers: { accept: "application/json" },
		});
		if (!res.ok) {
			console.error(`fetch failed: ${res.status} ${res.statusText} for ${url}`);
			return null;
		}
		return (await res.json()) as CtgResponse;
	} catch (err) {
		console.error(`fetch error: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}
}

export async function runScraper(env: Env): Promise<void> {
	let fetched = 0;
	let upserted = 0;
	let changed = 0;

	const upsertSql = `
		INSERT INTO studies (
			nct_id, brief_title, overall_status, phase, lead_sponsor,
			primary_condition, country, enrollment_count, start_date,
			completion_date, last_update_posted
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(nct_id) DO UPDATE SET
			brief_title = excluded.brief_title,
			overall_status = excluded.overall_status,
			phase = excluded.phase,
			lead_sponsor = excluded.lead_sponsor,
			primary_condition = excluded.primary_condition,
			country = excluded.country,
			enrollment_count = excluded.enrollment_count,
			start_date = excluded.start_date,
			completion_date = excluded.completion_date,
			last_update_posted = excluded.last_update_posted
		WHERE
			IFNULL(studies.brief_title,'') != IFNULL(excluded.brief_title,'') OR
			IFNULL(studies.overall_status,'') != IFNULL(excluded.overall_status,'') OR
			IFNULL(studies.phase,'') != IFNULL(excluded.phase,'') OR
			IFNULL(studies.lead_sponsor,'') != IFNULL(excluded.lead_sponsor,'') OR
			IFNULL(studies.primary_condition,'') != IFNULL(excluded.primary_condition,'') OR
			IFNULL(studies.country,'') != IFNULL(excluded.country,'') OR
			IFNULL(studies.enrollment_count,-1) != IFNULL(excluded.enrollment_count,-1) OR
			IFNULL(studies.start_date,'') != IFNULL(excluded.start_date,'') OR
			IFNULL(studies.completion_date,'') != IFNULL(excluded.completion_date,'') OR
			IFNULL(studies.last_update_posted,'') != IFNULL(excluded.last_update_posted,'')
	`;
	const stmt = env.DB.prepare(upsertSql);

	let pageToken: string | null = null;
	let page = 0;

	try {
		while (page < MAX_PAGES) {
			const data: CtgResponse | null = await fetchPage(pageToken);
			if (!data) break;
			const studies = data.studies ?? [];
			if (studies.length === 0) break;

			const rows: StudyRow[] = [];
			for (const s of studies) {
				const r = flatten(s);
				if (r) rows.push(r);
			}
			fetched += rows.length;

			if (rows.length > 0) {
				const batch = rows.map((r) =>
					stmt.bind(
						r.nct_id,
						r.brief_title,
						r.overall_status,
						r.phase,
						r.lead_sponsor,
						r.primary_condition,
						r.country,
						r.enrollment_count,
						r.start_date,
						r.completion_date,
						r.last_update_posted,
					),
				);
				try {
					const results = await env.DB.batch(batch);
					for (const res of results) {
						if (res.success) {
							upserted += 1;
							const meta = res.meta as { changes?: number } | undefined;
							if (meta && typeof meta.changes === "number" && meta.changes > 0) {
								changed += 1;
							}
						}
					}
				} catch (err) {
					console.error(
						`d1 batch error: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}

			page += 1;
			if (!data.nextPageToken) break;
			pageToken = data.nextPageToken;
		}
	} catch (err) {
		console.error(`scraper error: ${err instanceof Error ? err.message : String(err)}`);
	}

	console.log(
		JSON.stringify({
			scraper: "clinicaltrials_studies",
			pages: page,
			rows_fetched: fetched,
			rows_upserted: upserted,
			rows_changed: changed,
		}),
	);
}