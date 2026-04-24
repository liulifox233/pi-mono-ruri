import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "./model-registry.js";
import { createThinkingSettingDefinition } from "./provider-thinking-settings.js";
import type { SessionManager } from "./session-manager.js";
import type { SettingsManager, SettingsScope } from "./settings-manager.js";
import type { SourceInfo } from "./source-info.js";

export type SettingControlType = "toggle" | "select" | "number" | "text";
export type SettingValue = boolean | number | string;

export interface SettingSectionDefinition {
	id: string;
	label: string;
	order?: number;
	sourceInfo?: SourceInfo;
}

export interface SettingOption {
	value: string;
	label?: string;
	description?: string;
}

export interface SettingStorageDescriptor {
	path?: string;
	scopes?: SettingsScope[];
	defaultValue?: SettingValue;
}

export interface SettingsRuntimeActions {
	getThinkingLevel?: () => ThinkingLevel;
	setThinkingLevel?: (value: ThinkingLevel, scope: SettingsScope) => void;
	getSteeringMode?: () => "all" | "one-at-a-time";
	setSteeringMode?: (value: "all" | "one-at-a-time", scope: SettingsScope) => void;
	getFollowUpMode?: () => "all" | "one-at-a-time";
	setFollowUpMode?: (value: "all" | "one-at-a-time", scope: SettingsScope) => void;
	getAutoCompactionEnabled?: () => boolean;
	setAutoCompactionEnabled?: (value: boolean, scope: SettingsScope) => void;
	applyTheme?: (themeName: string, scope: SettingsScope) => void;
	setShowImages?: (value: boolean, scope: SettingsScope) => void;
	setImageWidthCells?: (value: number, scope: SettingsScope) => void;
	setEnableSkillCommands?: (value: boolean, scope: SettingsScope) => void;
	setTransport?: (value: string, scope: SettingsScope) => void;
	setHideThinkingBlock?: (value: boolean, scope: SettingsScope) => void;
	setShowHardwareCursor?: (value: boolean, scope: SettingsScope) => void;
	setEditorPaddingX?: (value: number, scope: SettingsScope) => void;
	setAutocompleteMaxVisible?: (value: number, scope: SettingsScope) => void;
	setClearOnShrink?: (value: boolean, scope: SettingsScope) => void;
	setShowTerminalProgress?: (value: boolean, scope: SettingsScope) => void;
	setBuiltinWebSearch?: (value: boolean, scope: SettingsScope) => void;
}

export interface SettingsRuntimeContext {
	settingsManager: SettingsManager;
	sessionManager?: SessionManager;
	modelRegistry?: ModelRegistry;
	model?: Model<Api> | undefined;
	availableThemes?: string[];
	availableThinkingLevels?: ThinkingLevel[];
	runtime?: SettingsRuntimeActions;
	settingsNamespace?: string;
}

export interface SettingDefinition {
	id: string;
	type: SettingControlType;
	label: string;
	section: string;
	order?: number;
	description?: string;
	storage?: SettingStorageDescriptor;
	options?: SettingOption[] | ((ctx: SettingsRuntimeContext) => SettingOption[]);
	children?: SettingDefinition[] | ((ctx: SettingsRuntimeContext) => SettingDefinition[]);
	visible?: (ctx: SettingsRuntimeContext) => boolean;
	getValue?: (ctx: SettingsRuntimeContext) => SettingValue | undefined;
	getScopedValue?: (ctx: SettingsRuntimeContext, scope: SettingsScope) => SettingValue | undefined;
	apply?: (
		value: SettingValue,
		ctx: SettingsRuntimeContext,
		scope: SettingsScope,
	) => { handledStorage?: boolean } | undefined;
	sourceInfo?: SourceInfo;
	namespace?: string;
}

export interface SettingAugmentation {
	targetId: string;
	description?: string;
	options?: SettingOption[] | ((ctx: SettingsRuntimeContext) => SettingOption[]);
	children?: SettingDefinition[] | ((ctx: SettingsRuntimeContext) => SettingDefinition[]);
	priority?: number;
	sourceInfo?: SourceInfo;
	namespace?: string;
}

