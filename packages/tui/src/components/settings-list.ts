import { fuzzyFilter } from "../fuzzy.js";
import { getKeybindings } from "../keybindings.js";
import type { Component } from "../tui.js";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "../utils.js";
import { Input } from "./input.js";

export interface SettingItem {
	/** Unique identifier for this setting */
	id: string;
	/** Item kind. Section items are rendered as headers and are not selectable. */
	kind?: "setting" | "section";
	/** Display label (left side) */
	label: string;
	/** Optional description shown when selected */
	description?: string;
	/** Current raw value used for cycling and submenu selection */
	currentValue: string;
	/** Optional formatted value to display instead of the raw value */
	displayValue?: string;
	/** If provided, Enter/Space cycles through these values */
	values?: string[];
	/** If provided, Enter opens this submenu. Receives current raw value and done callback. */
	submenu?: (currentValue: string, done: (selectedValue?: string) => void) => Component;
}

export interface SettingsListTheme {
	label: (text: string, selected: boolean) => string;
	value: (text: string, selected: boolean) => string;
	description: (text: string) => string;
	cursor: string;
	hint: (text: string) => string;
}

export interface SettingsListOptions {
	enableSearch?: boolean;
	extraHint?: string;
	onInput?: (data: string) => boolean;
}

export class SettingsList implements Component {
	private items: SettingItem[];
	private filteredItems: SettingItem[];
	private theme: SettingsListTheme;
	private selectedIndex = 0;
	private maxVisible: number;
	private onChange: (id: string, newValue: string) => void;
	private onCancel: () => void;
	private searchInput?: Input;
	private searchEnabled: boolean;
	private extraHint?: string;
	private extraInputHandler?: (data: string) => boolean;

	// Submenu state
	private submenuComponent: Component | null = null;
	private submenuItemIndex: number | null = null;

	constructor(
		items: SettingItem[],
		maxVisible: number,
		theme: SettingsListTheme,
		onChange: (id: string, newValue: string) => void,
		onCancel: () => void,
		options: SettingsListOptions = {},
	) {
		this.items = items;
		this.filteredItems = items;
		this.maxVisible = maxVisible;
		this.theme = theme;
		this.onChange = onChange;
		this.onCancel = onCancel;
		this.searchEnabled = options.enableSearch ?? false;
		this.extraHint = options.extraHint;
		this.extraInputHandler = options.onInput;
		if (this.searchEnabled) {
			this.searchInput = new Input();
		}
		this.selectedIndex = this.findNextSelectableIndex(0, 1);
	}

	/** Update an item's currentValue */
	updateValue(id: string, newValue: string, displayValue?: string): void {
		const item = this.items.find((i) => i.id === id);
		if (item) {
			const previousValue = item.currentValue;
			item.currentValue = newValue;
			if (displayValue !== undefined) {
				item.displayValue = displayValue;
			} else if (item.displayValue === undefined || item.displayValue === previousValue) {
				item.displayValue = newValue;
			}
		}
	}

	setItems(items: SettingItem[]): void {
		const selectedItem = (this.searchEnabled ? this.filteredItems : this.items)[this.selectedIndex];
		const selectedId = selectedItem?.kind === "section" ? undefined : selectedItem?.id;

		this.items = items;
		if (this.searchEnabled && this.searchInput) {
			this.applyFilter(this.searchInput.getValue(), selectedId);
			return;
		}
		this.filteredItems = items;
		this.selectedIndex = this.findSelectableIndexById(this.filteredItems, selectedId);
	}

	invalidate(): void {
		this.submenuComponent?.invalidate?.();
	}

	render(width: number): string[] {
		// If submenu is active, render it instead
		if (this.submenuComponent) {
			return this.submenuComponent.render(width);
		}

		return this.renderMainList(width);
	}

