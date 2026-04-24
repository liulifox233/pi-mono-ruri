import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { type Api, getApiProvider, type Model, type ProviderThinkingDescriptor } from "@mariozechner/pi-ai";
import { DEFAULT_THINKING_LEVEL } from "./defaults.js";
import type { SettingsManager, SettingsScope } from "./settings-manager.js";
import type { SettingDefinition, SettingOption } from "./settings-registry.js";

const THINKING_LEVEL_ORDER: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && THINKING_LEVEL_ORDER.includes(value as ThinkingLevel);
}

function getRequiredThinkingDescriptor(model: Model<Api>): ProviderThinkingDescriptor<Api> {
	const descriptor = getApiProvider(model.api)?.thinking;
	if (!descriptor) {
		throw new Error(`Reasoning-capable API "${model.api}" is missing a thinking descriptor.`);
	}
	return descriptor;
}

function getStoredThinkingLevel(settingsManager: SettingsManager, scope: SettingsScope): ThinkingLevel | undefined {
	const stored = settingsManager.getScopedValue(scope, "defaultThinkingLevel");
	return isThinkingLevel(stored) ? stored : undefined;
}

function clampThinkingLevel(level: ThinkingLevel, availableLevels: ThinkingLevel[]): ThinkingLevel {
	const available = new Set(availableLevels);
	const requestedIndex = THINKING_LEVEL_ORDER.indexOf(level);
	if (requestedIndex === -1) {
		return availableLevels[0] ?? "off";
	}
	for (let i = requestedIndex; i < THINKING_LEVEL_ORDER.length; i++) {
		const candidate = THINKING_LEVEL_ORDER[i];
		if (available.has(candidate)) {
			return candidate;
		}
	}
	for (let i = requestedIndex - 1; i >= 0; i--) {
		const candidate = THINKING_LEVEL_ORDER[i];
		if (available.has(candidate)) {
			return candidate;
		}
	}
	return availableLevels[0] ?? "off";
}

export function getAvailableThinkingLevelsForModel(model: Model<Api> | undefined): ThinkingLevel[] {
	if (!model?.reasoning) {
		return ["off"];
	}
	const descriptor = getRequiredThinkingDescriptor(model);
	const levels = descriptor.getOptions(model).map((option) => option.level);
	return Array.from(new Set(["off", ...levels.filter((level): level is ThinkingLevel => isThinkingLevel(level))]));
}

export function getEffectiveThinkingLevelForModel(
	settingsManager: SettingsManager,
	model: Model<Api> | undefined,
): ThinkingLevel | undefined {
	if (!model) {
		return undefined;
	}
	if (!model.reasoning) {
		return "off";
	}
	const stored = settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	return clampThinkingLevel(stored, getAvailableThinkingLevelsForModel(model));
}

function getScopedThinkingLevelForModel(
	settingsManager: SettingsManager,
	model: Model<Api> | undefined,
	scope: SettingsScope,
): ThinkingLevel | undefined {
	if (!model) {
		return getStoredThinkingLevel(settingsManager, scope);
	}
	if (!model.reasoning) {
		return "off";
	}
	const stored = getStoredThinkingLevel(settingsManager, scope);
	return stored ? clampThinkingLevel(stored, getAvailableThinkingLevelsForModel(model)) : undefined;
}

function getThinkingSettingOptions(model: Model<Api> | undefined): SettingOption[] {
	if (!model) {
		return THINKING_LEVEL_ORDER.map((level) => ({ value: level }));
	}
	if (!model.reasoning) {
		return [{ value: "off" }];
	}
	const descriptor = getRequiredThinkingDescriptor(model);
	const byLevel = new Map<ThinkingLevel, SettingOption>([["off", { value: "off" }]]);
	for (const option of descriptor.getOptions(model)) {
		if (!isThinkingLevel(option.level)) {
			continue;
		}
		byLevel.set(option.level, {
			value: option.level,
			...(option.label ? { label: option.label } : {}),
			...(option.description ? { description: option.description } : {}),
		});
	}
	return THINKING_LEVEL_ORDER.filter((level) => byLevel.has(level)).map((level) => byLevel.get(level)!);
}

export function persistThinkingLevel(
	settingsManager: SettingsManager,
	level: ThinkingLevel,
	scope: SettingsScope,
): void {
	settingsManager.setScopedValue(scope, "defaultThinkingLevel", level);
}

export function createThinkingSettingDefinition(): SettingDefinition {
	return {
		id: "thinking",
		type: "select",
		section: "model",
		order: 10,
		label: "Thinking",
		description: "Reasoning depth for the current model.",
		storage: { path: "defaultThinkingLevel", defaultValue: DEFAULT_THINKING_LEVEL },
		options: (ctx) => getThinkingSettingOptions(ctx.model),
		getValue: (ctx) =>
			ctx.model
				? (getEffectiveThinkingLevelForModel(ctx.settingsManager, ctx.model) ?? "off")
				: (ctx.settingsManager.getDefaultThinkingLevel() ??
					ctx.runtime?.getThinkingLevel?.() ??
					DEFAULT_THINKING_LEVEL),
		getScopedValue: (ctx, scope) => getScopedThinkingLevelForModel(ctx.settingsManager, ctx.model, scope),
		apply: (value, ctx, scope) => {
			ctx.runtime?.setThinkingLevel?.(value as ThinkingLevel, scope);
			return undefined;
		},
	};
}
