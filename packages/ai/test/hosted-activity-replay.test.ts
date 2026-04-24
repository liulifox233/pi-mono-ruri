import { describe, expect, it } from "vitest";
import { getModel } from "../src/models.js";
import { convertResponsesMessages } from "../src/providers/openai-responses-shared.js";
import type { AssistantMessage, Context, HostedToolActivity, Usage } from "../src/types.js";

const usage: Usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistantWith(activity: HostedToolActivity, overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		content: [activity],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-5.4",
		usage,
		stopReason: "stop",
		timestamp: Date.now(),
		...overrides,
	};
}

function contextFor(message: AssistantMessage): Context {
	return {
		messages: [message, { role: "user", content: "continue", timestamp: Date.now() }],
	};
}

describe("hosted activity replay", () => {
	it("replays OpenAI hosted raw items across models for the same provider API", () => {
		const rawItem = { type: "web_search_call", id: "ws_1", status: "completed" };
		const activity: HostedToolActivity = {
			type: "hostedToolActivity",
			id: "ws_1",
			name: "web_search_call",
			arguments: { query: "pi" },
			provider: "openai",
			api: "openai-responses",
			model: "gpt-5.4",
			status: "completed",
			summary: "Hosted web search completed for pi.",
			rawItem,
		};

		const targetModel = { ...getModel("openai", "gpt-5.4"), id: "different-openai-model" };
		const replay = convertResponsesMessages(targetModel, contextFor(assistantWith(activity)), new Set(["openai"]));

		expect(replay).toContain(rawItem);
	});

	it("summarizes hosted raw items across provider APIs", () => {
		const rawItem = { type: "web_search_call", id: "ws_1", status: "completed" };
		const activity: HostedToolActivity = {
			type: "hostedToolActivity",
			id: "ws_1",
			name: "web_search_call",
			arguments: { query: "pi" },
			provider: "openai",
			api: "openai-responses",
			model: "gpt-5.4",
			status: "completed",
			summary: "Hosted web search completed for pi.",
			rawItem,
		};
		const targetModel = getModel("openai-codex", "gpt-5.3-codex");
		const replay = convertResponsesMessages(
			targetModel,
			contextFor(assistantWith(activity)),
			new Set(["openai-codex"]),
		);

		expect(replay).not.toContain(rawItem);
		expect(replay).toContainEqual(
			expect.objectContaining({
				type: "message",
				role: "assistant",
				content: [expect.objectContaining({ type: "output_text", text: "Hosted web search completed for pi." })],
			}),
		);
		expect(replay).not.toContainEqual(expect.objectContaining({ type: "function_call", name: "web_search_call" }));
	});

	it("skips hosted activity without raw replay or summary metadata", () => {
		const activity: HostedToolActivity = {
			type: "hostedToolActivity",
			id: "empty",
			name: "web_search_call",
			arguments: {},
			provider: "openai",
			api: "openai-responses",
			model: "gpt-5.4",
		};
		const targetModel = getModel("openai-codex", "gpt-5.3-codex");
		const replay = convertResponsesMessages(
			targetModel,
			contextFor(assistantWith(activity)),
			new Set(["openai-codex"]),
		);

		expect(replay).toEqual([{ role: "user", content: [{ type: "input_text", text: "continue" }] }]);
	});
});
