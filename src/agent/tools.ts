import type OpenAI from "openai";

// Tools exposed to the LLM. Translation to the MCP-side names (find-projects /
// add-tasks / find-tasks / update-tasks / complete-tasks) is handled by mcp/todoist.ts.
// find_tasks / update_tasks / complete_tasks let the agent read, sort, and close out
// tasks, which is what Inbox triage needs.
export const llmTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_projects",
      description: "Find a Todoist project by name",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Project name to search for",
          },
        },
        required: ["search"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tasks",
      description: "Add one or more tasks to Todoist",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string" },
                projectId: { type: "string" },
                dueString: { type: "string" },
              },
              required: ["content"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_tasks",
      description:
        "Find Todoist tasks. Provide at least one filter. To list Inbox tasks, pass projectId \"inbox\".",
      parameters: {
        type: "object",
        properties: {
          searchText: {
            type: "string",
            description: "Text to search for in tasks",
          },
          projectId: {
            type: "string",
            description:
              "Find tasks in this project. Use an ID string, or \"inbox\" for Inbox tasks.",
          },
          limit: {
            type: "integer",
            description: "Max number of tasks to return (default 10)",
            minimum: 1,
            maximum: 100,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_tasks",
      description:
        "Update existing tasks. To sort a task into a project, set its projectId.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                content: { type: "string" },
                projectId: {
                  type: "string",
                  description:
                    "New project for the task. Use an ID string, or \"inbox\".",
                },
                dueString: { type: "string" },
              },
              required: ["id"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_tasks",
      description: "Complete one or more tasks by their IDs",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "string" },
            description: "The IDs of the tasks to complete",
          },
        },
        required: ["ids"],
        additionalProperties: false,
      },
    },
  },
];
