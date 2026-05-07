import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Env } from "../lib/db";

const StudySchema = z
  .object({
    nct_id: z.string().openapi({ example: "NCT01234567" }),
    brief_title: z.string().nullable(),
    overall_status: z.string().nullable(),
    phase: z.string().nullable(),
    lead_sponsor: z.string().nullable(),
    primary_condition: z.string().nullable(),
    country: z.string().nullable(),
    enrollment_count: z.number().int().nullable(),
    start_date: z.string().nullable(),
    last_update_posted: z.string().nullable(),
  })
  .openapi("Study");

const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
    }),
  })
  .openapi("ErrorEnvelope");

const ListStudiesQuerySchema = z.object({
  cursor: z.string().optional().openapi({
    description: "Pagination cursor: nct_id of the last record from previous page.",
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .openapi({ description: "Page size (max 100, default 25)." }),
  overall_status: z.string().optional(),
  phase: z.string().optional(),
  lead_sponsor: z.string().optional(),
  primary_condition: z.string().optional(),
  country: z.string().optional(),
  updated_since: z
    .string()
    .optional()
    .openapi({ description: "ISO 8601 date; filters last_update_posted >= updated_since." }),
});

const ListStudiesResponseSchema = z
  .object({
    data: z.array(StudySchema),
    pagination: z.object({
      next_cursor: z.string().nullable(),
      limit: z.number().int(),
    }),
  })
  .openapi("ListStudiesResponse");

const StudyIdParamsSchema = z.object({
  id: z.string().openapi({
    param: { name: "id", in: "path" },
    example: "NCT01234567",
  }),
});

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

const listStudiesRoute = createRoute({
  method: "get",
  path: "/v1/studies",
  tags: ["Studies"],
  summary:
    "List studies with filters for status, phase, sponsor, condition, country, and updated_since; supports pagination.",
  request: {
    query: ListStudiesQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated list of studies.",
      content: { "application/json": { schema: ListStudiesResponseSchema } },
    },
    429: {
      description: "Rate limit exceeded.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
  },
});

const getStudyRoute = createRoute({
  method: "get",
  path: "/v1/studies/{id}",
  tags: ["Studies"],
  summary: "Fetch a single flattened study by NCT id.",
  request: {
    params: StudyIdParamsSchema,
  },
  responses: {
    200: {
      description: "The requested study.",
      content: { "application/json": { schema: StudySchema } },
    },
    404: {
      description: "Study not found.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
    429: {
      description: "Rate limit exceeded.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
  },
});

export function registerStudiesRoutes(app: OpenAPIHono<{ Bindings: Env }>): void {
  app.openapi(listStudiesRoute, async (c) => {
    const {
      cursor,
      limit,
      overall_status,
      phase,
      lead_sponsor,
      primary_condition,
      country,
      updated_since,
    } = c.req.valid("query");

    const where: string[] = [];
    const binds: Array<string | number> = [];

    if (overall_status) {
      where.push("overall_status = ?");
      binds.push(overall_status);
    }
    if (phase) {
      where.push("phase = ?");
      binds.push(phase);
    }
    if (lead_sponsor) {
      where.push("lead_sponsor = ?");
      binds.push(lead_sponsor);
    }
    if (primary_condition) {
      where.push("primary_condition = ?");
      binds.push(primary_condition);
    }
    if (country) {
      where.push("country = ?");
      binds.push(country);
    }
    if (updated_since) {
      where.push("last_update_posted >= ?");
      binds.push(updated_since);
    }
    if (cursor) {
      where.push("nct_id > ?");
      binds.push(cursor);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `SELECT nct_id, brief_title, overall_status, phase, lead_sponsor, primary_condition, country, enrollment_count, start_date, last_update_posted
                 FROM studies
                 ${whereClause}
                 ORDER BY nct_id ASC
                 LIMIT ?`;
    binds.push(limit + 1);

    const stmt = c.env.DB.prepare(sql).bind(...binds);
    const result = await stmt.all<StudyRow>();
    const rows = result.results ?? [];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].nct_id : null;

    return c.json(
      {
        data: page,
        pagination: {
          next_cursor: nextCursor,
          limit,
        },
      },
      200,
    );
  });

  app.openapi(getStudyRoute, async (c) => {
    const { id } = c.req.valid("param");

    const stmt = c.env.DB.prepare(
      `SELECT nct_id, brief_title, overall_status, phase, lead_sponsor, primary_condition, country, enrollment_count, start_date, last_update_posted
       FROM studies
       WHERE nct_id = ?
       LIMIT 1`,
    ).bind(id);

    const row = await stmt.first<StudyRow>();

    if (!row) {
      return c.json(
        {
          error: {
            code: "not_found",
            message: `Study with id '${id}' was not found.`,
          },
        },
        404,
      );
    }

    return c.json(row, 200);
  });
}