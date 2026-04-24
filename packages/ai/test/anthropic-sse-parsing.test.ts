import type Anthropic from "@anthropic-ai/sdk";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { getModel } from "../src/models.js";
import { streamAnthropic } from "../src/providers/anthropic.js";
import type { Context, ToolCall } from "../src/types.js";

function createSseResponse(events: Array<{ event: string; data: string }>): Response {
	const body = events.map(({ event, data }) => `event: ${event}\ndata: ${data}\n`).join("\n");
	return new Response(body, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});
}

function createFakeAnthropicClient(response: Response): Anthropic {
	return {
		messages: {
			create: () => ({
				asResponse: async () => response,
			}),
		},
	} as unknown as Anthropic;
}

describe("Anthropic raw SSE parsing", () => {
	it("repairs malformed SSE JSON and malformed streamed tool JSON", async () => {
		const model = getModel("anthropic", "claude-haiku-4-5");
		const context: Context = {
			messages: [{ role: "user", content: "Use the edit tool.", timestamp: Date.now() }],
			tools: [
				{
					name: "edit",
					description: "Edit a file.",
					parameters: Type.Object({
						path: Type.String(),
						text: Type.String(),
					}),
				},
			],
		};

		const malformedToolJsonDelta = String.raw`{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\":\"A\H\",\"text\":\"col1	col2\"}"}}`;

		const response = createSseResponse([
			{
				event: "message_start",
				data: JSON.stringify({
					type: "message_start",
					message: {
						id: "msg_test",
						usage: {
							input_tokens: 12,
							output_tokens: 0,
							cache_read_input_tokens: 0,
							cache_creation_input_tokens: 0,
						},
					},
				}),
			},
			{
				event: "content_block_start",
				data: JSON.stringify({
					type: "content_block_start",
					index: 0,
					content_block: {
						type: "tool_use",
						id: "toolu_test",
						name: "edit",
						input: {},
					},
				}),
			},
			{ event: "content_block_delta", data: malformedToolJsonDelta },
			{
				event: "content_block_stop",
				data: JSON.stringify({ type: "content_block_stop", index: 0 }),
			},
			{
				event: "message_delta",
				data: JSON.stringify({
					type: "message_delta",
					delta: { stop_reason: "tool_use" },
					usage: {
						input_tokens: 12,
						output_tokens: 5,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				}),
			},
			{
				event: "message_stop",
				data: JSON.stringify({ type: "message_stop" }),
			},
		]);

		const stream = streamAnthropic(model, context, {
			client: createFakeAnthropicClient(response),
		});
		const result = await stream.result();

		expect(result.stopReason).toBe("toolUse");
		expect(result.errorMessage).toBeUndefined();

		const toolCall = result.content.find((block): block is ToolCall => block.type === "toolCall");
		expect(toolCall).toBeDefined();
		expect(toolCall?.arguments).toEqual({
			path: "A\\H",
			text: "col1\tcol2",
		});
	});
});

it("captures Anthropic hosted tool blocks as hosted activity", async () => {
	const model = getModel("anthropic", "claude-haiku-4-5");
	const context: Context = {
		messages: [{ role: "user", content: "Search the web.", timestamp: Date.now() }],
		tools: [
			{
				kind: "hosted",
				name: "anthropic_web_search",
				description: "Anthropic web search",
				parameters: Type.Object({}),
				api: "anthropic-messages",
				type: "web_search_20250305",
				payload: { type: "web_search_20250305", name: "web_search", max_uses: 1 },
			},
		],
	};
	const serverToolUse = {
		type: "server_tool_use",
		id: "srvu_test",
		name: "web_search",
		input: {},
	};
	const searchResult = {
		type: "web_search_tool_result",
		tool_use_id: "srvu_test",
		content: [
			{
				type: "web_search_result",
				title: "Pi",
				url: "https://example.com/pi",
				encrypted_content: "encrypted",
				page_age: null,
			},
		],
	};
	const response = createSseResponse([
		{
			event: "message_start",
			data: JSON.stringify({
				type: "message_start",
				message: {
					id: "msg_test",
					usage: {
						input_tokens: 12,
						output_tokens: 0,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			}),
		},
		{
			event: "content_block_start",
			data: JSON.stringify({ type: "content_block_start", index: 0, content_block: serverToolUse }),
		},
		{
			event: "content_block_delta",
			data: JSON.stringify({
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partial_json: '{"query":"pi"}' },
			}),
		},
		{ event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
		{
			event: "content_block_start",
			data: JSON.stringify({ type: "content_block_start", index: 1, content_block: searchResult }),
		},
		{ event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 1 }) },
		{
			event: "message_delta",
			data: JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: { input_tokens: 12, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
			}),
		},
		{ event: "message_stop", data: JSON.stringify({ type: "message_stop" }) },
	]);

	const stream = streamAnthropic(model, context, { client: createFakeAnthropicClient(response) });
	const result = await stream.result();

	const hostedActivities = result.content.filter((block) => block.type === "hostedToolActivity");
	expect(hostedActivities).toHaveLength(2);
	expect(hostedActivities[0]).toEqual(
		expect.objectContaining({
			name: "web_search",
			status: undefined,
			provider: "anthropic",
			api: "anthropic-messages",
			model: model.id,
			arguments: expect.objectContaining({ input: { query: "pi" } }),
		}),
	);
	expect(hostedActivities[0].rawItem).toEqual(expect.objectContaining({ input: { query: "pi" } }));
	expect(hostedActivities[0]).not.toHaveProperty("partialJson");
	expect(hostedActivities[1]).toEqual(
		expect.objectContaining({
			name: "web_search_tool_result",
			status: "completed",
			citations: [{ title: "Pi", url: "https://example.com/pi" }],
		}),
	);
});

