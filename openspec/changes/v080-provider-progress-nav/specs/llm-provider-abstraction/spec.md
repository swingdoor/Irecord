## ADDED Requirements

### Requirement: Provider registry with static configuration
The system SHALL maintain a registry of LLM providers, each with an id, display name, base URL, and list of supported models. The registry SHALL be defined as a static configuration in `src/main/llm/providers.ts`.

#### Scenario: Registry contains DashScope provider
- **WHEN** the system loads the provider registry
- **THEN** a provider with id `dashscope`, name `阿里百炼（DashScope）`, baseUrl `https://dashscope.aliyuncs.com/compatible-mode/v1`, and models `[qwen3-max, qwen3.6-plus, qwen3.5-flash]` SHALL be available

#### Scenario: Registry contains DeepSeek provider
- **WHEN** the system loads the provider registry
- **THEN** a provider with id `deepseek`, name `DeepSeek`, baseUrl `https://api.deepseek.com/v1`, and models `[deepseek-v4-flash, deepseek-v4-pro]` SHALL be available

### Requirement: Generic OpenAI-compatible LLM client
The system SHALL provide a single `callLLM` function that resolves the provider's base URL from the registry based on `settings.llmProvider`, then calls `{baseUrl}/chat/completions` with the standard OpenAI request format.

#### Scenario: Call LLM with DashScope provider
- **WHEN** `callLLM` is invoked with settings `{ llmProvider: 'dashscope', llmModel: 'qwen3-max' }`
- **THEN** the request SHALL be sent to `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` with model `qwen3-max`

#### Scenario: Call LLM with DeepSeek provider
- **WHEN** `callLLM` is invoked with settings `{ llmProvider: 'deepseek', llmModel: 'deepseek-v4-flash' }`
- **THEN** the request SHALL be sent to `https://api.deepseek.com/v1/chat/completions` with model `deepseek-v4-flash`

#### Scenario: Unknown provider
- **WHEN** `callLLM` is invoked with an unrecognized `llmProvider`
- **THEN** the system SHALL throw an error indicating the provider is not supported

### Requirement: Per-provider API Key storage
The system SHALL store API keys independently for each provider in a `llmApiKeys` map within AppSettings (e.g., `{ dashscope: 'sk-...', deepseek: 'sk-...' }`). The `callLLM` function SHALL read the key from `llmApiKeys[provider]`.

#### Scenario: Read API key for active provider
- **WHEN** `callLLM` is invoked with `llmProvider: 'deepseek'`
- **THEN** the API key SHALL be read from `settings.llmApiKeys.deepseek`

#### Scenario: Backward compatibility with legacy llmApiKey field
- **WHEN** `llmApiKeys` is empty or undefined but `llmApiKey` exists and `llmProvider` is `dashscope`
- **THEN** the system SHALL fall back to using `settings.llmApiKey` as the DashScope key

### Requirement: Settings UI provider-model linkage
The settings modal SHALL display a provider selector and a model selector. When the user changes the provider, the model selector SHALL update to show only models from the selected provider, and the API Key input SHALL reflect the key for the selected provider.

#### Scenario: Switch provider from DashScope to DeepSeek
- **WHEN** user selects DeepSeek in the provider dropdown
- **THEN** the model dropdown SHALL show `deepseek-v4-flash` and `deepseek-v4-pro`, and the API Key field SHALL show the stored DeepSeek key (or empty if none)

#### Scenario: Save settings with different provider keys
- **WHEN** user enters an API key for DeepSeek and saves
- **THEN** the key SHALL be stored in `llmApiKeys.deepseek` without affecting `llmApiKeys.dashscope`
