const failValidator = {
  executionResult: 'fail_validator',
  mode: 'dry-run',
  mutationsPerformed: false,
  state: 'FAIL_VALIDATOR',
  requestedProvider: 'gemini',
  lastProvider: $json.llmAttempt?.provider || null,
  lastModel: $json.llmAttempt?.model || null,
  repairUsed: Boolean($json.repairUsed),
  fallbackUsed: Boolean($json.fallbackUsed),
  attemptCount: ($json.aiObservability || []).length,
  failureReason: $json.failureReason || null,
  attempts: $json.aiObservability || [],
  stateHistory: $json.stateHistory || [],
};
throw new Error(`FAIL_VALIDATOR: ${JSON.stringify(failValidator)}`);