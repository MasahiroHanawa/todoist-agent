import OpenAI from "openai";
import type { Config } from "../config";

// Creates a client for llama.cpp's OpenAI-compatible API.
export function createLlmClient(config: Config): OpenAI {
  return new OpenAI({
    baseURL: config.llm.baseURL,
    apiKey: config.llm.apiKey,
  });
}
