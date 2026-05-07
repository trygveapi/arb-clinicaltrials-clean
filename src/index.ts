import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { apiKey } from "./auth";
import { errorHandler, type ApiError } from "./lib/errors";
import { ensureSchema, type Env } from "./lib/db";
// Routes are appended below this line by the Builder agent. Do not edit manually.
import { registerStudiesRoutes } from "./routes/studies";

const app = new OpenAPIHono<{ Bindings: Env }>();

app.onError((err, c) => errorHandler(err as Error & ApiError, c));

app.get("/healthz", async (c) => {
  await ensureSchema(c.env.DB);
  return c.json({ ok: true, slug: c.env.PRODUCT_SLUG, time: new Date().toISOString() });
});

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "ClinicalTrials.gov Clean REST Wrapper", version: "0.1.0", description: "A flattened, cache-friendly REST wrapper around the ClinicalTrials.gov v2 API. Normalizes the deeply nested protocol section into a single flat resource per study, exposing stable NCT identifiers, status, phase, sponsor, condition, and key date fields suitable for filtering and indexing by pharma, CRO, and compliance applications." },
  servers: [{ url: "https://clinicaltrials-clean.workers.dev" }],
});
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// Public routes require an API key
app.use("/v1/*", apiKey);

registerStudiesRoutes(app);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Builder writes the scraper entry here.
    const { runScraper } = await import("./scraper");
    ctx.waitUntil(runScraper(env));
  },
} satisfies ExportedHandler<Env>;
