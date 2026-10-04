// @motherlode/agents: the miners' minds (Lane 2).

export { generatePopulation, traitsOf, type BrainKind, type MinerTraits, type Personality } from "./population";
export { fuzzyBrain, fuzzyDecide, RULES, VARIABLES, type FuzzyTrace } from "./fuzzyBrain";
export { listOptions, market, type ActionClass, type Option } from "./options";
export { createAgents, geminiFromEnv, compareBrains, type Agents, type AgentsOptions, type BrainScore } from "./agents";
export { LlmMind, type LlmMindOptions, type LlmStats, type LlmTrace } from "./llm/llmMind";
export { geminiClient, costUsd, PRICES, DEFAULT_MODEL, type LlmClient, type LlmRequest, type LlmResponse } from "./llm/gemini";
