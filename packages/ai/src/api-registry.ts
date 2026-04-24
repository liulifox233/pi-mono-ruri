import type {
	Api,
	AssistantMessageEventStream,
	Context,
	Model,
	ProviderThinkingDescriptor,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
} from "./types.js";

export type ApiStreamFunction = (
	model: Model<Api>,
	context: Context,
	options?: StreamOptions,
) => AssistantMessageEventStream;

export type ApiStreamSimpleFunction = (
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

export interface ApiProvider<TApi extends Api = Api, TOptions extends StreamOptions = StreamOptions> {
	api: TApi;
	stream: StreamFunction<TApi, TOptions>;
	streamSimple: StreamFunction<TApi, SimpleStreamOptions>;
	thinking?: ProviderThinkingDescriptor<TApi>;
}

interface ApiProviderInternal {
	api: Api;
	stream: ApiStreamFunction;
	streamSimple: ApiStreamSimpleFunction;
	thinking?: ProviderThinkingDescriptor<Api>;
}

type RegisteredApiProvider = {
	provider: ApiProviderInternal;
	sourceId?: string;
};

const apiProviderRegistry = new Map<string, RegisteredApiProvider>();

function wrapStream<TApi extends Api, TOptions extends StreamOptions>(
	api: TApi,
	stream: StreamFunction<TApi, TOptions>,
): ApiStreamFunction {
	return (model, context, options) => {
		if (model.api !== api) {
			throw new Error(`Mismatched api: ${model.api} expected ${api}`);
		}
		return stream(model as Model<TApi>, context, options as TOptions);
	};
}

function wrapStreamSimple<TApi extends Api>(
	api: TApi,
	streamSimple: StreamFunction<TApi, SimpleStreamOptions>,
): ApiStreamSimpleFunction {
	return (model, context, options) => {
		if (model.api !== api) {
			throw new Error(`Mismatched api: ${model.api} expected ${api}`);
		}
		return streamSimple(model as Model<TApi>, context, options);
	};
}

function wrapThinkingDescriptor<TApi extends Api>(
	api: TApi,
	descriptor: ProviderThinkingDescriptor<TApi>,
): ProviderThinkingDescriptor<Api> {
	const assertModel = (model: Model<Api>): Model<TApi> => {
		if (model.api !== api) {
			throw new Error(`Mismatched api: ${model.api} expected ${api}`);
		}
		return model as Model<TApi>;
	};

	return {
		getOptions: (model) => descriptor.getOptions.call(descriptor, assertModel(model)),
		toProviderValue: (value, model) => descriptor.toProviderValue.call(descriptor, value, assertModel(model)),
	};
}

export function registerApiProvider<TApi extends Api, TOptions extends StreamOptions>(
	provider: ApiProvider<TApi, TOptions>,
	sourceId?: string,
): void {
	apiProviderRegistry.set(provider.api, {
		provider: {
			api: provider.api,
			stream: wrapStream(provider.api, provider.stream),
			streamSimple: wrapStreamSimple(provider.api, provider.streamSimple),
			thinking: provider.thinking ? wrapThinkingDescriptor(provider.api, provider.thinking) : undefined,
		},
		sourceId,
	});
}

export function getApiProvider(api: Api): ApiProviderInternal | undefined {
	return apiProviderRegistry.get(api)?.provider;
}

export function getApiProviders(): ApiProviderInternal[] {
	return Array.from(apiProviderRegistry.values(), (entry) => entry.provider);
}

export function unregisterApiProviders(sourceId: string): void {
	for (const [api, entry] of apiProviderRegistry.entries()) {
		if (entry.sourceId === sourceId) {
			apiProviderRegistry.delete(api);
		}
	}
}

export function clearApiProviders(): void {
	apiProviderRegistry.clear();
}
