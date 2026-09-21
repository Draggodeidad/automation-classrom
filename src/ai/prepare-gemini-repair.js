const data = $json;
const REPAIRABLE = new Set([
  'PARSE_ERROR', 'SCHEMA_ERROR', 'GROUNDING_ERROR', 'PROVENANCE_ERROR',
  'SEMANTIC_ERROR', 'DEPENDENCY_ERROR',
]);
if (data.llmAttempt?.stage !== 'gemini' || data.repairUsed ||
    data.nextState !== 'GEMINI_REPAIR_REQUEST' ||
    !REPAIRABLE.has(data.errorType)) {
  throw new Error('AI_STATE_INVALID: Gemini Repair sólo puede ejecutarse una vez después de un error reparable');
}
const repairPrompt = [
  'Tu respuesta anterior no pasó la validación.',
  'Errores encontrados:',
  JSON.stringify(data.validationErrors, null, 2),
  'Corrige únicamente los errores indicados.',
  'Conserva el contenido correcto existente. No agregues requisitos inventados.',
  'No inventes ni sustituyas evidence IDs de groundingCatalog para justificar un detalle: si un detalle no está respaldado por las fuentes originales, elimínalo o hazlo genérico.',
  'No agregues archivos, comandos, versiones, rutas, endpoints o criterios que no estén respaldados por las fuentes originales.',
  'Respeta el schema original. Devuelve el JSON completo y exclusivamente JSON.',
].join('\n');
return [{ json: {
  ...data,
  repairInput: { previousResponse: data.rawModelText, validationErrors: data.validationErrors, prompt: repairPrompt },
  repairUsed: true,
  llmAttemptNumber: data.llmAttemptNumber + 1,
  llmAttempt: { stage: 'gemini_repair', provider: 'gemini', model: data.aiConfig.geminiModel, startedAt: Date.now() },
  llmState: 'GEMINI_REPAIR_REQUEST',
  stateHistory: [...data.stateHistory, 'GEMINI_REPAIR_REQUEST'],
  nextState: null,
  valid: false,
} }];
