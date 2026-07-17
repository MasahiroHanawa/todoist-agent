# Architecture

## Intent

The LLM client, the tool definitions, the MCP connection and the task handling all started
out sharing a single `src/index.ts`. They are now split by responsibility, leaving the entry
points holding nothing but startup and shutdown.

## Modules

```
src/
  index.ts          CLI entry: load config -> connect MCP -> runAgent -> close
  server.ts         HTTP entry: same wiring, held open across requests
  config.ts         reads TODOIST_API_KEY from .env; also holds llama's baseURL/model
  agent/
    run-agent.ts    the agent loop (llama <-> tool_calls), with cold-start retries
    tools.ts        tool schemas exposed to the LLM
  llm/
    client.ts       OpenAI-compatible client for llama.cpp
  mcp/
    client.ts       stdio connection to the Todoist MCP server
    todoist.ts      LLM <-> MCP name translation, calls, and project parsing
  examples/
    fixed-task.ts   hard-coded task creation, no LLM in the loop
```

## Principles

- No classes and no abstraction that is not paying for itself. Each module exports a handful
  of functions.
- Name translation (`find_projects` -> `find-projects` and friends) is confined to
  `mcp/todoist.ts`. Nothing else needs to know MCP's naming convention.
- The two entry points differ only in how a request arrives. `index.ts` connects, runs once
  and closes; `server.ts` connects once at startup and reuses that connection, because a
  cold start on every voice capture is what makes the flow feel slow.
- Type checking is `npm run typecheck` (`tsc --noEmit`).

## Extending

To expose a new Todoist capability, add a schema to `agent/tools.ts` and the corresponding
entry to `TOOL_NAME_MAP` in `mcp/todoist.ts`. Those two are the whole seam.

An interactive readline loop and persisted chat history are not implemented.
