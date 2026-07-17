import { loadConfig } from "./config";
import { createLlmClient } from "./llm/client";
import { connectTodoistMcp } from "./mcp/client";
import { runAgent } from "./agent/run-agent";

async function main() {
  const userMessage = process.argv.slice(2).join(" ").trim();
  if (!userMessage) {
    throw new Error('Usage: tsx src/index.ts "<instruction>"');
  }

  const config = loadConfig();
  const llm = createLlmClient(config);
  const mcp = await connectTodoistMcp(config.todoistApiKey);

  try {
    const reply = await runAgent(
      { llm, mcp, model: config.llm.model },
      userMessage,
    );
    console.log(reply);
  } finally {
    await mcp.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
