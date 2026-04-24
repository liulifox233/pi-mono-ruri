import type {
	Api,
	Model,
	ProviderThinkingDescriptor,
	ProviderThinkingOption,
	SelectableThinkingLevel,
} from "../types.js";

export function createThinkingOption(
	level: SelectableThinkingLevel,
	label?: string,
	description?: string,
): ProviderThinkingOption {
	return {
		level,
		...(label ? { label } : {}),
		...(description ? { description } : {}),
	};
}

export function mapProviderThinkingValue<TApi extends Api>(
	descriptor: ProviderThinkingDescriptor<TApi>,
	value: SelectableThinkingLevel,
	model: Model<TApi>,
): string | undefined {
	return descriptor.toProviderValue(value, model);
}
