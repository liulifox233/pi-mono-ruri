import type { Api, Model, ProviderThinkingDescriptor, SelectableThinkingLevel } from "../types.js";
import { createThinkingOption } from "./provider-thinking-shared.js";

function getModelId(model: Pick<Model<Api>, "id">): string {
	return model.id.toLowerCase();
}

function isGemma4Model(model: Pick<Model<Api>, "id">): boolean {
	return /gemma-?4/.test(getModelId(model));
}

function isGemini3ProModel(model: Pick<Model<Api>, "id">): boolean {
	return /gemini-3(?:\.\d+)?-pro/.test(getModelId(model));
}

function isGemini3FlashModel(model: Pick<Model<Api>, "id">): boolean {
	return /gemini-3(?:\.\d+)?-flash/.test(getModelId(model));
}

function getGoogleThinkingOptions(model: Pick<Model<Api>, "id">) {
	if (isGemini3ProModel(model)) {
		return [createThinkingOption("off"), createThinkingOption("low"), createThinkingOption("high")];
	}
	if (isGemini3FlashModel(model)) {
		return [
			createThinkingOption("off"),
			createThinkingOption("minimal"),
			createThinkingOption("low"),
			createThinkingOption("medium"),
			createThinkingOption("high"),
		];
	}
	if (isGemma4Model(model)) {
		return [createThinkingOption("off"), createThinkingOption("minimal"), createThinkingOption("high")];
	}
	return [
		createThinkingOption("off"),
		createThinkingOption("minimal"),
		createThinkingOption("low"),
		createThinkingOption("medium"),
		createThinkingOption("high"),
	];
}

function mapThinkingLevelToGoogleValue(
	value: SelectableThinkingLevel,
	model: Pick<Model<Api>, "id">,
): string | undefined {
	if (value === "off") {
		return undefined;
	}
	if (isGemini3ProModel(model)) {
		return value === "minimal" || value === "low" ? "LOW" : "HIGH";
	}
	if (isGemini3FlashModel(model)) {
		switch (value) {
			case "minimal":
				return "MINIMAL";
			case "low":
				return "LOW";
			case "medium":
				return "MEDIUM";
			case "high":
			case "xhigh":
				return "HIGH";
		}
	}
	if (isGemma4Model(model)) {
		return value === "minimal" || value === "low" ? "MINIMAL" : "HIGH";
	}
	return value === "xhigh" ? "high" : value;
}

function createGoogleDescriptor<TApi extends Api>(): ProviderThinkingDescriptor<TApi> {
	return {
		getOptions: (model) => getGoogleThinkingOptions(model),
		toProviderValue: (value, model) => mapThinkingLevelToGoogleValue(value, model),
	};
}

export const googleThinkingDescriptor = createGoogleDescriptor<"google-generative-ai">();

export const googleGeminiCliThinkingDescriptor = createGoogleDescriptor<"google-gemini-cli">();

export const googleVertexThinkingDescriptor = createGoogleDescriptor<"google-vertex">();
