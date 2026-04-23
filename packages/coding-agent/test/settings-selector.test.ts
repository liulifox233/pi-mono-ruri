import { describe, expect, it, vi } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.js";
import { createBuiltinSettingsRegistry, SettingsRegistry } from "../src/core/settings-registry.js";
import { SettingsSelectorComponent } from "../src/modes/interactive/components/settings-selector.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function moveDown(component: SettingsSelectorComponent, steps: number): void {
	for (let index = 0; index < steps; index++) {
		component.getSettingsList().handleInput("\x1b[B");
	}
}

function search(component: SettingsSelectorComponent, query: string): void {
	component.getSettingsList().handleInput(query);
}

function render(component: SettingsSelectorComponent): string[] {
	return component.getSettingsList().render(80);
}

describe("SettingsSelectorComponent", () => {
	it("can clear project overrides for direct-choice settings", () => {
		initTheme("dark");
		const settingsManager = SettingsManager.inMemory({ theme: "dark" });
		settingsManager.setScopedValue("project", "theme", "light");

		const component = new SettingsSelectorComponent(
			{
				registry: createBuiltinSettingsRegistry(),
				runtimeContext: {
					settingsManager,
					availableThemes: ["dark", "light"],
				},
				scope: "project",
			},
			{ onCancel: () => {} },
		);

		search(component, "theme");
		component.getSettingsList().handleInput(" ");

		expect(
			component
				.getSettingsList()
				.render(80)
				.some((line) => line.includes("Reset current scope")),
		).toBe(true);

		component.getSettingsList().handleInput("\x1b[B");
		component.getSettingsList().handleInput("\r");

		expect(settingsManager.hasScopedValue("project", "theme")).toBe(false);
	});

	it("can clear project overrides for toggle settings", () => {
		initTheme("dark");
		const settingsManager = SettingsManager.inMemory();
		settingsManager.setScopedValue("project", "terminal.showImages", false);

		const component = new SettingsSelectorComponent(
			{
				registry: createBuiltinSettingsRegistry(),
				runtimeContext: {
					settingsManager,
					availableThemes: ["dark", "light"],
				},
				scope: "project",
			},
			{ onCancel: () => {} },
		);

		search(component, "showimages");
		component.getSettingsList().handleInput(" ");

		expect(
			component
				.getSettingsList()
				.render(80)
				.some((line) => line.includes("Reset current scope")),
		).toBe(true);

		component.getSettingsList().handleInput("\x1b[B");
		component.getSettingsList().handleInput("\r");

		expect(settingsManager.hasScopedValue("project", "terminal.showImages")).toBe(false);
	});

	it("rejects invalid free-form number input", () => {
		initTheme("dark");
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "freeformNumber",
			type: "number",
			section: "main",
			label: "Free-form number",
			storage: { path: "extensions.demo.freeformNumber" },
		});

		const settingsManager = SettingsManager.inMemory();
		const component = new SettingsSelectorComponent(
			{
				registry,
				runtimeContext: { settingsManager },
				scope: "global",
			},
			{ onCancel: () => {} },
		);

		component.getSettingsList().handleInput(" ");
		component.getSettingsList().handleInput("abc");
		component.getSettingsList().handleInput("\r");

		expect(settingsManager.hasScopedValue("global", "extensions.demo.freeformNumber")).toBe(false);
	});

	it("can edit top-level free-form number settings from the main selector flow", () => {
		initTheme("dark");
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "freeformNumber",
			type: "number",
			section: "main",
			label: "Free-form number",
			storage: { path: "extensions.demo.freeformNumber" },
		});

		const settingsManager = SettingsManager.inMemory();
		const component = new SettingsSelectorComponent(
			{
				registry,
				runtimeContext: { settingsManager },
				scope: "global",
			},
			{ onCancel: () => {} },
		);

		component.getSettingsList().handleInput(" ");

		expect(render(component).some((line) => line.includes("Value"))).toBe(true);

		component.getSettingsList().handleInput(" ");
		component.getSettingsList().handleInput("27");
		component.getSettingsList().handleInput("\r");

		expect(settingsManager.getEffectiveValue("extensions.demo.freeformNumber")).toBe(27);
	});

	it("can clear project overrides for nested free-form child settings from the detail view", () => {
		initTheme("dark");
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "parentSetting",
			type: "select",
			section: "main",
			label: "Parent setting",
			storage: { path: "extensions.demo.parentSetting", defaultValue: "base" },
			options: [{ value: "base" }, { value: "alt" }],
			children: [
				{
					id: "nestedNumber",
					type: "number",
					label: "Nested number",
					section: "main",
					storage: { path: "extensions.demo.nestedNumber" },
				},
			],
		});

		const settingsManager = SettingsManager.inMemory();
		settingsManager.setScopedValue("project", "extensions.demo.nestedNumber", 42);
		const component = new SettingsSelectorComponent(
			{
				registry,
				runtimeContext: { settingsManager },
				scope: "project",
			},
			{ onCancel: () => {} },
		);

		component.getSettingsList().handleInput(" ");

		expect(
			component
				.getSettingsList()
				.render(80)
				.some((line) => line.includes("Reset Nested number")),
		).toBe(true);

		moveDown(component, 2);
		component.getSettingsList().handleInput(" ");

		expect(settingsManager.hasScopedValue("project", "extensions.demo.nestedNumber")).toBe(false);
	});

	it("includes nested settings in the main settings search", () => {
		initTheme("dark");
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "thinkingMode",
			type: "select",
			section: "main",
			label: "Thinking",
			storage: { path: "extensions.demo.thinkingMode", defaultValue: "normal" },
			options: [{ value: "normal" }, { value: "deep" }],
			children: [
				{
					id: "expertChild",
					type: "toggle",
					label: "Expert child",
					section: "main",
					storage: { path: "extensions.demo.expertChild", defaultValue: false },
				},
			],
		});

		const settingsManager = SettingsManager.inMemory();
		const component = new SettingsSelectorComponent(
			{
				registry,
				runtimeContext: { settingsManager },
				scope: "global",
			},
			{ onCancel: () => {} },
		);

		search(component, "expertchild");

		expect(
			component
				.getSettingsList()
				.render(80)
				.some((line) => line.includes("Thinking / Expert child")),
		).toBe(true);

		component.getSettingsList().handleInput(" ");

		expect(settingsManager.getEffectiveValue("extensions.demo.expertChild")).toBe(true);
	});

	it("can edit searched nested free-form number settings", () => {
		initTheme("dark");
		const registry = new SettingsRegistry();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "thinkingMode",
			type: "select",
			section: "main",
			label: "Thinking",
			storage: { path: "extensions.demo.thinkingMode", defaultValue: "normal" },
			options: [{ value: "normal" }, { value: "deep" }],
			children: [
				{
					id: "tokenBudget",
					type: "number",
					label: "Token budget",
					section: "main",
					storage: { path: "extensions.demo.tokenBudget" },
				},
			],
		});

		const settingsManager = SettingsManager.inMemory();
		const component = new SettingsSelectorComponent(
			{
				registry,
				runtimeContext: { settingsManager },
				scope: "global",
			},
			{ onCancel: () => {} },
		);

		search(component, "tokenbudget");
		component.getSettingsList().handleInput(" ");

		expect(render(component).some((line) => line.includes("Value"))).toBe(true);

		component.getSettingsList().handleInput(" ");
		component.getSettingsList().handleInput("8192");
		component.getSettingsList().handleInput("\r");

		expect(settingsManager.getEffectiveValue("extensions.demo.tokenBudget")).toBe(8192);
	});

	it("applies submenu-backed settings once", () => {
		initTheme("dark");
		const registry = new SettingsRegistry();
		const apply = vi.fn();
		registry.registerSection({ id: "main", label: "Main" });
		registry.register({
			id: "themeMode",
			type: "select",
			section: "main",
			label: "Theme mode",
			storage: { path: "extensions.demo.themeMode", defaultValue: "dark" },
			options: [{ value: "dark" }, { value: "light" }],
			apply,
		});

		const settingsManager = SettingsManager.inMemory();
		const component = new SettingsSelectorComponent(
			{
				registry,
				runtimeContext: { settingsManager },
				scope: "global",
			},
			{ onCancel: () => {} },
		);

		search(component, "thememode");
		component.getSettingsList().handleInput(" ");
		component.getSettingsList().handleInput("\x1b[B");
		component.getSettingsList().handleInput("\r");

		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply).toHaveBeenCalledWith("light", expect.anything(), "global");
		expect(settingsManager.getEffectiveValue("extensions.demo.themeMode")).toBe("light");
	});
});
