import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Env } from "../lib/db";

const StudySchema = z
  .object({
    nct_id: z.string().openapi({ example: "NCT04267848" }),
    brief_title: z.string().nullable(),
    overall_status: z.string().nullable(),
    phase: z.string().nullable(),
    lead_sponsor: z.string().nullable(),
    primary_condition: z.string().nullable(),
    country: z.string().nullable(),
    enrollment_count: z.number().int().nullable(),
    start_date: z.string().nullable(),
    completion_date: z.string().nullable(),
    last_update_posted: z.string().nullable(),
  })
  .openapi("Study");

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .openapi("Error");

const ListResponseSchema = z
  .object({
    data: z.array(StudySchema),
    pagination: z.object({
      next_cursor: z.string().nullable(),
      limit: z.number().int(),
    }),
  })
  .openapi("StudiesListResponse");

const ListQuerySchema = z.object({
  cursor: z.string().optional().openapi({
    param: { name: "cursor", in: "query" },
    example: "NCT04267848",
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .openapi({ param: { name: "limit", in: "query" }, example: 25 }),
  q: z.string().optional().openapi({
    param: { name: "q", in: "query" },
    description: "Full-text search across brief_title and primary_condition.",
  }),
  overall_status: z.string().optional().openapi({
    param: { name: "overall_status", in: "query" },
    example: "RECRUITING",
  }),
  phase: z.string().optional().openapi({
    param: { name: "phase", in: "query" },
    example: "PHASE3",
  }),
  lead_sponsor: z.string().optional().openapi({
    param: { name: "lead_sponsor", in: "query" },
  }),
  primary_condition: z.string().optional().openapi({
    param: { name: "primary_condition", in: "query" },
  }),
  country: z.string().optional().openapi({
    param: { name: "country", in: "query" },
    example: "US",
  }),
  start_date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ param: { name: "start_date_from", in: "query" } }),
  start_date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ param: { name: "start_date_to", in: "query" } }),
  completion_date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ param: { name: "completion_date_from", in: "query" } }),
  completion_date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ param: { name: "completion_date_to", in: "query" } }),
  last_update_posted_from: z
    .string()
    .optional()
    .openapi({ param: { name: "last_update_posted_from", in: "query" } }),
  last_update_posted_to: z
    .string()
    .optional()
    .openapi({ param: { name: "last_update_posted_to", in: "query" } }),
});

const IdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({
      param: { name: "id", in: "path" },
      example: "NCT04267848",
    }),
});

type StudyRow = z.infer<typeof StudySchema>;

const SELECT_COLUMNS =
  "nct_id, brief_title, overall_status, phase, lead_sponsor, primary_condition, country, enrollment_count, start_date, completion_date, last_update_posted";

const listRoute = createRoute({
  method: "get",
  path: "/v1/studies",
  tags: ["Studies"],
  summary:
    "List studies with filtering by status, phase, sponsor, condition, country, and date ranges; supports pagination and full-text search.",
  request: { query: ListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of studies.",
      content: { "application/json": { schema: ListResponseSchema } },
    },
    429: {
      description: "Too many requests.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

const detailRoute = createRoute({
  method: "get",
  path: "/v1/studies/{id}",
  tags: ["Studies"],
  summary: "Fetch a single flattened study record by NCT ID.",
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: "Study record.",
      content: { "application/json": { schema: StudySchema } },
    },
    404: {
      description: "Study not found.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    429: {
      description: "Too many requests.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export function registerStudiesRoutes(
  app: OpenAPIHono<{ Bindings: Env }>,
): void {
  app.openapi(listRoute, async (c) => {
    const {
      cursor,
      limit,
      q,
      overall_status,
      phase,
      lead_sponsor,
      primary_condition,
      country,
      start_date_from,
      start_date_to,
      completion_date_from,
      completion_date_to,
      last_update_posted_from,
      last_update_posted_to,
    } = c.req.valid("query");

    const where: string[] = [];
    const binds: Array<string | number> = [];

    if (cursor) {
      where.push("nct_id > ?");
      binds.push(cursor);
    }
    if (q) {
      where.push("(brief_title LIKE ? OR primary_condition LIKE ?)");
      const like = `%${q}%`;
      binds.push(like, like);
    }
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
    if (start_date_from) {
      where.push("start_date >= ?");
      binds.push(start_date_from);
    }
    if (start_date_to) {
      where.push("start_date <= ?");
      binds.push(start_date_to);
    }
    if (completion_date_from) {
      where.push("completion_date >= ?");
      binds.push(completion_date_from);
    }
    if (completion_date_to) {
      where.push("completion_date <= ?");
      binds.push(completion_date_to);
    }
    if (last_update_posted_from) {
      where.push("last_update_posted >= ?");
      binds.push(last_update_posted_from);
    }
    if (last_update_posted_to) {
      where.push("last_update_posted <= ?");
      binds.push(last_update_posted_to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `SELECT ${SELECT_COLUMNS} FROM studies ${whereSql} ORDER BY nct_id ASC LIMIT ?`;
    binds.push(limit + 1);

    const stmt = c.env.DB.prepare(sql).bind(...binds);
    const { results } = await stmt.all<StudyRow>();

    const hasMore = results.length > limit;
    const page = hasMore ? results.slice(0, limit) : results;
    const next_cursor = hasMore ? page[page.length - 1].nct_id : null;

    return c.json(
      {
        data: page,
        pagination: { next_cursor, limit },
      },
      200,
    );
  });

  app.openapi(detailRoute, async (c) => {
    const { id } = c.req.valid("param");

    const row = await c.env.DB.prepare(
      `SELECT ${SELECT_COLUMNS} FROM studies WHERE nct_id = ? LIMIT 1`,
    )
      .bind(id)
      .first<StudyRow>();

    if (!row) {
      return c.json(
        {
          error: {
            code: "not_found",
            message: `Study with id '${id}' not found.`,
          },
        },
        404,
      );
    }

    return c.json(row, 200);
  });
}