it("ignores Anthropic hosted blocks when the hosted tool is not active", async () => {
	const model = getModel("anthropic", "claude-haiku-4-5");
	const context: Context = {
		messages: [{ role: "user", content: "Search the web.", timestamp: Date.now() }],
	};
	const response = createSseResponse([
		{
			event: "message_start",
			data: JSON.stringify({
				type: "message_start",
				message: {
					id: "msg_test",
					usage: {
						input_tokens: 12,
						output_tokens: 0,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			}),
		},
		{
			event: "content_block_start",
			data: JSON.stringify({
				type: "content_block_start",
				index: 0,
				content_block: { type: "server_tool_use", id: "srvu_test", name: "web_search", input: { query: "pi" } },
			}),
		},
		{ event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
		{
			event: "message_delta",
			data: JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: { input_tokens: 12, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
			}),
		},
		{ event: "message_stop", data: JSON.stringify({ type: "message_stop" }) },
	]);

	const stream = streamAnthropic(model, context, { client: createFakeAnthropicClient(response) });
	const result = await stream.result();

	expect(result.content).toEqual([]);
});

it("ignores Anthropic hosted result blocks without an accepted tool use id", async () => {
	const model = getModel("anthropic", "claude-haiku-4-5");
	const context: Context = {
		messages: [{ role: "user", content: "Search the web.", timestamp: Date.now() }],
		tools: [
			{
				kind: "hosted",
				name: "anthropic_web_search",
				description: "Anthropic web search",
				parameters: Type.Object({}),
				api: "anthropic-messages",
				type: "web_search_20250305",
				payload: { type: "web_search_20250305", name: "web_search", max_uses: 1 },
			},
		],
	};
	const response = createSseResponse([
		{
			event: "message_start",
			data: JSON.stringify({
				type: "message_start",
				message: {
					id: "msg_test",
					usage: {
						input_tokens: 12,
						output_tokens: 0,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 0,
					},
				},
			}),
		},
		{
			event: "content_block_start",
			data: JSON.stringify({
				type: "content_block_start",
				index: 0,
				content_block: { type: "web_search_tool_result", tool_use_id: "unmatched", content: [] },
			}),
		},
		{ event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) },
		{
			event: "message_delta",
			data: JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: { input_tokens: 12, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
			}),
		},
		{ event: "message_stop", data: JSON.stringify({ type: "message_stop" }) },
	]);

	const stream = streamAnthropic(model, context, { client: createFakeAnthropicClient(response) });
	const result = await stream.result();

	expect(result.content).toEqual([]);
});
