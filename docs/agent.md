# The agent

An agent using llama.cpp's OpenAI-compatible API as its LLM and the Todoist MCP server as its
tool-execution layer.

## System prompt

The real thing is `SYSTEM_PROMPT` in [src/agent/run-agent.ts](../src/agent/run-agent.ts). In
short:

- You are a Todoist assistant.
- Resolve a project name to an id with `find_projects` before adding tasks to it or moving
  tasks into it.
- Create tasks with `add_tasks`, and confirm what you did in plain language.

## Exposed tools

The tools handed to the LLM live in [src/agent/tools.ts](../src/agent/tools.ts). Translating
them to MCP's names is the job of `TOOL_NAME_MAP` in
[src/mcp/todoist.ts](../src/mcp/todoist.ts).

| LLM tool | MCP tool | Purpose |
|---|---|---|
| `find_projects` | `find-projects` | Look a project up by name |
| `add_tasks` | `add-tasks` | Create tasks |
| `find_tasks` | `find-tasks` | Search tasks; `projectId: "inbox"` lists the Inbox |
| `update_tasks` | `update-tasks` | Update tasks; setting `projectId` sorts one into a project |
| `complete_tasks` | `complete-tasks` | Close tasks out |

Inbox triage runs `find_tasks` on the Inbox, resolves the destination with `find_projects`,
then sets `projectId` with `update_tasks`.

## The loop

`runAgent` sends the conversation to llama with the tool schemas attached, and keeps going as
long as the reply carries `tool_calls`: each call is translated to its MCP name, executed,
and its result appended as a `tool` message. A reply with no tool calls is the final answer.
Tool errors are serialized back to the model rather than thrown, letting it recover on the
next turn. `MAX_STEPS` (8) bounds the loop.

LLM calls retry on transient failures — llama.cpp answers 503 while a model loads and refuses
connections before it is up. Retries are capped at roughly 30 seconds total so an iOS
shortcut does not time out waiting.

## Running

```sh
npx tsx src/index.ts "買い物プロジェクトに牛乳を買うを追加して"
```
