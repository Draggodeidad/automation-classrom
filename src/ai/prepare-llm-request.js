const primaryProvider = String($env.AI_PRIMARY_PROVIDER || "gemini")
  .trim()
  .toLowerCase();
if (primaryProvider !== "gemini") {
  throw new Error(
    `AI_CONFIG_INVALID: AI_PRIMARY_PROVIDER debe ser gemini; recibido ${primaryProvider || "(vacío)"}`,
  );
}

const temperature = Number($env.AI_TEMPERATURE ?? 0.1);
if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
  throw new Error("AI_CONFIG_INVALID: AI_TEMPERATURE debe estar entre 0 y 2");
}

const aiConfig = {
  primaryProvider: "gemini",
  geminiModel: String($env.GEMINI_MODEL || "gemini-3.6-flash").trim(),
  openRouterPrimaryModel: String(
    $env.OPENROUTER_PRIMARY_MODEL || "qwen/qwen3.8-27b:free",
  ).trim(),
  openRouterFallbackModel: String(
    $env.OPENROUTER_FALLBACK_MODEL || "z-ai/glm-5.2:free",
  ).trim(),
  temperature,
};

if (
  aiConfig.openRouterPrimaryModel !== "qwen/qwen3.8-27b:free" ||
  aiConfig.openRouterFallbackModel !== "z-ai/glm-5.2:free"
) {
  throw new Error(
    "AI_CONFIG_INVALID: los modelos OpenRouter deben ser qwen/qwen3.8-27b:free y z-ai/glm-5.2:free",
  );
}

const llmRequest = {
  systemPrompt: $json.systemPrompt,
  userPrompt: $json.userPrompt,
  schema: $json.schema,
  geminiSchema: $json.geminiSchema,
};
// One canonical output contract, including the complete local schema for text lanes.
llmRequest.systemPrompt = `${llmRequest.systemPrompt || ""}\n\nReturn ONLY valid JSON. Do not wrap the response in Markdown. Do not use \`\`\`json fences. The output must match the provided schema.\nJSON Schema:\n${JSON.stringify(llmRequest.schema)}`;
if (
  !String(llmRequest.systemPrompt || "").trim() ||
  !String(llmRequest.userPrompt || "").trim() ||
  !llmRequest.schema
) {
  throw new Error("AI_CONFIG_INVALID: falta el request canónico o su schema");
}

return [
  {
    json: {
      ...$json,
      mode: "dry-run",
      automationMode: "dry-run",
      aiConfig,
      llmRequest,
      llmAttemptNumber: 1,
      llmState: "GEMINI_REQUEST",
      stateHistory: ["GEMINI_REQUEST"],
      repairUsed: false,
      fallbackUsed: false,
      llmAttempt: {
        stage: "gemini",
        provider: "gemini",
        model: aiConfig.geminiModel,
        startedAt: Date.now(),
      },
      aiExecution: {
        requestedProvider: "gemini",
        resolvedProvider: null,
        resolvedModel: null,
        fallbackUsed: false,
        repairUsed: false,
      },
      aiObservability: [],
      mutationsPerformed: false,
    },
  },
];
