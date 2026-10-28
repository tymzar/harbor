import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Serves fixtures/ over http so the extension sees an ordinary website.
const root = path.resolve("fixtures");
const port = Number(process.env.FIXTURE_PORT ?? 4317);

createServer(async (request, response) => {
  const name = path.basename(new URL(request.url ?? "/", "http://x").pathname) || "docs.html";
  try {
    const body = await readFile(path.join(root, name));
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1");
