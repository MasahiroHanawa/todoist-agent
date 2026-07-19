import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// A Todoist MCP connection that reconnects if the @doist/todoist-mcp subprocess
// dies. The server is long-running, so one crash of that subprocess must not
// wedge every later request until someone restarts the process by hand.
export interface TodoistMcp {
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<Client["callTool"]>>>;
  close(): Promise<void>;
}

// Connect the underlying MCP client over a fresh stdio subprocess. Deliberately
// does NOT auto-retry a failed call: a dropped response from a write such as
// add-tasks could mean the write already landed, and retrying would duplicate it.
// Instead a dead connection is forgotten and the next call reconnects.
export async function connectTodoistMcp(
  todoistApiKey: string,
): Promise<TodoistMcp> {
  let current: Client | null = null;
  let closed = false;

  async function connect(): Promise<Client> {
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
    // When the subprocess exits, forget this client so ensure() reconnects.
    client.onclose = () => {
      if (current === client) {
        current = null;
      }
    };
    await client.connect(transport);
    return client;
  }

  async function ensure(): Promise<Client> {
    if (closed) {
      throw new Error("MCP connection is closed");
    }
    if (!current) {
      current = await connect();
    }
    return current;
  }

  // Connect eagerly so startup fails fast on bad credentials or a missing npx.
  current = await connect();

  return {
    async callTool(name, args) {
      const client = await ensure();
      return client.callTool({ name, arguments: args });
    },
    async close() {
      closed = true;
      const client = current;
      current = null;
      if (client) {
        await client.close();
      }
    },
  };
}
