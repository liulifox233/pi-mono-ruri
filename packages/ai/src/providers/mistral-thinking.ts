import type { Model, ProviderThinkingDescriptor } from "../types.js";
import { createThinkingOption } from "./provider-thinking-shared.js";

function usesReasoningEffort(model: Pick<Model<"mistral-conversations">, "id">): boolean {
	return model.id === "mistral-small-2603" || model.id === "mistral-small-latest";
}

export const mistralThinkingDescriptor: ProviderThinkingDescriptor<"mistral-conversations"> = {
	getOptions(model) {
		return usesReasoningEffort(model)
			? [createThinkingOption("off"), createThinkingOption("high")]
			: [createThinkingOption("off"), createThinkingOption("high")];
	},
	toProviderValue(value, model) {
		if (value === "off") {
			return undefined;
		}
		return usesReasoningEffort(model) ? "high" : "reasoning";
	},
};
