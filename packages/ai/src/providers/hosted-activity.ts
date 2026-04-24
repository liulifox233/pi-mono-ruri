import type { Api, AssistantMessage, HostedToolActivity, Model, TextContent, Tool } from "../types.js";

function stableStringify(value: unknown): string | undefined {
	try {
		const serialized = JSON.stringify(value);
		return serialized === undefined ? undefined : serialized;
	} catch {
		return undefined;
	}
}

function formatCitations(activity: HostedToolActivity): string[] {
	if (!activity.citations?.length) return [];
	return activity.citations.map((citation, index) => {
		const label = citation.title ?? citation.url ?? citation.text ?? `citation ${index + 1}`;
		return citation.url && citation.url !== label ? `${label} (${citation.url})` : label;
	});
}

export function canReplayHostedActivity(
	sourceAssistant: AssistantMessage,
	targetModel: Model<Api>,
	activity: HostedToolActivity,
): boolean {
	return (
		sourceAssistant.provider === activity.provider &&
		sourceAssistant.api === activity.api &&
		activity.provider === targetModel.provider &&
		activity.api === targetModel.api
	);
}

export function hostedActivityToText(activity: HostedToolActivity): TextContent | undefined {
	const lines: string[] = [];
	const summary = activity.summary?.trim();
	if (summary) {
		lines.push(summary);
	} else {
		const argumentsText = stableStringify(activity.arguments);
		if (!argumentsText || argumentsText === "{}") return undefined;
		lines.push(`Hosted tool ${activity.name} activity: ${argumentsText}`);
	}

	const citations = formatCitations(activity);
	if (citations.length > 0) lines.push(`Citations: ${citations.join(", ")}`);
	return { type: "text", text: lines.join("\n") };
}

export function assertHostedToolTargets(model: Model<Api>, tools?: readonly Tool[]): void {
	const hostedTools = tools?.filter((tool) => tool.kind === "hosted") ?? [];
	for (const tool of hostedTools) {
		if (!tool.api) {
			throw new Error(`Hosted tool ${tool.name} must declare target api`);
		}
		if (tool.api !== model.api) {
			throw new Error(`Hosted tool ${tool.name} targets api ${tool.api} but current model uses ${model.api}`);
		}
		if (tool.provider && tool.provider !== model.provider) {
			throw new Error(
				`Hosted tool ${tool.name} targets provider ${tool.provider} but current model uses ${model.provider}`,
			);
		}
	}
}
