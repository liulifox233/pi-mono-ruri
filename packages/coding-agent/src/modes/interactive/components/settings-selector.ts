import {
	Container,
	getKeybindings,
	Input,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SettingItem,
	SettingsList,
	type SettingsListTheme,
	Spacer,
	Text,
} from "@mariozechner/pi-tui";
import type { SettingsScope } from "../../../core/settings-manager.js";
import type {
	ResolvedSettingNode,
	ResolvedSettingsSection,
	SettingsRegistry,
	SettingsRuntimeContext,
	SettingValue,
} from "../../../core/settings-registry.js";
import { getSelectListTheme, getSettingsListTheme, theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

const SETTINGS_SUBMENU_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};
const RESET_SETTING_VALUE = "__unset";
const INVALID_NUMBER_ERROR = "Enter a valid finite number.";

type ParsedSettingValue = { ok: true; value: SettingValue } | { ok: false; error: string };

function isSelfEditableNode(node: ResolvedSettingNode): boolean {
	return node.type === "text" || (node.type === "number" && node.options.length === 0);
}

function hasDetailSelfItem(node: ResolvedSettingNode): boolean {
	return isSelfEditableNode(node) || node.type === "toggle" || node.options.length > 0;
}

function formatSettingValue(node: ResolvedSettingNode): string {
	const value = node.currentValue;
	let rendered = typeof value === "boolean" ? (value ? "On" : "Off") : value === undefined ? "Unset" : String(value);
	if (node.inherited) {
		rendered += " (inherited)";
	}
	return rendered;
}

function stringifyForInput(value: SettingValue | undefined): string {
	if (value === undefined) return "";
	return String(value);
}

function parseSettingValue(node: ResolvedSettingNode, raw: string): ParsedSettingValue {
	if (node.type === "toggle") {
		return { ok: true, value: raw === "true" };
	}
	if (node.type === "number") {
		const trimmed = raw.trim();
		if (!trimmed) {
			return { ok: false, error: INVALID_NUMBER_ERROR };
		}
		const value = Number(trimmed);
		if (!Number.isFinite(value)) {
			return { ok: false, error: INVALID_NUMBER_ERROR };
		}
		return { ok: true, value };
	}
	return { ok: true, value: raw };
}

function toChoiceItems(node: ResolvedSettingNode): SelectItem[] {
	if (node.type === "toggle") {
		return [
			{ value: "true", label: "On" },
			{ value: "false", label: "Off" },
		];
	}
	return node.options.map((option) => ({
		value: option.value,
		label: option.label ?? option.value,
		description: option.description,
	}));
}

function canUnsetNode(
	node: ResolvedSettingNode,
	registry: SettingsRegistry,
	scope: SettingsScope,
	runtimeContext: SettingsRuntimeContext,
): boolean {
	return scope === "project"
		? node.scopedValue !== undefined
		: registry.hasScopedValue(node.id, "global", runtimeContext);
}

function buildChoiceItems(node: ResolvedSettingNode, allowUnset: boolean): SelectItem[] {
	const items = toChoiceItems(node);
	if (allowUnset) {
		items.push({
			value: RESET_SETTING_VALUE,
			label: "Reset current scope",
			description: "Remove the value from the current scope.",
		});
	}
	return items;
}

function applySettingSelection(
	registry: SettingsRegistry,
	node: ResolvedSettingNode,
	scope: SettingsScope,
	runtimeContext: SettingsRuntimeContext,
	value: string,
): string | undefined {
	if (value === RESET_SETTING_VALUE) {
		registry.unset(node.id, scope, runtimeContext);
		return undefined;
	}
	const parsed = parseSettingValue(node, value);
	if (!parsed.ok) {
		return parsed.error;
	}
	registry.apply(node.id, parsed.value, scope, runtimeContext);
	return undefined;
}

class ValueEditorComponent extends Container {
	private readonly input: Input;
	private readonly errorText: Text;

	constructor(node: ResolvedSettingNode, onSubmit: (value: string) => string | undefined, onCancel: () => void) {
		super();
		this.addChild(new Text(theme.bold(theme.fg("accent", node.label)), 0, 0));
		if (node.description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", node.description), 0, 0));
		}
		this.addChild(new Spacer(1));
		this.input = new Input();
		this.input.setValue(stringifyForInput(node.currentValue));
		this.input.onSubmit = (value) => {
			const error = onSubmit(value);
			this.errorText.setText(error ? theme.fg("error", error) : "");
		};
		this.input.onEscape = onCancel;
		this.addChild(this.input);
		this.addChild(new Spacer(1));
		this.errorText = new Text("", 0, 0);
		this.addChild(this.errorText);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to save · Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.input.handleInput(data);
	}
}

class ChoiceEditorComponent extends Container {
	private readonly selectList: SelectList;

