import { type Api, type Model, registerApiProvider, unregisterApiProviders } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.js";
import {
	createBuiltinSettingsRegistry,
	type SettingDefinition,
	type SettingOption,
	SettingsRegistry,
} from "../src/core/settings-registry.js";

const openAi54Model = {
	id: "gpt-5.4",
	name: "GPT-5.4",
	api: "openai-responses",
	provider: "openai",
	baseUrl: "https://api.openai.com/v1",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200000,
	maxTokens: 32000,
} satisfies Model<"openai-responses">;

const openAi51Model = {
	...openAi54Model,
	id: "gpt-5.1",
	name: "GPT-5.1",
} satisfies Model<"openai-responses">;

const anthropic46Model = {
	id: "claude-opus-4-6",
	name: "Claude Opus 4.6",
	api: "anthropic-messages",
	provider: "anthropic",
	baseUrl: "https://api.anthropic.com",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200000,
	maxTokens: 32000,
} satisfies Model<"anthropic-messages">;

describe("SettingsRegistry", () => {
	it("applies and reads nested child settings", () => {
		const registry = new SettingsRegistry();
		const settingsManager = SettingsManager.inMemory();
		const ctx = { settingsManager, settingsNamespace: "demo" as const };

		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "parent",
			type: "select",
			section: "main",
			label: "Parent",
			namespace: "demo",
			options: [{ value: "on" }, { value: "off" }],
			children: [
				{
					id: "child",
					type: "select",
					section: "main",
					label: "Child",
					storage: { defaultValue: "off" },
					options: [{ value: "off" }, { value: "on" }],
				},
			],
		});

		expect(registry.get("child", ctx)).toBe("off");

		registry.apply("demo:parent/child", "on", "global", ctx);

		expect(settingsManager.getEffectiveValue("extensionSettings.demo:parent/child")).toBe("on");
		expect(registry.get("child", ctx)).toBe("on");
		expect(registry.hasScopedValue("demo:parent/child", "global", ctx)).toBe(true);

		registry.unset("demo:parent/child", "global", ctx);

		expect(settingsManager.getEffectiveValue("extensionSettings.demo:parent/child")).toBeUndefined();
		expect(registry.hasScopedValue("demo:parent/child", "global", ctx)).toBe(false);
		expect(registry.get("child", ctx)).toBe("off");
	});

	it("merges extension settings and augmentations", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory({
			defaultThinkingLevel: "medium",
		});

		registry.registerSection({ id: "provider", label: "Provider", order: 5 });
		registry.register({
			id: "providerMode",
			type: "select",
			section: "provider",
			label: "Provider mode",
			order: 10,
			storage: { path: "extensions.demo.providerMode", defaultValue: "safe" },
			options: [{ value: "safe" }, { value: "fast" }],
		});
		registry.augment({
			targetId: "theme",
			description: "Extended by provider settings.",
			namespace: "demo",
			children: [
				{
					id: "providerThinkingEffort",
					type: "select",
					section: "model",
					label: "Thinking effort",
					order: 1,
					storage: { defaultValue: "medium" },
					options: [{ value: "low" }, { value: "medium" }, { value: "high" }],
				},
			],
			options: [{ value: "ultra" }],
		});

		const sections = registry.resolve({ settingsManager, availableThemes: ["dark"] }, "global");
		const providerSection = sections.find((section) => section.id === "provider");
		const theme = sections.flatMap((section) => section.items).find((item) => item.id === "theme");

		expect(providerSection?.items[0]?.id).toBe("providerMode");
		expect(theme?.options.map((option) => option.value)).toContain("ultra");
		expect(theme?.children[0]?.id).toBe("demo:theme/providerThinkingEffort");
		expect(theme?.description).toBe("Extended by provider settings.");

		registry.apply("demo:theme/providerThinkingEffort", "high", "global", {
			settingsManager,
			availableThemes: ["dark"],
		});

		expect(settingsManager.getEffectiveValue("extensionSettings.demo:theme/providerThinkingEffort")).toBe("high");
		expect(registry.get("providerThinkingEffort", { settingsManager, settingsNamespace: "demo" })).toBe("high");
	});

	it("keeps the first duplicate option and child and records diagnostics", () => {
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "foo",
			type: "select",
			section: "main",
			label: "Foo",
			options: [{ value: "a" }],
		});

		const duplicateChild: SettingDefinition = {
			id: "child",
			type: "toggle",
			section: "main",
			label: "Child",
		};
		const duplicateOption: SettingOption = { value: "a" };

		registry.augment({
			targetId: "foo",
			options: [duplicateOption],
			children: [duplicateChild, duplicateChild],
		});

		const sections = registry.resolve({ settingsManager: SettingsManager.inMemory() }, "global");
		const foo = sections[0]?.items[0];

		expect(foo?.options.filter((option) => option.value === "a")).toHaveLength(1);
		expect(foo?.children.filter((child) => child.id === "foo/child")).toHaveLength(1);
		expect(registry.getDiagnostics().map((diagnostic) => diagnostic.message)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('Duplicate option "a"'),
				expect.stringContaining('Duplicate child setting "foo/child"'),
			]),
		);
	});

	it("hides settings that are not writable in the current scope", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory();

		const globalSections = registry.resolve({ settingsManager }, "global");
		const projectSections = registry.resolve({ settingsManager }, "project");

		const globalIds = new Set(globalSections.flatMap((section) => section.items.map((item) => item.id)));
		const projectIds = new Set(projectSections.flatMap((section) => section.items.map((item) => item.id)));

		expect(globalIds.has("collapseChangelog")).toBe(true);
		expect(globalIds.has("enableInstallTelemetry")).toBe(true);
		expect(globalIds.has("showHardwareCursor")).toBe(true);
		expect(globalIds.has("clearOnShrink")).toBe(true);
		expect(globalIds.has("showTerminalProgress")).toBe(true);

		expect(projectIds.has("collapseChangelog")).toBe(false);
		expect(projectIds.has("enableInstallTelemetry")).toBe(false);
		expect(projectIds.has("showHardwareCursor")).toBe(false);
		expect(projectIds.has("clearOnShrink")).toBe(false);
		expect(projectIds.has("showTerminalProgress")).toBe(false);
	});

	it("hides child settings that are not writable in the current scope", () => {
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "parent",
			type: "select",
			section: "main",
			label: "Parent",
			options: [{ value: "on" }, { value: "off" }],
			children: [
				{
					id: "globalChild",
					type: "toggle",
					section: "main",
					label: "Global child",
					storage: { scopes: ["global"] },
				},
				{
					id: "projectChild",
					type: "toggle",
					section: "main",
					label: "Project child",
					storage: { scopes: ["project"] },
				},
				{
					id: "sharedChild",
					type: "toggle",
					section: "main",
					label: "Shared child",
				},
			],
		});

		const globalParent = registry
			.resolve({ settingsManager: SettingsManager.inMemory() }, "global")[0]
			?.items.find((item) => item.id === "parent");
		const projectParent = registry
			.resolve({ settingsManager: SettingsManager.inMemory() }, "project")[0]
			?.items.find((item) => item.id === "parent");

		expect(globalParent?.children.map((child) => child.id)).toEqual(["parent/globalChild", "parent/sharedChild"]);
		expect(projectParent?.children.map((child) => child.id)).toEqual(["parent/projectChild", "parent/sharedChild"]);
	});

	it("sorts nested child settings by order after applying augmentations", () => {
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "parent",
			type: "select",
			section: "main",
			label: "Parent",
			options: [{ value: "on" }, { value: "off" }],
			children: [
				{
					id: "declaredLast",
					type: "toggle",
					section: "main",
					label: "Declared last",
					order: 30,
				},
				{
					id: "declaredFirst",
					type: "toggle",
					section: "main",
					label: "Declared first",
					order: 10,
				},
			],
		});
		registry.augment({
			targetId: "parent",
			children: [
				{
					id: "augmentedMiddle",
					type: "toggle",
					section: "main",
					label: "Augmented middle",
					order: 20,
				},
			],
		});

		const parent = registry
			.resolve({ settingsManager: SettingsManager.inMemory() }, "global")[0]
			?.items.find((item) => item.id === "parent");

		expect(parent?.children.map((child) => child.id)).toEqual([
			"parent/declaredFirst",
			"parent/augmentedMiddle",
			"parent/declaredLast",
		]);
	});

	it("shows the global value in global scope even when a project override exists", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory({ theme: "dark" });
		settingsManager.setScopedValue("project", "theme", "light");

		const theme = registry
			.resolve(
				{
					settingsManager,
					availableThemes: ["dark", "light"],
				},
				"global",
			)
			.flatMap((section) => section.items)
			.find((item) => item.id === "theme");

		expect(theme?.currentValue).toBe("dark");
		expect(theme?.effectiveValue).toBe("light");
		expect(theme?.scopedValue).toBe("dark");
	});

	it("reapplies the new effective value when resetting an override", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory();
		settingsManager.setScopedValue("project", "terminal.showImages", false);
		const setShowImages = vi.fn();

		registry.unset("showImages", "project", {
			settingsManager,
			runtime: { setShowImages },
		});

		expect(settingsManager.hasScopedValue("project", "terminal.showImages")).toBe(false);
		expect(settingsManager.hasScopedValue("global", "terminal.showImages")).toBe(false);
		expect(setShowImages).toHaveBeenCalledWith(true, "project");
	});

	it("resets runtime-backed settings to the persisted inherited value", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory({ defaultThinkingLevel: "medium" });
		settingsManager.setScopedValue("project", "defaultThinkingLevel", "high");
		const setThinkingLevel = vi.fn();

		registry.unset("thinking", "project", {
			settingsManager,
			model: openAi54Model,
			runtime: {
				getThinkingLevel: () => "high",
				setThinkingLevel,
			},
		});

		expect(settingsManager.hasScopedValue("project", "defaultThinkingLevel")).toBe(false);
		expect(settingsManager.getEffectiveValue("defaultThinkingLevel")).toBe("medium");
		expect(setThinkingLevel).toHaveBeenCalledWith("medium", "project");
	});

	it("stores default extension settings outside the top-level extensions array", () => {
		const registry = new SettingsRegistry();
		const settingsManager = SettingsManager.inMemory({ extensions: ["/demo/alpha.ts"] });
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "enabled",
			type: "toggle",
			section: "main",
			label: "Enabled",
			namespace: "alpha",
			storage: { defaultValue: false },
		});

		registry.apply("alpha:enabled", true, "global", { settingsManager });

		expect(settingsManager.getExtensionPaths()).toEqual(["/demo/alpha.ts"]);
		expect(settingsManager.getEffectiveValue("extensions")).toEqual(["/demo/alpha.ts"]);
		expect(settingsManager.getEffectiveValue("extensionSettings.alpha:enabled")).toBe(true);
	});

	it("keeps same setting ids distinct across extension namespaces", () => {
		const registry = new SettingsRegistry();
		const settingsManager = SettingsManager.inMemory();
		registry.registerSection({ id: "extensions", label: "Extensions" });
		registry.register({
			id: "enabled",
			type: "toggle",
			section: "extensions",
			label: "Alpha enabled",
			namespace: "alpha",
		});
		registry.register({
			id: "enabled",
			type: "toggle",
			section: "extensions",
			label: "Beta enabled",
			namespace: "beta",
		});
		settingsManager.setScopedValue("global", "extensionSettings.alpha:enabled", true);
		settingsManager.setScopedValue("global", "extensionSettings.beta:enabled", false);

		const ids = registry.resolve({ settingsManager }, "global")[0]?.items.map((item) => item.id);

		expect(ids).toEqual(["alpha:enabled", "beta:enabled"]);
		expect(registry.get("enabled", { settingsManager, settingsNamespace: "alpha" })).toBe(true);
		expect(registry.get("enabled", { settingsManager, settingsNamespace: "beta" })).toBe(false);
	});

	it("resolves thinking from canonical defaults and model capabilities", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory({ defaultThinkingLevel: "high" });

		expect(
			registry.get("thinking", {
				settingsManager,
				model: openAi54Model,
				runtime: { getThinkingLevel: () => "off" },
			}),
		).toBe("high");
	});

	it("shows xhigh only for supported OpenAI GPT models", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory();

		const gpt54 = registry
			.resolve({ settingsManager, model: openAi54Model }, "global")
			.flatMap((section) => section.items)
			.find((item) => item.id === "thinking");
		const gpt51 = registry
			.resolve({ settingsManager, model: openAi51Model }, "global")
			.flatMap((section) => section.items)
			.find((item) => item.id === "thinking");

		expect(gpt54?.options.map((option) => option.value)).toContain("xhigh");
		expect(gpt51?.options.map((option) => option.value)).not.toContain("xhigh");
	});

	it("stores canonical thinking levels even when provider wire values differ", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory({ defaultThinkingLevel: "high" });
		const setThinkingLevel = vi.fn();

		const anthropicSetting = registry
			.resolve({ settingsManager, model: anthropic46Model }, "global")
			.flatMap((section) => section.items)
			.find((item) => item.id === "thinking");

		expect(anthropicSetting?.effectiveValue).toBe("high");

		registry.apply("thinking", "xhigh", "global", {
			settingsManager,
			model: anthropic46Model,
			runtime: { setThinkingLevel },
		});

		expect(settingsManager.getEffectiveValue("defaultThinkingLevel")).toBe("xhigh");
		expect(setThinkingLevel).toHaveBeenCalledWith("xhigh", "global");
	});

	it("resolves provider thinking settings from providers registered after registry creation", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory();
		const sourceId = "test:dynamic-thinking";
		const stream = () => undefined as never;
		const customModel = {
			id: "demo-reasoner",
			name: "Demo Reasoner",
			api: "demo-thinking" as Api,
			provider: "demo-provider",
			baseUrl: "https://example.com",
			reasoning: true,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 1000,
			maxTokens: 1000,
		} satisfies Model<Api>;

		registerApiProvider(
			{
				api: "demo-thinking" as Api,
				stream,
				streamSimple: stream,
				thinking: {
					getOptions: () => [{ level: "off" }, { level: "high", label: "Turbo" }],
					toProviderValue: (value) => (value === "off" ? undefined : "turbo"),
				},
			},
			sourceId,
		);

		try {
			const dynamicSetting = registry
				.resolve({ settingsManager, model: customModel }, "global")
				.flatMap((section) => section.items)
				.find((item) => item.id === "thinking");

			expect(dynamicSetting?.label).toBe("Thinking");
			expect(dynamicSetting?.options.map((option) => option.value)).toEqual(["off", "high"]);
			expect(dynamicSetting?.options.find((option) => option.value === "high")?.label).toBe("Turbo");
		} finally {
			unregisterApiProviders(sourceId);
		}
	});

	it("preserves declared option order", () => {
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "ordered",
			type: "select",
			section: "main",
			label: "Ordered",
			options: [{ value: "10" }, { value: "3" }, { value: "20" }],
		});

		const ordered = registry.resolve({ settingsManager: SettingsManager.inMemory() }, "global")[0]?.items[0];

		expect(ordered?.options.map((option) => option.value)).toEqual(["10", "3", "20"]);
	});

	it("skips runtime apply when a project override still determines the effective value", () => {
		const registry = createBuiltinSettingsRegistry();
		const settingsManager = SettingsManager.inMemory({ theme: "dark" });
		const applyTheme = vi.fn();
		settingsManager.setScopedValue("project", "theme", "light");

		registry.apply("theme", "solarized", "global", {
			settingsManager,
			runtime: { applyTheme },
		});

		expect(settingsManager.getScopedValue("global", "theme")).toBe("solarized");
		expect(settingsManager.getEffectiveValue("theme")).toBe("light");
		expect(applyTheme).not.toHaveBeenCalled();
	});

	it("keeps extension setting inheritance across global and project scopes", () => {
		const registry = new SettingsRegistry();
		const settingsManager = SettingsManager.inMemory();
		const ctx = { settingsManager, settingsNamespace: "demo" as const };
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "foo",
			type: "toggle",
			section: "main",
			label: "Foo",
			namespace: "demo",
		});
		registry.register({
			id: "bar",
			type: "toggle",
			section: "main",
			label: "Bar",
			namespace: "demo",
		});

		registry.apply("demo:foo", true, "global", ctx);
		registry.apply("demo:bar", false, "project", ctx);

		expect(settingsManager.getEffectiveValue("extensionSettings.demo:foo")).toBe(true);
		expect(settingsManager.getEffectiveValue("extensionSettings.demo:bar")).toBe(false);
		expect(registry.get("foo", ctx)).toBe(true);
		expect(registry.get("bar", ctx)).toBe(false);
	});

	it("disambiguates child ids by parent for registry ids and storage keys", () => {
		const registry = new SettingsRegistry();
		const settingsManager = SettingsManager.inMemory();
		const ctx = { settingsManager, settingsNamespace: "demo" as const };
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "parentA",
			type: "toggle",
			section: "main",
			label: "Parent A",
			namespace: "demo",
			children: [
				{
					id: "enabled",
					type: "toggle",
					section: "main",
					label: "Enabled A",
				},
			],
		});
		registry.register({
			id: "parentB",
			type: "toggle",
			section: "main",
			label: "Parent B",
			namespace: "demo",
			children: [
				{
					id: "enabled",
					type: "toggle",
					section: "main",
					label: "Enabled B",
				},
			],
		});

		const ids = registry
			.resolve(ctx, "global")[0]
			?.items.flatMap((item) => [item.id, ...item.children.map((child) => child.id)]);

		registry.apply("demo:parentA/enabled", true, "global", ctx);
		registry.apply("demo:parentB/enabled", false, "global", ctx);

		expect(ids).toEqual(["demo:parentA", "demo:parentA/enabled", "demo:parentB", "demo:parentB/enabled"]);
		expect(settingsManager.getEffectiveValue("extensionSettings.demo:parentA/enabled")).toBe(true);
		expect(settingsManager.getEffectiveValue("extensionSettings.demo:parentB/enabled")).toBe(false);
		expect(registry.get("enabled", ctx)).toBe(true);
	});
});