export interface SettingsRegistryDiagnostic {
	type: "warning";
	message: string;
	sourceInfo?: SourceInfo;
}

export interface ResolvedSettingNode {
	id: string;
	type: SettingControlType;
	label: string;
	description?: string;
	order: number;
	scope: SettingsScope[];
	currentValue: SettingValue | undefined;
	scopedValue: SettingValue | undefined;
	effectiveValue: SettingValue | undefined;
	inherited: boolean;
	options: SettingOption[];
	children: ResolvedSettingNode[];
}

export interface ResolvedSettingsSection {
	id: string;
	label: string;
	order: number;
	items: ResolvedSettingNode[];
}

interface RegisteredSettingDefinition extends SettingDefinition {
	registryId: string;
	qualifiedId: string;
	sourceInfo?: SourceInfo;
	namespace?: string;
}

interface RegisteredAugmentation extends SettingAugmentation {
	sequence: number;
}

interface SettingDefinitionMetadata {
	namespace?: string;
	sourceInfo?: SourceInfo;
	parentQualifiedId?: string;
}

function sanitizeNamespaceSegment(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "") || "extension"
	);
}

const EXTENSION_SETTINGS_ROOT = "extensionSettings";
const GENERIC_SETTINGS_NAMESPACE_SEGMENTS = new Set([".config", "rpi", "extensions", "prompts", "skills", "themes"]);

function getLastPathSegment(value: string): string | undefined {
	const segments = value.split(/[\\/]/).filter(Boolean);
	return segments[segments.length - 1];
}

function stripKnownExtension(value: string): string {
	return value.replace(/\.[^.]+$/, "") || value;
}

function createRegistryId(id: string, namespace: string | undefined): string {
	return namespace ? `${namespace}:${id}` : id;
}

function getQualifiedSettingId(definition: { id: string; qualifiedId?: string }): string {
	return definition.qualifiedId ?? definition.id;
}

function formatSettingDiagnosticId(definition: { id: string; qualifiedId?: string; namespace?: string }): string {
	const id = getQualifiedSettingId(definition);
	return definition.namespace ? `${definition.namespace}.${id}` : id;
}

export function inferSettingsNamespace(sourceInfo: SourceInfo | undefined, fallbackId: string): string {
	const baseDirSegment = sourceInfo?.baseDir ? getLastPathSegment(sourceInfo.baseDir) : undefined;
	if (baseDirSegment && !GENERIC_SETTINGS_NAMESPACE_SEGMENTS.has(baseDirSegment.toLowerCase())) {
		return sanitizeNamespaceSegment(baseDirSegment);
	}
	const pathSegment =
		sourceInfo?.path && !sourceInfo.path.startsWith("<") ? getLastPathSegment(sourceInfo.path) : undefined;
	if (pathSegment) {
		return sanitizeNamespaceSegment(stripKnownExtension(pathSegment));
	}
	if (sourceInfo?.source) {
		return sanitizeNamespaceSegment(sourceInfo.source);
	}
	return sanitizeNamespaceSegment(fallbackId);
}

function getAllowedScopes(definition: SettingDefinition): SettingsScope[] {
	return definition.storage?.scopes?.length ? [...definition.storage.scopes] : ["global", "project"];
}

function supportsScope(definition: SettingDefinition, scope: SettingsScope): boolean {
	return getAllowedScopes(definition).includes(scope);
}

function normalizeScope(definition: SettingDefinition, scope: SettingsScope): SettingsScope {
	const allowed = getAllowedScopes(definition);
	return allowed.includes(scope) ? scope : (allowed[0] ?? "global");
}

function defaultStoragePath(definition: SettingDefinition): string | undefined {
	if (definition.storage?.path) {
		return definition.storage.path;
	}
	if (!definition.namespace) {
		return undefined;
	}
	return `${EXTENSION_SETTINGS_ROOT}.${definition.namespace}:${getQualifiedSettingId(definition)}`;
}

