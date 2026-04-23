import assert from "node:assert";
import { describe, it } from "node:test";
import { SettingsList, type SettingsListTheme } from "../src/components/settings-list.js";

const testTheme: SettingsListTheme = {
	label: (text) => text,
	value: (text) => text,
	description: (text) => text,
	cursor: "> ",
	hint: (text) => text,
};

describe("SettingsList", () => {
	it("cycles raw values when the rendered value is formatted", () => {
		let changed: string | undefined;

		const list = new SettingsList(
			[
				{
					id: "compaction",
					label: "Auto-compact",
					currentValue: "true",
					displayValue: "On",
					values: ["true", "false"],
				},
			],
			5,
			testTheme,
			(_id, newValue) => {
				changed = newValue;
			},
			() => {},
		);

		list.handleInput(" ");

		assert.strictEqual(changed, "false");
	});

	it("preserves the selected item when the list is rebuilt", () => {
		const list = new SettingsList(
			[
				{
					id: "section:session",
					kind: "section",
					label: "Session",
					currentValue: "",
				},
				{
					id: "steering",
					label: "Steering mode",
					currentValue: "one-at-a-time",
				},
				{
					id: "compaction",
					label: "Auto-compact",
					currentValue: "true",
					displayValue: "On",
				},
			],
			5,
			testTheme,
			() => {},
			() => {},
		);

		list.handleInput("\x1b[B");
		assert.ok(list.render(80).some((line) => line.startsWith("> Auto-compact")));

		list.setItems([
			{
				id: "section:session",
				kind: "section",
				label: "Session",
				currentValue: "",
			},
			{
				id: "steering",
				label: "Steering mode",
				currentValue: "one-at-a-time",
			},
			{
				id: "compaction",
				label: "Auto-compact",
				currentValue: "false",
				displayValue: "Off",
			},
		]);

		assert.ok(list.render(80).some((line) => line.startsWith("> Auto-compact")));
	});
});
