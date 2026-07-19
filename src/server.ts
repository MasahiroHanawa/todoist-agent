import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { loadConfig } from "./config";
import { createLlmClient } from "./llm/client";
import { connectTodoistMcp } from "./mcp/client";
import { runAgent } from "./agent/run-agent";

// Captures are short lines of text; anything larger than this is not a real
// request, so cap the body to avoid buffering unbounded input into memory.
const MAX_BODY_BYTES = 1_000_000; // 1 MB

// Pulls the shared token out of a request.
// Accepts either `X-Auth-Token: <token>` or `Authorization: Bearer <token>`.
function extractToken(req: IncomingMessage): string | undefined {
  const x = req.headers["x-auth-token"];
  if (typeof x === "string" && x) {
    return x;
  }
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return undefined;
}

// Constant-time comparison, so the token is not leaked by timing.
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// Long-running server that takes voice-captured text from iOS Shortcuts and hands it
// to the agent. The MCP connection and the LLM client are opened once at startup and
// reused, which keeps every request from paying a cold start.
async function main() {
  const config = loadConfig();
  const llm = createLlmClient(config);
  const mcp = await connectTodoistMcp(config.todoistApiKey);

  const port = Number(process.env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${JSON.stringify(process.env.PORT)}`);
  }

  // Authentication is required whenever AGENT_TOKEN is set. Left unset, the server
  // assumes LAN-only local use and runs unauthenticated — it warns at startup, and
  // the token must always be set before exposing the server beyond the LAN.
  const authToken = process.env.AGENT_TOKEN;
  if (!authToken) {
    console.warn(
      "[warn] AGENT_TOKEN is not set: authentication is DISABLED. Set AGENT_TOKEN before exposing this server beyond your LAN.",
    );
  }

  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end("Method Not Allowed");
      return;
    }

    if (authToken) {
      const provided = extractToken(req);
      if (!provided || !tokensMatch(provided, authToken)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }

    // Buffer the raw bytes and decode once at the end. Concatenating chunks as
    // strings can split a multi-byte UTF-8 character across a chunk boundary and
    // corrupt it — which matters here, since the captures are Japanese.
    const chunks: Buffer[] = [];
    let bodyBytes = 0;
    let aborted = false;

    req.on("error", (error) => {
      console.error(error);
      if (!res.headersSent) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "request error" }));
      }
    });

    req.on("data", (chunk: Buffer) => {
      if (aborted) {
        return;
      }
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "payload too large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", async () => {
      if (aborted) {
        return;
      }
      const body = Buffer.concat(chunks).toString("utf8");

      // Set DEBUG_REQUESTS=1 to dump the raw body and content-type, for inspecting
      // exactly what a client (e.g. an iOS Shortcut) is sending.
      if (process.env.DEBUG_REQUESTS) {
        console.log(
          `[debug] content-type=${req.headers["content-type"] ?? "(none)"} raw=${JSON.stringify(body)}`,
        );
      }

      // Accepts JSON {"text": "..."} as well as raw text
      let text = body.trim();
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.text === "string") {
          text = parsed.text.trim();
        }
      } catch {
        // treat the body as raw text
      }

      if (!text) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "text is empty" }));
        return;
      }

      console.log(`> ${text}`);
      try {
        const reply = await runAgent(
          { llm, mcp, model: config.llm.model },
          text,
        );
        console.log(`< ${reply}`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ reply }));
      } catch (error) {
        console.error(error);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
  });

  // Listen on 0.0.0.0 so the iPhone on the home Wi-Fi can reach it.
  server.listen(port, "0.0.0.0", () => {
    console.log(`todoist-agent server listening on http://0.0.0.0:${port}`);
  });

  const shutdown = async () => {
    server.close();
    await mcp.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