	private renderMainList(width: number): string[] {
		const lines: string[] = [];

		if (this.searchEnabled && this.searchInput) {
			lines.push(...this.searchInput.render(width));
			lines.push("");
		}

		if (this.items.length === 0) {
			lines.push(this.theme.hint("  No settings available"));
			if (this.searchEnabled) {
				this.addHintLine(lines, width);
			}
			return lines;
		}

		const displayItems = this.searchEnabled ? this.filteredItems : this.items;
		if (displayItems.length === 0) {
			lines.push(truncateToWidth(this.theme.hint("  No matching settings"), width));
			this.addHintLine(lines, width);
			return lines;
		}

		// Calculate visible range with scrolling
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), displayItems.length - this.maxVisible),
		);
		const endIndex = Math.min(startIndex + this.maxVisible, displayItems.length);

		// Calculate max label width for alignment
		const maxLabelWidth = Math.min(30, Math.max(...this.items.map((item) => visibleWidth(item.label))));

		// Render visible items
		for (let i = startIndex; i < endIndex; i++) {
			const item = displayItems[i];
			if (!item) continue;

			const isSelected = i === this.selectedIndex;
			if (item.kind === "section") {
				lines.push(truncateToWidth(this.theme.label(item.label, false), width));
				continue;
			}
			const prefix = isSelected ? this.theme.cursor : "  ";
			const prefixWidth = visibleWidth(prefix);

			// Pad label to align values
			const labelPadded = item.label + " ".repeat(Math.max(0, maxLabelWidth - visibleWidth(item.label)));
			const labelText = this.theme.label(labelPadded, isSelected);

			// Calculate space for value
			const separator = "  ";
			const usedWidth = prefixWidth + maxLabelWidth + visibleWidth(separator);
			const valueMaxWidth = width - usedWidth - 2;

			const valueText = this.theme.value(
				truncateToWidth(item.displayValue ?? item.currentValue, valueMaxWidth, ""),
				isSelected,
			);

			lines.push(truncateToWidth(prefix + labelText + separator + valueText, width));
		}

		// Add scroll indicator if needed
		if (startIndex > 0 || endIndex < displayItems.length) {
			const scrollText = `  (${this.selectedIndex + 1}/${displayItems.length})`;
			lines.push(this.theme.hint(truncateToWidth(scrollText, width - 2, "")));
		}

		// Add description for selected item
		const selectedItem = displayItems[this.selectedIndex];
		if (selectedItem?.kind !== "section" && selectedItem?.description) {
			lines.push("");
			const wrappedDesc = wrapTextWithAnsi(selectedItem.description, width - 4);
			for (const line of wrappedDesc) {
				lines.push(this.theme.description(`  ${line}`));
			}
		}

		// Add hint
		this.addHintLine(lines, width);

		return lines;
	}

	handleInput(data: string): void {
		// If submenu is active, delegate all input to it
		// The submenu's onCancel (triggered by escape) will call done() which closes it
		if (this.submenuComponent) {
			this.submenuComponent.handleInput?.(data);
			return;
		}

		// Main list input handling
		const kb = getKeybindings();
		const displayItems = this.searchEnabled ? this.filteredItems : this.items;
		if (this.extraInputHandler?.(data)) {
			return;
		}
		if (kb.matches(data, "tui.select.up")) {
			if (displayItems.length === 0) return;
			this.selectedIndex = this.findNextSelectableIndex(this.selectedIndex - 1, -1);
		} else if (kb.matches(data, "tui.select.down")) {
			if (displayItems.length === 0) return;
			this.selectedIndex = this.findNextSelectableIndex(this.selectedIndex + 1, 1);
		} else if (kb.matches(data, "tui.select.confirm") || data === " ") {
			this.activateItem();
		} else if (kb.matches(data, "tui.select.cancel")) {
			this.onCancel();
		} else if (this.searchEnabled && this.searchInput) {
			const sanitized = data.replace(/ /g, "");
			if (!sanitized) {
				return;
			}
			this.searchInput.handleInput(sanitized);
			this.applyFilter(this.searchInput.getValue());
		}
	}

	private activateItem(): void {
		const item = this.searchEnabled ? this.filteredItems[this.selectedIndex] : this.items[this.selectedIndex];
		if (!item || item.kind === "section") return;

		if (item.submenu) {
			// Open submenu, passing current value so it can pre-select correctly
			this.submenuItemIndex = this.selectedIndex;
			this.submenuComponent = item.submenu(item.currentValue, (selectedValue?: string) => {
				if (selectedValue !== undefined) {
					const previousValue = item.currentValue;
					item.currentValue = selectedValue;
					if (item.displayValue === undefined || item.displayValue === previousValue) {
						item.displayValue = selectedValue;
					}
					this.onChange(item.id, selectedValue);
				}
				this.closeSubmenu();
			});
		} else if (item.values && item.values.length > 0) {
			// Cycle through values
			const currentIndex = item.values.indexOf(item.currentValue);
			const nextIndex = (currentIndex + 1) % item.values.length;
			const newValue = item.values[nextIndex];
			const previousValue = item.currentValue;
			item.currentValue = newValue;
			if (item.displayValue === undefined || item.displayValue === previousValue) {
				item.displayValue = newValue;
			}
			this.onChange(item.id, newValue);
		}
	}

	private closeSubmenu(): void {
		this.submenuComponent = null;
		// Restore selection to the item that opened the submenu
		if (this.submenuItemIndex !== null) {
			this.selectedIndex = this.submenuItemIndex;
			this.submenuItemIndex = null;
		}
	}

	private applyFilter(query: string, preferredSelectedId?: string): void {
		if (!query.trim()) {
			this.filteredItems = this.items;
			this.selectedIndex = this.findSelectableIndexById(this.filteredItems, preferredSelectedId);
			return;
		}

		const matched = new Set(
			fuzzyFilter(
				this.items.filter((item) => item.kind !== "section"),
				query,
				(item) => item.label,
			),
		);
		const filtered: SettingItem[] = [];
		let pendingSection: SettingItem | undefined;

		for (const item of this.items) {
			if (item.kind === "section") {
				pendingSection = item;
				continue;
			}
			if (!matched.has(item)) {
				continue;
			}
			if (pendingSection) {
				filtered.push(pendingSection);
				pendingSection = undefined;
			}
			filtered.push(item);
		}

		this.filteredItems = filtered;
		this.selectedIndex = this.findSelectableIndexById(this.filteredItems, preferredSelectedId);
	}

	private findSelectableIndexById(displayItems: SettingItem[], id: string | undefined): number {
		if (id) {
			const index = displayItems.findIndex((item) => item.id === id && item.kind !== "section");
			if (index !== -1) {
				return index;
			}
		}
		return this.findNextSelectableIndex(0, 1, displayItems);
	}

	private findNextSelectableIndex(startIndex: number, direction: 1 | -1, displayItems?: SettingItem[]): number {
		const visibleItems = displayItems ?? (this.searchEnabled ? this.filteredItems : this.items);
		if (visibleItems.length === 0) {
			return 0;
		}

		let index = startIndex;
		for (let attempts = 0; attempts < visibleItems.length; attempts++) {
			if (index < 0) index = visibleItems.length - 1;
			if (index >= visibleItems.length) index = 0;
			if (visibleItems[index]?.kind !== "section") {
				return index;
			}
			index += direction;
		}

		return 0;
	}

	private addHintLine(lines: string[], width: number): void {
		lines.push("");
		lines.push(
			truncateToWidth(
				this.theme.hint(
					this.extraHint ??
						(this.searchEnabled
							? "  Type to search · Enter/Space to change · Esc to cancel"
							: "  Enter/Space to change · Esc to cancel"),
				),
				width,
			),
		);
	}
}