function resolveOptions(
	options: SettingOption[] | ((ctx: SettingsRuntimeContext) => SettingOption[]) | undefined,
	ctx: SettingsRuntimeContext,
): SettingOption[] {
	if (!options) {
		return [];
	}
	return typeof options === "function" ? options(ctx) : options;
}

function resolveChildren(
	children: SettingDefinition[] | ((ctx: SettingsRuntimeContext) => SettingDefinition[]) | undefined,
	ctx: SettingsRuntimeContext,
): SettingDefinition[] {
	if (!children) {
		return [];
	}
	return typeof children === "function" ? children(ctx) : children;
}

function matchesQuery(node: ResolvedSettingNode, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	const haystacks = [
		node.label,
		node.description ?? "",
		String(node.effectiveValue ?? ""),
		...node.options.map((option) => option.label ?? option.value),
	];
	return haystacks.some((part) => part.toLowerCase().includes(normalized));
}

function compareByOrderAndLabel<T extends { order: number; label: string }>(left: T, right: T): number {
	return left.order - right.order || left.label.localeCompare(right.label);
}

export class SettingsRegistry {
	private sections = new Map<string, SettingSectionDefinition>();
	private settings = new Map<string, RegisteredSettingDefinition>();
	private augmentations = new Map<string, RegisteredAugmentation[]>();
	private diagnostics: SettingsRegistryDiagnostic[] = [];
	private augmentationSequence = 0;

	registerSection(section: SettingSectionDefinition): void {
		if (!this.sections.has(section.id)) {
			this.sections.set(section.id, section);
			return;
		}
		this.diagnostics.push({
			type: "warning",
			message: `Duplicate settings section "${section.id}" ignored.`,
			sourceInfo: section.sourceInfo,
		});
	}

	register(definition: SettingDefinition): void {
		const registered = this.materializeDefinition(definition, {
			namespace: definition.namespace,
			sourceInfo: definition.sourceInfo,
		});
		if (this.settings.has(registered.registryId)) {
			this.diagnostics.push({
				type: "warning",
				message: `Duplicate setting "${formatSettingDiagnosticId(registered)}" ignored.`,
				sourceInfo: definition.sourceInfo,
			});
			return;
		}
		this.settings.set(registered.registryId, registered);
	}

