import type { ExtensionAPI, SettingsRuntimeContext } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.settings.registerSection({
		id: "provider-demo",
		label: "Provider Demo",
		order: 90,
	});

	pi.settings.register({
		id: "providerDemoMode",
		type: "select",
		section: "provider-demo",
		label: "Provider mode",
		description: "Example extension-owned setting stored under the extension namespace.",
		options: [{ value: "safe" }, { value: "fast" }],
		storage: {
			defaultValue: "safe",
		},
	});

	pi.settings.augment("thinking", {
		description: "Adds a provider-specific effort control below Thinking level.",
		children: [
			{
				id: "providerThinkingEffort",
				type: "select",
				section: "model",
				label: "Provider effort",
				description: "Only shown for Anthropic models in this example.",
				visible: (ctx: SettingsRuntimeContext) => ctx.model?.provider === "anthropic",
				options: [{ value: "low" }, { value: "medium" }, { value: "high" }],
				storage: {
					defaultValue: "medium",
				},
			},
		],
	});
}