	constructor(
		title: string,
		description: string | undefined,
		items: SelectItem[],
		currentValue: string,
		onSelect: (value: string) => void,
		onCancel: () => void,
	) {
		super();
		this.addChild(new Text(theme.bold(theme.fg("accent", title)), 0, 0));
		if (description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", description), 0, 0));
		}
		this.addChild(new Spacer(1));
		this.selectList = new SelectList(
			items,
			Math.min(items.length, 10),
			getSelectListTheme(),
			SETTINGS_SUBMENU_SELECT_LIST_LAYOUT,
		);
		const index = items.findIndex((item) => item.value === currentValue);
		if (index >= 0) {
			this.selectList.setSelectedIndex(index);
		}
		this.selectList.onSelect = (item) => onSelect(item.value);
		this.selectList.onCancel = onCancel;
		this.addChild(this.selectList);
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to select · Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

class SettingDetailComponent extends Container {
	private readonly settingsList: SettingsList;

	constructor(
		private readonly node: ResolvedSettingNode,
		private readonly registry: SettingsRegistry,
		private readonly runtimeContext: SettingsRuntimeContext,
		private readonly scope: SettingsScope,
		private readonly done: () => void,
	) {
		super();

		this.addChild(new Text(theme.bold(theme.fg("accent", node.label)), 0, 0));
		this.addChild(new Spacer(1));
		if (node.description) {
			this.addChild(new Text(theme.fg("muted", node.description), 0, 0));
			this.addChild(new Spacer(1));
		}
		this.addChild(
			new Text(
				theme.fg(
					"dim",
					scope === "project"
						? node.inherited
							? `Project scope is inheriting global value: ${stringifyForInput(node.effectiveValue) || "unset"}`
							: `Project override: ${stringifyForInput(node.scopedValue)}`
						: `Global value: ${stringifyForInput(node.currentValue) || "unset"}`,
				),
				0,
				0,
			),
		);
		this.addChild(new Spacer(1));

		this.settingsList = new SettingsList(
			this.buildItems(),
			10,
			getSettingsListTheme(),
			(id, value) => {
				if (id.startsWith("__unset:")) {
					const targetId = id.slice("__unset:".length);
					const target = targetId === this.node.id ? this.node : this.findNodeById(targetId);
					if (!target) return;
					this.registry.unset(target.id, this.scope, this.runtimeContext);
					this.done();
					return;
				}
				const target = id === "__self" ? this.node : this.findNodeById(id);
				if (!target) return;
				applySettingSelection(this.registry, target, this.scope, this.runtimeContext, value);
				this.done();
			},
			this.done,
		);

		this.addChild(this.settingsList);
	}

	private buildItems(): SettingItem[] {
		const items: SettingItem[] = [];
		if (hasDetailSelfItem(this.node)) {
			items.push(this.toSettingItem(this.node, true));
		}
		for (const child of this.node.children) {
			items.push(this.toSettingItem(child, false));
			if (canUnsetNode(child, this.registry, this.scope, this.runtimeContext)) {
				items.push(this.toUnsetItem(child));
			}
		}
		if (canUnsetNode(this.node, this.registry, this.scope, this.runtimeContext)) {
			items.push(this.toUnsetItem(this.node));
		}
		return items;
	}

	private findNodeById(id: string): ResolvedSettingNode | undefined {
		return this.findNodeByIdInTree(this.node, id);
	}

	private findNodeByIdInTree(node: ResolvedSettingNode, id: string): ResolvedSettingNode | undefined {
		if (node.id === id) {
			return node;
		}
		for (const child of node.children) {
			const resolved = this.findNodeByIdInTree(child, id);
			if (resolved) {
				return resolved;
			}
		}
		return undefined;
	}

	private toUnsetItem(node: ResolvedSettingNode): SettingItem {
		const label =
			node.id === this.node.id
				? this.scope === "project"
					? "Reset project override"
					: "Reset global value"
				: `Reset ${node.label}`;
		return {
			id: `__unset:${node.id}`,
			label,
			description: "Remove the value from the current scope.",
			currentValue: "Unset",
			values: ["Unset"],
		};
	}

	private toSettingItem(node: ResolvedSettingNode, self: boolean): SettingItem {
		const id = self ? "__self" : node.id;
		const allowUnset = canUnsetNode(node, this.registry, this.scope, this.runtimeContext);
		if (isSelfEditableNode(node)) {
			return {
				id,
				label: self ? "Value" : node.label,
				description: node.description,
				currentValue: stringifyForInput(node.currentValue),
				displayValue: formatSettingValue(node),
				submenu: (_currentValue, close) =>
					new ValueEditorComponent(
						node,
						(value) => {
							if (value !== RESET_SETTING_VALUE) {
								const parsed = parseSettingValue(node, value);
								if (!parsed.ok) {
									return parsed.error;
								}
							}
							close(value);
							return undefined;
						},
						() => close(),
					),
			};
		}

		const hasNestedChildren = node.children.length > 0 && !self;
		if (hasNestedChildren) {
			return {
				id,
				label: node.label,
				description: node.description,
				currentValue: stringifyForInput(node.currentValue),
				displayValue: formatSettingValue(node),
				submenu: (_currentValue, close) =>
					new SettingDetailComponent(node, this.registry, this.runtimeContext, this.scope, () => close()),
			};
		}

		return {
			id,
			label: self ? "Value" : node.label,
			description: node.description,
			currentValue: stringifyForInput(node.currentValue),
			displayValue: formatSettingValue(node),
			submenu: (_currentValue, close) =>
				new ChoiceEditorComponent(
					self ? this.node.label : node.label,
					node.description,
					buildChoiceItems(node, allowUnset),
					stringifyForInput(node.currentValue),
					(value) => close(value),
					() => close(),
				),
		};
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

export interface SettingsSelectorConfig {
	registry: SettingsRegistry;
	runtimeContext: SettingsRuntimeContext;
	scope?: SettingsScope;
}

export interface SettingsCallbacks {
	onCancel: () => void;
}

function isDetailNode(node: ResolvedSettingNode): boolean {
	return node.children.length > 0 || isSelfEditableNode(node);
}

function isInlineToggleNode(node: ResolvedSettingNode, allowUnset: boolean): boolean {
	return !allowUnset && !isDetailNode(node) && node.type === "toggle";
}

function isDirectChoiceMenuNode(node: ResolvedSettingNode): boolean {
	return !isDetailNode(node) && node.options.length > 0 && node.type !== "toggle";
}

export class SettingsSelectorComponent extends Container {
	private readonly settingsList: SettingsList;
	private readonly scopeText: Text;
	private scope: SettingsScope;
	private sections: ResolvedSettingsSection[] = [];
	private nodeById = new Map<string, ResolvedSettingNode>();

	constructor(
		private readonly config: SettingsSelectorConfig,
		callbacks: SettingsCallbacks,
	) {
		super();
		this.scope = config.scope ?? "global";

		this.addChild(new DynamicBorder());
		this.addChild(new Text(theme.bold(theme.fg("accent", "Settings")), 1, 0));
		this.scopeText = new Text("", 1, 0);
		this.addChild(this.scopeText);

		this.settingsList = new SettingsList(
			[],
			12,
			getSettingsListTheme() as SettingsListTheme,
			(id, value) => {
				const node = this.nodeById.get(id);
				if (!node) return;
				applySettingSelection(this.config.registry, node, this.scope, this.config.runtimeContext, value);
				this.rebuild();
			},
			callbacks.onCancel,
			{
				enableSearch: true,
				extraHint: "  Left/Right to switch scope · Type to search · Enter/Space to change · Esc to cancel",
				onInput: (data: string) => {
					const kb = getKeybindings();
					if (!kb.matches(data, "tui.editor.cursorLeft") && !kb.matches(data, "tui.editor.cursorRight")) {
						return false;
					}
					this.scope = this.scope === "global" ? "project" : "global";
					this.rebuild();
					return true;
				},
			},
		);
		this.addChild(this.settingsList);
		this.addChild(new DynamicBorder());

		this.rebuild();
	}

	private rebuild(): void {
		this.sections = this.config.registry.resolve(this.config.runtimeContext, this.scope);
		this.nodeById.clear();
		const items: SettingItem[] = [];
		for (const section of this.sections) {
			items.push({
				id: `section:${section.id}`,
				kind: "section",
				label: section.label,
				currentValue: "",
			});
			for (const node of section.items) {
				items.push(...this.toListItems(node));
			}
		}

		this.scopeText.setText(
			theme.fg("muted", `Scope: ${this.scope === "global" ? "[Global] Project" : "Global [Project]"}`),
		);
		this.settingsList.setItems(items);
		this.settingsList.invalidate();
	}

	private toListItems(node: ResolvedSettingNode, ancestors: ResolvedSettingNode[] = []): SettingItem[] {
		this.nodeById.set(node.id, node);
		const label =
			ancestors.length === 0
				? node.label
				: `${ancestors.map((ancestor) => ancestor.label).join(" / ")} / ${node.label}`;
		const allowUnset = canUnsetNode(node, this.config.registry, this.scope, this.config.runtimeContext);
		const items: SettingItem[] = [
			{
				id: node.id,
				label,
				description: node.description,
				currentValue: stringifyForInput(node.currentValue),
				displayValue: formatSettingValue(node),
				values: isInlineToggleNode(node, allowUnset) ? toChoiceItems(node).map((item) => item.value) : undefined,
				submenu:
					isDirectChoiceMenuNode(node) || (node.type === "toggle" && allowUnset)
						? (_currentValue, done) =>
								new ChoiceEditorComponent(
									node.label,
									node.description,
									buildChoiceItems(node, allowUnset),
									stringifyForInput(node.currentValue),
									(value) => done(value),
									() => done(),
								)
						: !isInlineToggleNode(node, allowUnset)
							? (_currentValue, done) =>
									new SettingDetailComponent(
										node,
										this.config.registry,
										this.config.runtimeContext,
										this.scope,
										() => {
											this.rebuild();
											done();
										},
									)
							: undefined,
			},
		];
		for (const child of node.children) {
			items.push(...this.toListItems(child, [...ancestors, node]));
		}
		return items;
	}

	getSettingsList(): SettingsList {
		return this.settingsList;
	}
}