	augment(augmentation: SettingAugmentation): void {
		const list = this.augmentations.get(augmentation.targetId) ?? [];
		list.push({
			...augmentation,
			sequence: this.augmentationSequence++,
		});
		list.sort((left, right) => {
			const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);
			if (priorityDelta !== 0) return priorityDelta;
			return left.sequence - right.sequence;
		});
		this.augmentations.set(augmentation.targetId, list);
	}

	getDiagnostics(): SettingsRegistryDiagnostic[] {
		return [...this.diagnostics];
	}

	get(id: string, ctx: SettingsRuntimeContext): SettingValue | undefined {
		const definition = this.findDefinition(id, ctx);
		if (!definition) {
			return undefined;
		}
		return this.getEffectiveDefinitionValue(definition, ctx);
	}

	hasScopedValue(id: string, scope: SettingsScope, ctx: SettingsRuntimeContext): boolean {
		const definition = this.findDefinition(id, ctx);
		if (!definition) {
			return false;
		}
		const effectiveScope = normalizeScope(definition, scope);
		const path = definition.storage?.path ?? defaultStoragePath(definition);
		return path ? ctx.settingsManager.hasScopedValue(effectiveScope, path) : false;
	}

	unset(id: string, scope: SettingsScope, ctx: SettingsRuntimeContext): void {
		const definition = this.findDefinition(id, ctx);
		if (!definition) {
			return;
		}
		const effectiveScope = normalizeScope(definition, scope);
		const path = definition.storage?.path ?? defaultStoragePath(definition);
		if (!path) {
			return;
		}
		const previousEffectiveValue = this.getPersistedDefinitionValue(definition, ctx);
		ctx.settingsManager.unsetScopedValue(effectiveScope, path);
		const nextValue = this.getPersistedDefinitionValue(definition, ctx);
		if (nextValue !== undefined && nextValue !== previousEffectiveValue) {
			definition.apply?.(nextValue, ctx, effectiveScope);
		}
	}

	apply(id: string, value: SettingValue, scope: SettingsScope, ctx: SettingsRuntimeContext): void {
		const definition = this.findDefinition(id, ctx);
		if (!definition) {
			return;
		}
		const effectiveScope = normalizeScope(definition, scope);
		const path = definition.storage?.path ?? defaultStoragePath(definition);
		if (!path) {
			definition.apply?.(value, ctx, effectiveScope);
			return;
		}
		const previousEffectiveValue = this.getPersistedDefinitionValue(definition, ctx);
		ctx.settingsManager.setScopedValue(effectiveScope, path, value);
		const nextValue = this.getPersistedDefinitionValue(definition, ctx);
		if (nextValue !== undefined && nextValue !== previousEffectiveValue) {
			definition.apply?.(nextValue, ctx, effectiveScope);
		}
	}

	resolve(ctx: SettingsRuntimeContext, scope: SettingsScope, query = ""): ResolvedSettingsSection[] {
		const sections = new Map<string, ResolvedSettingsSection>();
		for (const section of this.sections.values()) {
			sections.set(section.id, {
				id: section.id,
				label: section.label,
				order: section.order ?? 0,
				items: [],
			});
		}

		for (const definition of this.settings.values()) {
			if (definition.visible && !definition.visible(ctx)) {
				continue;
			}
			if (!supportsScope(definition, scope)) {
				continue;
			}
			const section = sections.get(definition.section);
			if (!section) {
				continue;
			}
			const node = this.resolveNode(definition, ctx, scope);
			if (!matchesQuery(node, query) && node.children.length === 0) {
				continue;
			}
			section.items.push(node);
		}

		return [...sections.values()]
			.map((section) => ({
				...section,
				items: section.items.sort(compareByOrderAndLabel),
			}))
			.filter((section) => section.items.length > 0)
			.sort(compareByOrderAndLabel);
	}

	private resolveNode(
		definition: RegisteredSettingDefinition,
		ctx: SettingsRuntimeContext,
		scope: SettingsScope,
	): ResolvedSettingNode {
		const options = [...resolveOptions(definition.options, ctx)];
		const augmentations = this.getAugmentationsForDefinition(definition);
		const children = this.resolveChildDefinitions(definition, ctx, true);

		for (const augmentation of augmentations) {
			for (const option of resolveOptions(augmentation.options, ctx)) {
				if (options.some((existing) => existing.value === option.value)) {
					this.diagnostics.push({
						type: "warning",
						message: `Duplicate option "${option.value}" on setting "${definition.id}" ignored.`,
						sourceInfo: augmentation.sourceInfo,
					});
					continue;
				}
				options.push(option);
			}
		}

		const effectiveValue = this.getEffectiveDefinitionValue(definition, ctx);
		const effectiveScope = normalizeScope(definition, scope);
		const path = definition.storage?.path ?? defaultStoragePath(definition);
		const scopedValue = path
			? (ctx.settingsManager.getScopedValue(effectiveScope, path) as SettingValue | undefined)
			: undefined;
		const inherited = effectiveScope === "project" && scopedValue === undefined;
		const currentValue = inherited
			? effectiveValue
			: (this.getScopedDefinitionValue(definition, ctx, effectiveScope) ?? effectiveValue);
		const description =
			augmentations
				.map((augmentation) => augmentation.description)
				.find((value): value is string => Boolean(value)) ?? definition.description;

		return {
			id: definition.registryId,
			type: definition.type,
			label: definition.label,
			description,
			order: definition.order ?? 0,
			scope: getAllowedScopes(definition),
			currentValue,
			scopedValue,
			effectiveValue,
			inherited,
			options,
			children: children
				.filter((child) => (!child.visible || child.visible(ctx)) && supportsScope(child, scope))
				.map((child) => this.resolveNode(child, ctx, scope))
				.sort(compareByOrderAndLabel),
		};
	}

	private findDefinition(id: string, ctx: SettingsRuntimeContext): RegisteredSettingDefinition | undefined {
		for (const candidateId of this.getDefinitionLookupIds(id, ctx.settingsNamespace)) {
			const topLevel = this.settings.get(candidateId);
			if (topLevel) {
				return topLevel;
			}
		}
		for (const definition of this.settings.values()) {
			const resolved = this.findDefinitionInChildren(definition, id, ctx);
			if (resolved) {
				return resolved;
			}
		}
		return undefined;
	}

	private findDefinitionInChildren(
		definition: RegisteredSettingDefinition,
		id: string,
		ctx: SettingsRuntimeContext,
	): RegisteredSettingDefinition | undefined {
		for (const child of this.resolveChildDefinitions(definition, ctx)) {
			if (this.matchesDefinitionLookup(child, id, ctx.settingsNamespace)) {
				return child;
			}
			const resolved = this.findDefinitionInChildren(child, id, ctx);
			if (resolved) {
				return resolved;
			}
		}
		return undefined;
	}

	private resolveChildDefinitions(
		definition: RegisteredSettingDefinition,
		ctx: SettingsRuntimeContext,
		recordDiagnostics = false,
	): RegisteredSettingDefinition[] {
		const children = resolveChildren(definition.children, ctx).map((child) =>
			this.materializeDefinition(child, {
				namespace: definition.namespace,
				sourceInfo: definition.sourceInfo,
				parentQualifiedId: definition.qualifiedId,
			}),
		);

		for (const augmentation of this.getAugmentationsForDefinition(definition)) {
			for (const child of resolveChildren(augmentation.children, ctx)) {
				const augmentedChild = this.materializeDefinition(child, {
					namespace: augmentation.namespace ?? definition.namespace,
					sourceInfo: augmentation.sourceInfo ?? definition.sourceInfo,
					parentQualifiedId: definition.qualifiedId,
				});
				if (children.some((existing) => existing.registryId === augmentedChild.registryId)) {
					if (recordDiagnostics) {
						this.diagnostics.push({
							type: "warning",
							message: `Duplicate child setting "${formatSettingDiagnosticId(augmentedChild)}" on setting "${definition.id}" ignored.`,
							sourceInfo: augmentation.sourceInfo,
						});
					}
					continue;
				}
				children.push(augmentedChild);
			}
		}

		return children;
	}

	private getAugmentationsForDefinition(definition: RegisteredSettingDefinition): RegisteredAugmentation[] {
		const augmentations: RegisteredAugmentation[] = [];
		const seen = new Set<number>();
		for (const key of new Set([definition.registryId, definition.id])) {
			for (const augmentation of this.augmentations.get(key) ?? []) {
				if (seen.has(augmentation.sequence) || !this.matchesAugmentationTarget(augmentation, definition)) {
					continue;
				}
				seen.add(augmentation.sequence);
				augmentations.push(augmentation);
			}
		}
		augmentations.sort((left, right) => {
			const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);
			if (priorityDelta !== 0) return priorityDelta;
			return left.sequence - right.sequence;
		});
		return augmentations;
	}

	private matchesAugmentationTarget(
		augmentation: RegisteredAugmentation,
		definition: RegisteredSettingDefinition,
	): boolean {
		if (augmentation.targetId === definition.registryId) {
			return true;
		}
		if (augmentation.targetId !== definition.id) {
			return false;
		}
		return !augmentation.namespace || !definition.namespace || augmentation.namespace === definition.namespace;
	}

	private materializeDefinition(
		definition: SettingDefinition,
		metadata: SettingDefinitionMetadata,
	): RegisteredSettingDefinition {
		const qualifiedId = metadata.parentQualifiedId ? `${metadata.parentQualifiedId}/${definition.id}` : definition.id;
		const namespace = definition.namespace ?? metadata.namespace;
		return {
			...definition,
			registryId: createRegistryId(qualifiedId, namespace),
			qualifiedId,
			namespace,
			sourceInfo: definition.sourceInfo ?? metadata.sourceInfo,
		};
	}

	private getDefinitionLookupIds(id: string, settingsNamespace: string | undefined): string[] {
		return settingsNamespace ? [createRegistryId(id, settingsNamespace), id] : [id];
	}

	private matchesDefinitionLookup(
		definition: RegisteredSettingDefinition,
		id: string,
		settingsNamespace: string | undefined,
	): boolean {
		if (definition.registryId === id) {
			return true;
		}
		if (definition.id !== id) {
			return false;
		}
		if (!settingsNamespace) {
			return definition.namespace === undefined;
		}
		return definition.namespace === undefined || definition.namespace === settingsNamespace;
	}

	private getEffectiveDefinitionValue(
		definition: RegisteredSettingDefinition,
		ctx: SettingsRuntimeContext,
	): SettingValue | undefined {
		if (definition.getValue) {
			return definition.getValue(ctx);
		}
		return this.getPersistedDefinitionValue(definition, ctx);
	}

	private getPersistedDefinitionValue(
		definition: RegisteredSettingDefinition,
		ctx: SettingsRuntimeContext,
	): SettingValue | undefined {
		const path = definition.storage?.path ?? defaultStoragePath(definition);
		if (!path) {
			return definition.storage?.defaultValue;
		}
		const effective = ctx.settingsManager.getEffectiveValue(path);
		return (effective as SettingValue | undefined) ?? definition.storage?.defaultValue;
	}

	private getScopedDefinitionValue(
		definition: RegisteredSettingDefinition,
		ctx: SettingsRuntimeContext,
		scope: SettingsScope,
	): SettingValue | undefined {
		if (definition.getScopedValue) {
			return definition.getScopedValue(ctx, scope);
		}
		const path = definition.storage?.path ?? defaultStoragePath(definition);
		if (!path) {
			return this.getEffectiveDefinitionValue(definition, ctx);
		}
		const scopedValue = ctx.settingsManager.getScopedValue(scope, path);
		return (scopedValue as SettingValue | undefined) ?? definition.storage?.defaultValue;
	}
}

