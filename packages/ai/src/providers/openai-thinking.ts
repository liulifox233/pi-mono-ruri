import type { Api, Model, ProviderThinkingDescriptor, SelectableThinkingLevel, ThinkingLevel } from "../types.js";
import { createThinkingOption, mapProviderThinkingValue } from "./provider-thinking-shared.js";

function getOpenAIModelId(model: Pick<Model<Api>, "id">): string {
	return model.id.includes("/") ? model.id.split("/").pop()!.toLowerCase() : model.id.toLowerCase();
}

function supportsOpenAIXhighModel(model: Pick<Model<Api>, "id">): boolean {
	const id = getOpenAIModelId(model);
	return id.startsWith("gpt-5.2") || id.startsWith("gpt-5.3") || id.startsWith("gpt-5.4");
}

function mapThinkingLevelToOpenAIReasoning(
	value: SelectableThinkingLevel,
	model: Pick<Model<Api>, "id">,
): string | undefined {
	if (value === "off") {
		return undefined;
	}
	if (value === "xhigh" && !supportsOpenAIXhighModel(model)) {
		return "high";
	}
	return value;
}

function getOpenAIReasoningOptions(model: Pick<Model<Api>, "id">) {
	return [
		createThinkingOption("off"),
		createThinkingOption("minimal"),
		createThinkingOption("low"),
		createThinkingOption("medium"),
		createThinkingOption("high"),
		...(supportsOpenAIXhighModel(model) ? [createThinkingOption("xhigh")] : []),
	];
}

function createOpenAIDescriptor<TApi extends Api>(): ProviderThinkingDescriptor<TApi> {
	return {
		getOptions: (model) => getOpenAIReasoningOptions(model),
		toProviderValue: (value, model) => mapThinkingLevelToOpenAIReasoning(value, model),
	};
}

function isOpenAICodexMini(model: Pick<Model<Api>, "id">): boolean {
	return getOpenAIModelId(model) === "gpt-5.1-codex-mini";
}

function isOpenAICodexGpt51(model: Pick<Model<Api>, "id">): boolean {
	return getOpenAIModelId(model) === "gpt-5.1";
}

function getOpenAICodexReasoningOptions(model: Pick<Model<Api>, "id">) {
	if (isOpenAICodexMini(model)) {
		return [createThinkingOption("off"), createThinkingOption("medium"), createThinkingOption("high")];
	}

	if (supportsOpenAIXhighModel(model)) {
		return [
			createThinkingOption("off"),
			createThinkingOption("low"),
			createThinkingOption("medium"),
			createThinkingOption("high"),
			createThinkingOption("xhigh"),
		];
	}

	return [
		createThinkingOption("off"),
		createThinkingOption("minimal"),
		createThinkingOption("low"),
		createThinkingOption("medium"),
		createThinkingOption("high"),
	];
}

function mapThinkingLevelToOpenAICodexReasoning(
	value: SelectableThinkingLevel,
	model: Pick<Model<Api>, "id">,
): string | undefined {
	if (value === "off") {
		return undefined;
	}
	if (isOpenAICodexMini(model)) {
		return value === "high" || value === "xhigh" ? "high" : "medium";
	}
	if (supportsOpenAIXhighModel(model)) {
		if (value === "minimal") {
			return "low";
		}
		return value;
	}
	if (isOpenAICodexGpt51(model) && value === "xhigh") {
		return "high";
	}
	return value === "xhigh" ? "high" : value;
}

export const openAIResponsesThinkingDescriptor = createOpenAIDescriptor<"openai-responses">();

export const openAICompletionsThinkingDescriptor = createOpenAIDescriptor<"openai-completions">();

export const azureOpenAIResponsesThinkingDescriptor = createOpenAIDescriptor<"azure-openai-responses">();

export const openAICodexResponsesThinkingDescriptor: ProviderThinkingDescriptor<"openai-codex-responses"> = {
	getOptions: (model) => getOpenAICodexReasoningOptions(model),
	toProviderValue: (value, model) => mapThinkingLevelToOpenAICodexReasoning(value, model),
};

export function mapOpenAIReasoningForSimpleStream<TApi extends Api>(
	descriptor: ProviderThinkingDescriptor<TApi>,
	model: Model<TApi>,
	reasoning: ThinkingLevel | undefined,
): string | undefined {
	if (!reasoning) {
		return undefined;
	}
	return mapProviderThinkingValue(descriptor, reasoning, model);
}
