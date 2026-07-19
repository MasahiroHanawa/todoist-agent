import type OpenAI from "openai";
import type { TodoistMcp } from "../mcp/client";
import { llmTools } from "./tools";
import { callTodoistTool } from "../mcp/todoist";

const SYSTEM_PROMPT = [
  "You are a Todoist assistant.",
  "Use find_projects to resolve a project name to its id before adding tasks to or moving tasks into that project.",
  "Use add_tasks to create tasks.",
  "Use find_tasks to read tasks; pass projectId \"inbox\" to list Inbox items.",
  "To sort an Inbox item into a project, resolve the target project with find_projects, then use update_tasks to set the task's projectId.",
  "Use complete_tasks to mark tasks done.",
  "Confirm what you did in plain language.",
].join(" ");

// Upper bound that stops the tool-call loop from running forever.
const MAX_STEPS = 8;

// Retry settings for LLM calls.
// llama.cpp answers 503 "Loading model" while the model loads, and refuses the
// connection outright when it is not up yet. Unattended automation runs must not
// fail silently here, so transient errors wait and retry a few times — kept to
// ~30s total to stay inside the iOS shortcut timeout.
const LLM_MAX_ATTEMPTS = 6;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableLlmError(error: unknown): boolean {
  const e = error as { status?: number; code?: string; name?: string };
  if (typeof e?.status === "number" && RETRYABLE_STATUS.has(e.status)) {
    return true; // e.g. 503 Loading model
  }
  if (e?.code === "ECONNREFUSED" || e?.code === "ECONNRESET") {
    return true; // llama.cpp not running / restarting
  }
  // The openai SDK wraps connection failures in these types (ECONNREFUSED lands in
  // cause and carries no status).
  return e?.name === "APIConnectionError" || e?.name === "APIConnectionTimeoutError";
}

// chat.completions.create, hardened against transient errors.
async function createCompletionWithRetry(
  llm: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
    try {
      return await llm.chat.completions.create(params);
    } catch (error) {
      lastError = error;
      if (!isRetryableLlmError(error) || attempt === LLM_MAX_ATTEMPTS) {
        throw error;
      }
      const delayMs = Math.min(attempt * 2000, 10000);
      console.warn(
        `LLM call failed (attempt ${attempt}/${LLM_MAX_ATTEMPTS}), retrying in ${delayMs}ms: ${String(error)}`,
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export interface AgentDeps {
  llm: OpenAI;
  mcp: TodoistMcp;
  model: string;
}

// Takes the user's instruction, goes back and forth between llama and tool calls,
// and returns the final reply.
export async function runAgent(
  deps: AgentDeps,
  userMessage: string,
): Promise<string> {
  const { llm, mcp, model } = deps;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const completion = await createCompletionWithRetry(llm, {
      model,
      messages,
      tools: llmTools,
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      throw new Error("No response from LLM");
    }

    messages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return message.content ?? "";
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type !== "function") {
        continue;
      }

      let content: string;
      try {
        const args = JSON.parse(toolCall.function.arguments || "{}");
        const result = await callTodoistTool(
          mcp,
          toolCall.function.name,
          args,
        );
        content = JSON.stringify(result);
      } catch (error) {
        content = JSON.stringify({ error: String(error) });
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content,
      });
    }
  }

  throw new Error(`Agent did not finish within ${MAX_STEPS} steps`);
}
