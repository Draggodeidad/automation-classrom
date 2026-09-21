const failClosed = {
  executionResult: 'fail_closed',
  mode: 'dry-run',
  mutationsPerformed: false,
  state: 'FAIL_CLOSED',
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
throw new Error(`FAIL_CLOSED: ${JSON.stringify(failClosed)}`);
