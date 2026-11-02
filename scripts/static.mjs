// Servidor estático mínimo para validar o renderer fora do Electron.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "apps", "liner", "dist");
const port = Number(process.env.PORT ?? 4173);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".map", "application/json"],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const relative = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(root, relative);

  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }

  try {
    const body = await readFile(file);
    const type = types.get(path.extname(file)) ?? "application/octet-stream";
    response.writeHead(200, { "content-type": type });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`renderer em http://127.0.0.1:${port}`);
});
