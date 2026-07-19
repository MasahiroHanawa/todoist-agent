import type { TodoistMcp } from "./client";

// Tool names exposed to the LLM -> tool names on the Todoist MCP side.
const TOOL_NAME_MAP: Record<string, string> = {
  find_projects: "find-projects",
  add_tasks: "add-tasks",
  find_tasks: "find-tasks",
  update_tasks: "update-tasks",
  complete_tasks: "complete-tasks",
};

export function toMcpToolName(llmToolName: string): string {
  const name = TOOL_NAME_MAP[llmToolName];
  if (!name) {
    throw new Error(`Unknown tool: ${llmToolName}`);
  }
  return name;
}

// Translates an LLM tool call into an MCP tool call, runs it, and returns the raw
// result to hand back to the LLM (structuredContent preferred).
export async function callTodoistTool(
  mcp: TodoistMcp,
  llmToolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await mcp.callTool(toMcpToolName(llmToolName), args);
  return result.structuredContent ?? result.content;
}

export interface Project {
  id: string;
  name: string;
}

// Extracts the {id, name} array out of find-projects' structuredContent.
// Flattens every value so the array is found whichever key happens to hold it.
export function parseProjects(data: unknown): Project[] {
  if (typeof data !== "object" || data === null) {
    return [];
  }
  return Object.values(data as Record<string, unknown>)
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter(
      (value): value is Project =>
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        "name" in value,
    );
}
