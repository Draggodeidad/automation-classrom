const data = $json;
const request = data.llmRequest;
const attempt = data.llmAttempt;
let llmPayload;
if (attempt.provider === 'gemini') {
  const contents = [{ role: 'user', parts: [{ text: request.userPrompt }] }];
  if (attempt.stage === 'gemini_repair') {
    contents.push(
      { role: 'model', parts: [{ text: data.repairInput.previousResponse }] },
      { role: 'user', parts: [{ text: data.repairInput.prompt }] },
    );
  }
  llmPayload = {
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: request.geminiSchema },
  };
} else if (['qwen', 'glm'].includes(attempt.stage)) {
  llmPayload = {
    model: attempt.model,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ],
    temperature: data.aiConfig.temperature,
    // No implicit provider retries; the workflow owns the bounded fallback chain.
    provider: { allow_fallbacks: false },
  };
  if (attempt.stage === 'qwen') {
    llmPayload.response_format = { type: 'json_schema', json_schema: { name: 'issue_plan', strict: true, schema: request.schema } };
    llmPayload.provider.require_parameters = true;
  }
  // GLM deliberately has no response_format, tools or tool_choice.
} else {
  throw new Error('AI_STATE_INVALID: adapter desconocido');
}
return [{ json: { ...data, llmPayload } }];
