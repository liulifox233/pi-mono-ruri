import "./providers/register-builtins.js";

import { getApiProvider } from "./api-registry.js";
import { assertHostedToolTargets } from "./providers/hosted-activity.js";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	ProviderStreamOptions,
	SimpleStreamOptions,
	StreamOptions,
} from "./types.js";

export { getEnvApiKey } from "./env-api-keys.js";

const HOSTED_TOOL_APIS = new Set<Api>(["openai-responses", "openai-codex-responses", "anthropic-messages"]);

function assertHostedToolsSupported<TApi extends Api>(model: Model<TApi>, context: Context): void {
	assertHostedToolTargets(model, context.tools);
	const hostedTools = context.tools?.filter((tool) => tool.kind === "hosted") ?? [];
	if (hostedTools.length > 0 && !HOSTED_TOOL_APIS.has(model.api)) {
		throw new Error(
			`Provider API ${model.api} does not support hosted tools: ${hostedTools.map((tool) => tool.name).join(", ")}`,
		);
	}
}

function resolveApiProvider(api: Api) {
	const provider = getApiProvider(api);
	if (!provider) {
		throw new Error(`No API provider registered for api: ${api}`);
	}
	return provider;
}

export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): AssistantMessageEventStream {
	assertHostedToolsSupported(model, context);
	const provider = resolveApiProvider(model.api);
	return provider.stream(model, context, options as StreamOptions);
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): Promise<AssistantMessage> {
	const s = stream(model, context, options);
	return s.result();
}

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	assertHostedToolsSupported(model, context);
	const provider = resolveApiProvider(model.api);
	return provider.streamSimple(model, context, options);
}

export async function completeSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const s = streamSimple(model, context, options);
	return s.result();
}
