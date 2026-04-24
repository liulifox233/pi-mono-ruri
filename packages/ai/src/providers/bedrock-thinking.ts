import type { Model, ProviderThinkingDescriptor } from "../types.js";
import { anthropicThinkingDescriptor } from "./anthropic-thinking.js";
import { createThinkingOption } from "./provider-thinking-shared.js";

function isAnthropicBedrockModel(model: Pick<Model<"bedrock-converse-stream">, "id">): boolean {
	const id = model.id.toLowerCase();
	return id.includes("anthropic.claude") || id.includes("anthropic/claude");
}

export const bedrockThinkingDescriptor: ProviderThinkingDescriptor<"bedrock-converse-stream"> = {
	getOptions(model) {
		if (isAnthropicBedrockModel(model)) {
			return anthropicThinkingDescriptor.getOptions(model as never);
		}
		return [
			createThinkingOption("off"),
			createThinkingOption("minimal"),
			createThinkingOption("low"),
			createThinkingOption("medium"),
			createThinkingOption("high"),
		];
	},
	toProviderValue(value, model) {
		if (isAnthropicBedrockModel(model)) {
			return anthropicThinkingDescriptor.toProviderValue(value, model as never);
		}
		if (value === "off") {
			return undefined;
		}
		return value === "xhigh" ? "high" : value;
	},
};
