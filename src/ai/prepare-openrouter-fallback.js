const data = $json;
const currentStage = data.llmAttempt?.stage;
let stage;
let model;

if (['gemini', 'gemini_repair'].includes(currentStage) && data.nextState === 'QWEN_REQUEST') {
  stage = "qwen";
  model = data.aiConfig?.openRouterPrimaryModel;
} else if (currentStage === "qwen" && data.nextState === 'GLM_REQUEST') {
  stage = "glm";
  model = data.aiConfig?.openRouterFallbackModel;
} else {
  throw new Error(
    `AI_FALLBACK_EXHAUSTED: no existe fallback después de ${currentStage || "(desconocido)"}`,
  );
}

if (!model) throw new Error(`AI_CONFIG_INVALID: falta el modelo para ${stage}`);

return [
  {
    json: {
      ...data,
      llmState: `${stage.toUpperCase()}_REQUEST`,
      stateHistory: [...data.stateHistory, `${stage.toUpperCase()}_REQUEST`],
      nextState: null,
      fallbackUsed: true,
      rawModelText: "",
      parseError: null,
      validationErrors: [],
      valid: false,
      llmAttemptNumber: Number(data.llmAttemptNumber || 1) + 1,
      llmAttempt: {
        stage,
        provider: "openrouter",
        model,
        startedAt: Date.now(),
      },
    },
  },
];
