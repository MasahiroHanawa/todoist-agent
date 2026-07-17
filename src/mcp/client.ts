import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Returns a Client connected to the Todoist MCP server (@doist/todoist-mcp) over stdio.
export async function connectTodoistMcp(todoistApiKey: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@doist/todoist-mcp"],
    env: {
      ...process.env,
      TODOIST_API_KEY: todoistApiKey,
    },
  });

  const client = new Client({
    name: "todo-agent",
    version: "0.1.0",
  });

  await client.connect(transport);
  return client;
}
