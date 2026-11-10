import type { FastifyInstance } from "fastify";

const DOCS_URL =
  "https://github.com/Gebe-0/offy-app/blob/main/DOCUMENTATION.md";

export async function registerDocsRoutes(app: FastifyInstance): Promise<void> {
  // Rota principal para a documentação oficial no GitHub
  app.get("/docs", async (_request, reply) => {
    return reply.redirect(DOCS_URL);
  });

  // Alias na v1
  app.get("/v1/docs", async (_request, reply) => {
    return reply.redirect(DOCS_URL);
  });
}
