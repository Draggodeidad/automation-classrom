// The builder binds this to the exact adapter node in each acyclic attempt branch.
const context = $('__LLM_REQUEST_NODE__').item.json;
if (!context?.llmAttempt?.stage) throw new Error('AI_CONTEXT_MISSING: falta el intento vinculado');
const envelope = $json || {};
let response = envelope.body ?? envelope;
if (typeof response === 'string') {
  try { response = JSON.parse(response); } catch { response = {}; }
}
const attempt = context.llmAttempt;
const errorSource = response?.error ?? envelope.error ?? null;
const statusValue = envelope.statusCode ?? errorSource?.httpCode ?? errorSource?.statusCode ?? response?.statusCode ?? response?.status;
const httpStatus = statusValue != null && Number.isFinite(Number(statusValue)) ? Number(statusValue) : null;
const redact = (value) => String(value)
  .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
  .replace(/(?:AIza[\w-]+|sk-[\w-]+)/g, '[REDACTED]')
  .replace(/((?:api[-_]?key|authorization|token|secret)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[REDACTED]')
  .slice(0, 2000);
const sanitize = (value, depth = 0) => {
  if (depth > 4) return '[omitted]';
  if (typeof value === 'string') return redact(value);
  if (value === null || typeof value !== 'object') return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitize(entry, depth + 1));
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/authorization|api[-_]?key|token|secret|credential|header/i.test(key))
    .slice(0, 30).map(([key, child]) => [key, sanitize(child, depth + 1)]));
};
const providerError = errorSource ? {
  status: errorSource.status ?? null,
  code: errorSource.code ?? httpStatus,
  message: redact(errorSource.message || (typeof errorSource === 'string' ? errorSource : 'Provider returned error')),
  details: sanitize(errorSource.details ?? null),
} : null;
const providerMessage = providerError?.message || redact(envelope.message || '');
let rawText = '';
let finishReason = '';
let blocked = false;
if (attempt.provider === 'gemini') {
  rawText = response?.candidates?.[0]?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || '').join('') || '';
  finishReason = String(response?.candidates?.[0]?.finishReason || '');
  blocked = Boolean(response?.promptFeedback?.blockReason) || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(finishReason);
} else {
  const content = response?.choices?.[0]?.message?.content;
  rawText = Array.isArray(content) ? content.map((part) => part?.text || '').join('') : content || '';
  finishReason = String(response?.choices?.[0]?.finish_reason || '');
  blocked = Boolean(response?.choices?.[0]?.message?.refusal) || finishReason === 'content_filter';
}
rawText = String(rawText).trim();
let errorType = null;
let message = null;
if (httpStatus === 429 || httpStatus === 408 || httpStatus >= 500) {
  errorType = 'TRANSPORT_ERROR';
  message = httpStatus === 429 ? 'Provider rate limit' : `HTTP ${httpStatus}: ${providerMessage || 'Provider unavailable'}`;
} else if (httpStatus !== null && (httpStatus < 200 || httpStatus >= 300)) {
  errorType = 'PROVIDER_ERROR';
  message = `HTTP ${httpStatus}: ${providerMessage || 'Request rejected'}`;
} else if (errorSource || envelope.message || blocked) {
  const networkError = /timeout|timed?\s*out|ETIMEDOUT|ECONN|ENOTFOUND|EAI_AGAIN|network|socket|connection/i.test(`${errorSource?.code || ''} ${providerMessage}`);
  errorType = networkError ? 'TRANSPORT_ERROR' : 'PROVIDER_ERROR';
  message = providerMessage || 'Provider blocked the response';
} else if (httpStatus === null) {
  errorType = 'TRANSPORT_ERROR';
  message = 'HTTP status missing';
}
const normalizedResponse = {
  provider: attempt.provider, model: attempt.model, responseModel: response?.model || attempt.model,
  success: false, rawText, parsed: null, error: message, errorType, providerError, httpStatus,
  finishReason, truncated: ['MAX_TOKENS', 'length'].includes(finishReason),
  parseStatus: 'not_attempted', schemaStatus: 'not_attempted', validationStatus: 'pending',
  transportStatus: errorType === 'TRANSPORT_ERROR' ? 'error' : 'ok',
  providerStatus: errorType === 'PROVIDER_ERROR' ? 'error' : 'ok',
  durationMs: Math.max(0, Date.now() - Number(attempt.startedAt || Date.now())),
};
return [{ json: {
  ...context, rawModelText: rawText, transportError: message, errorType, normalizedResponse,
  parseError: null, validationErrors: [], valid: false,
} }];