export function createBuiltinSettingsRegistry(): SettingsRegistry {
	const registry = new SettingsRegistry();

	for (const section of [
		{ id: "model", label: "Model", order: 10 },
		{ id: "session", label: "Session", order: 20 },
		{ id: "appearance", label: "Appearance", order: 30 },
		{ id: "editor", label: "Editor", order: 40 },
		{ id: "terminal", label: "Terminal", order: 50 },
	] satisfies SettingSectionDefinition[]) {
		registry.registerSection(section);
	}

	const register = (definition: SettingDefinition) => registry.register(definition);

	register(createThinkingSettingDefinition());
	register({
		id: "builtinWebSearch",
		type: "toggle",
		section: "model",
		order: 20,
		label: "Built-in web search",
		description: "Enable provider-native web search for supported models.",
		storage: { path: "builtinWebSearch", defaultValue: false },
		visible: (ctx) => ctx.model?.capabilities?.builtinWebSearch === true,
		getValue: (ctx) => ctx.settingsManager.getBuiltinWebSearch(),
		apply: (value, ctx, scope) => {
			ctx.runtime?.setBuiltinWebSearch?.(value === true, scope);
			return undefined;
		},
	});

	register({
		id: "transport",
		type: "select",
		section: "model",
		order: 30,
		label: "Transport",
		description: "Preferred transport for providers that support multiple transports.",
		storage: { path: "transport", defaultValue: "sse" },
		options: ["auto", "sse", "websocket"].map((value) => ({ value })),
		apply: (value, ctx, scope) => {
			ctx.runtime?.setTransport?.(value as string, scope);
			return undefined;
		},
	});
	register({
		id: "steeringMode",
		type: "select",
		section: "session",
		order: 10,
		label: "Steering mode",
		description: "How queued Enter presses are delivered while streaming.",
		storage: { path: "steeringMode", defaultValue: "one-at-a-time" },
		options: ["one-at-a-time", "all"].map((value) => ({ value })),
		getValue: (ctx) => ctx.runtime?.getSteeringMode?.() ?? ctx.settingsManager.getSteeringMode(),
		apply: (value, ctx, scope) => {
			ctx.runtime?.setSteeringMode?.(value as "all" | "one-at-a-time", scope);
			return undefined;
		},
	});
	register({
		id: "followUpMode",
		type: "select",
		section: "session",
		order: 20,
		label: "Follow-up mode",
		description: "How Alt+Enter follow-up messages are delivered while streaming.",
		storage: { path: "followUpMode", defaultValue: "one-at-a-time" },
		options: ["one-at-a-time", "all"].map((value) => ({ value })),
		getValue: (ctx) => ctx.runtime?.getFollowUpMode?.() ?? ctx.settingsManager.getFollowUpMode(),
		apply: (value, ctx, scope) => {
			ctx.runtime?.setFollowUpMode?.(value as "all" | "one-at-a-time", scope);
			return undefined;
		},
	});
	register({
		id: "compaction",
		type: "toggle",
		section: "session",
		order: 30,
		label: "Auto-compact",
		description: "Automatically compact context when it gets too large.",
		storage: { path: "compaction.enabled", defaultValue: true },
		getValue: (ctx) => ctx.runtime?.getAutoCompactionEnabled?.() ?? ctx.settingsManager.getCompactionEnabled(),
		apply: (value, ctx, scope) => {
			ctx.runtime?.setAutoCompactionEnabled?.(value === true, scope);
			return undefined;
		},
	});
	register({
		id: "theme",
		type: "select",
		section: "appearance",
		order: 10,
		label: "Theme",
		description: "Color theme for the interface.",
		storage: { path: "theme", defaultValue: "dark" },
		options: (ctx) => (ctx.availableThemes ?? []).map((theme) => ({ value: theme })),
		getValue: (ctx) => ctx.settingsManager.getTheme() ?? "dark",
		apply: (value, ctx, scope) => {
			ctx.runtime?.applyTheme?.(value as string, scope);
			return undefined;
		},
	});
	for (const definition of [
		{
			id: "hideThinkingBlock",
			section: "appearance",
			order: 20,
			label: "Hide thinking",
			description: "Hide thinking blocks in assistant responses.",
			storage: { path: "hideThinkingBlock", defaultValue: false },
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setHideThinkingBlock?.(value === true, scope);
				return undefined;
			},
		},
		{
			id: "collapseChangelog",
			section: "appearance",
			order: 30,
			label: "Collapse changelog",
			description: "Show condensed changelog after updates.",
			storage: { path: "collapseChangelog", defaultValue: false, scopes: ["global"] },
		},
		{
			id: "enableInstallTelemetry",
			section: "appearance",
			order: 40,
			label: "Install telemetry",
			description: "Send an anonymous version/update ping after changelog-detected updates.",
			storage: { path: "enableInstallTelemetry", defaultValue: true, scopes: ["global"] },
		},
		{
			id: "quietStartup",
			section: "appearance",
			order: 50,
			label: "Quiet startup",
			description: "Disable verbose printing at startup.",
			storage: { path: "quietStartup", defaultValue: false },
		},
		{
			id: "showHardwareCursor",
			section: "appearance",
			order: 60,
			label: "Show hardware cursor",
			description: "Show the terminal cursor while still positioning it for IME support.",
			storage: { path: "showHardwareCursor", defaultValue: false, scopes: ["global"] },
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setShowHardwareCursor?.(value === true, scope);
				return undefined;
			},
		},
		{
			id: "editorPaddingX",
			section: "editor",
			order: 10,
			label: "Editor padding",
			description: "Horizontal padding for input editor (0-3).",
			type: "number" as const,
			storage: { path: "editorPaddingX", defaultValue: 0 },
			options: ["0", "1", "2", "3"].map((value) => ({ value })),
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setEditorPaddingX?.(Number(value), scope);
				return undefined;
			},
		},
		{
			id: "autocompleteMaxVisible",
			section: "editor",
			order: 20,
			label: "Autocomplete max items",
			description: "Max visible items in autocomplete dropdown (3-20).",
			type: "number" as const,
			storage: { path: "autocompleteMaxVisible", defaultValue: 5 },
			options: ["3", "5", "7", "10", "15", "20"].map((value) => ({ value })),
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setAutocompleteMaxVisible?.(Number(value), scope);
				return undefined;
			},
		},
		{
			id: "doubleEscapeAction",
			section: "editor",
			order: 30,
			label: "Double-escape action",
			description: "Action when pressing Escape twice with an empty editor.",
			type: "select" as const,
			storage: { path: "doubleEscapeAction", defaultValue: "tree" },
			options: ["tree", "fork", "none"].map((value) => ({ value })),
		},
		{
			id: "treeFilterMode",
			section: "editor",
			order: 40,
			label: "Tree filter mode",
			description: "Default filter when opening /tree.",
			type: "select" as const,
			storage: { path: "treeFilterMode", defaultValue: "default" },
			options: ["default", "no-tools", "user-only", "labeled-only", "all"].map((value) => ({ value })),
		},
		{
			id: "showImages",
			section: "terminal",
			order: 10,
			label: "Show images",
			description: "Render images inline in supported terminals.",
			storage: { path: "terminal.showImages", defaultValue: true },
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setShowImages?.(value === true, scope);
				return undefined;
			},
		},
		{
			id: "imageWidthCells",
			section: "terminal",
			order: 20,
			label: "Image width",
			description: "Preferred inline image width in terminal cells.",
			type: "number" as const,
			storage: { path: "terminal.imageWidthCells", defaultValue: 60 },
			options: ["60", "80", "120"].map((value) => ({ value })),
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setImageWidthCells?.(Number(value), scope);
				return undefined;
			},
		},
		{
			id: "imageAutoResize",
			section: "terminal",
			order: 30,
			label: "Auto-resize images",
			description: "Resize large images to 2000x2000 max for better model compatibility.",
			storage: { path: "images.autoResize", defaultValue: true },
		},
		{
			id: "blockImages",
			section: "terminal",
			order: 40,
			label: "Block images",
			description: "Prevent images from being sent to LLM providers.",
			storage: { path: "images.blockImages", defaultValue: false },
		},
		{
			id: "enableSkillCommands",
			section: "terminal",
			order: 50,
			label: "Skill commands",
			description: "Register skills as /skill:name commands.",
			storage: { path: "enableSkillCommands", defaultValue: true },
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setEnableSkillCommands?.(value === true, scope);
				return undefined;
			},
		},
		{
			id: "clearOnShrink",
			section: "terminal",
			order: 60,
			label: "Clear on shrink",
			description: "Clear empty rows when content shrinks.",
			storage: { path: "terminal.clearOnShrink", defaultValue: false, scopes: ["global"] },
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setClearOnShrink?.(value === true, scope);
				return undefined;
			},
		},
		{
			id: "showTerminalProgress",
			section: "terminal",
			order: 70,
			label: "Terminal progress",
			description: "Show OSC 9;4 progress indicators in the terminal tab bar.",
			storage: { path: "terminal.showTerminalProgress", defaultValue: false, scopes: ["global"] },
			apply: (value: SettingValue, ctx: SettingsRuntimeContext, scope: SettingsScope) => {
				ctx.runtime?.setShowTerminalProgress?.(value === true, scope);
				return undefined;
			},
		},
	] satisfies Array<Omit<SettingDefinition, "type"> | SettingDefinition>) {
		register({
			type: "toggle",
			...definition,
		});
	}

	return registry;
}
