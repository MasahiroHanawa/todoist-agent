import { loadConfig } from "../config";
import { connectTodoistMcp } from "../mcp/client";
import { parseProjects } from "../mcp/todoist";

// Hard-coded task creation that talks to the MCP server directly, with no agent or
// LLM in the loop. Useful for checking that the MCP connection and Todoist
// credentials work on their own.
// Run: tsx src/examples/fixed-task.ts
async function addTaskToProject(
  client: Awaited<ReturnType<typeof connectTodoistMcp>>,
  projectName: string,
  content: string,
) {
  const projectResult = await client.callTool({
    name: "find-projects",
    arguments: { search: projectName },
  });

  const projects = parseProjects(projectResult.structuredContent);
  const project = projects.find(
    (item) => item.name.toLowerCase() === projectName.toLowerCase(),
  );

  if (!project) {
    throw new Error(`Project not found: ${projectName}`);
  }

  const addResult = await client.callTool({
    name: "add-tasks",
    arguments: {
      tasks: [{ content, projectId: project.id }],
    },
  });

  console.dir(addResult, { depth: null });
}

async function main() {
  const config = loadConfig();
  const client = await connectTodoistMcp(config.todoistApiKey);
  try {
    // "買い物" is the shopping project in my own Todoist, and "牛乳を買う" is
    // "buy milk" — swap both for a project and task of your own.
    await addTaskToProject(client, "買い物", "牛乳を買う");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
