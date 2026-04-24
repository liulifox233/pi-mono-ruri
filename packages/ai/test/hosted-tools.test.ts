import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { streamSimple } from "../src/stream.js";
import type { Context, HostedTool, Model } from "../src/types.js";

function createModel(api: string, provider: string): Model<string> {
	return {
		id: "model",
		name: "Model",
		api,
		provider,
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 1024,
	};
}

function createHostedTool(overrides: Partial<HostedTool> = {}): HostedTool {
	return {
		kind: "hosted",
		name: "hosted_search",
		description: "Hosted search",
		parameters: Type.Object({}),
		api: "anthropic-messages",
		provider: "anthropic",
		type: "web_search_20250305",
		payload: { type: "web_search_20250305", name: "web_search" },
		...overrides,
	};
}

function createContext(tool: HostedTool): Context {
	return {
		messages: [{ role: "user", content: "hello", timestamp: Date.now() }],
		tools: [tool],
	};
}

describe("hosted tool target validation", () => {
	it("rejects hosted tools that do not declare an api", () => {
		const tool = createHostedTool();
		delete (tool as { api?: unknown }).api;

		expect(() =>
			streamSimple(createModel("anthropic-messages", "anthropic"), createContext(tool), { apiKey: "fake" }),
		).toThrow("Hosted tool hosted_search must declare target api");
	});

	it("rejects hosted tools whose api does not match the current model", () => {
		expect(() =>
			streamSimple(createModel("openai-responses", "openai"), createContext(createHostedTool()), { apiKey: "fake" }),
		).toThrow("targets api anthropic-messages but current model uses openai-responses");
	});

	it("rejects hosted tools whose provider does not match the current model", () => {
		expect(() =>
			streamSimple(
				createModel("anthropic-messages", "github-copilot"),
				createContext(createHostedTool({ api: "anthropic-messages" })),
				{ apiKey: "fake" },
			),
		).toThrow("targets provider anthropic but current model uses github-copilot");
	});

	it("rejects hosted tools on APIs without hosted support", () => {
		expect(() =>
			streamSimple(
				createModel("openai-completions", "openai"),
				createContext(createHostedTool({ api: "openai-completions", provider: "openai" })),
				{ apiKey: "fake" },
			),
		).toThrow("Provider API openai-completions does not support hosted tools");
	});
});
