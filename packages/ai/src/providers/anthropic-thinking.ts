import type { Api, Model, ProviderThinkingDescriptor, SelectableThinkingLevel } from "../types.js";
import { createThinkingOption } from "./provider-thinking-shared.js";

function getModelId(model: Pick<Model<Api>, "id">): string {
	return model.id.toLowerCase();
}

function isOpus46Model(model: Pick<Model<Api>, "id">): boolean {
	const id = getModelId(model);
	return id.includes("opus-4-6") || id.includes("opus-4.6");
}

function isOpus47Model(model: Pick<Model<Api>, "id">): boolean {
	const id = getModelId(model);
	return id.includes("opus-4-7") || id.includes("opus-4.7");
}

export function supportsAdaptiveAnthropicThinking(model: Pick<Model<Api>, "id">): boolean {
	const id = getModelId(model);
	return (
		id.includes("opus-4-6") ||
		id.includes("opus-4.6") ||
		id.includes("opus-4-7") ||
		id.includes("opus-4.7") ||
		id.includes("sonnet-4-6") ||
		id.includes("sonnet-4.6")
	);
}

function getAnthropicThinkingOptions(model: Pick<Model<Api>, "id">) {
	if (!supportsAdaptiveAnthropicThinking(model)) {
		return [
			createThinkingOption("off"),
			createThinkingOption("minimal"),
			createThinkingOption("low"),
			createThinkingOption("medium"),
			createThinkingOption("high"),
		];
	}

	return [
		createThinkingOption("off"),
		createThinkingOption("low"),
		createThinkingOption("medium"),
		createThinkingOption("high"),
		...(isOpus46Model(model)
			? [createThinkingOption("xhigh", "max")]
			: isOpus47Model(model)
				? [createThinkingOption("xhigh")]
				: []),
	];
}

export function mapThinkingLevelToAnthropicValue(
	value: SelectableThinkingLevel,
	model: Pick<Model<Api>, "id">,
): string | undefined {
	if (value === "off") {
		return undefined;
	}
	if (!supportsAdaptiveAnthropicThinking(model)) {
		return value === "xhigh" ? "high" : value;
	}
	if (value === "minimal") {
		return "low";
	}
	if (value === "xhigh") {
		if (isOpus46Model(model)) {
			return "max";
		}
		if (isOpus47Model(model)) {
			return "xhigh";
		}
		return "high";
	}
	return value;
}

export const anthropicThinkingDescriptor: ProviderThinkingDescriptor<"anthropic-messages"> = {
	getOptions: (model) => getAnthropicThinkingOptions(model),
	toProviderValue: (value, model) => mapThinkingLevelToAnthropicValue(value, model),
};
