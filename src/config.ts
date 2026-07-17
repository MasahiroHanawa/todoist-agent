import "dotenv/config";

export interface Config {
  todoistApiKey: string;
  llm: {
    baseURL: string;
    apiKey: string;
    model: string;
  };
}

export function loadConfig(): Config {
  const todoistApiKey = process.env.TODOIST_API_KEY;
  if (!todoistApiKey) {
    throw new Error("TODOIST_API_KEY is not set");
  }

  return {
    todoistApiKey,
    llm: {
      // llama.cpp's OpenAI-compatible endpoint
      baseURL: process.env.LLAMA_BASE_URL ?? "http://127.0.0.1:8080/v1",
      apiKey: process.env.LLAMA_API_KEY ?? "local",
      model: process.env.LLAMA_MODEL ?? "local-model",
    },
  };
}
