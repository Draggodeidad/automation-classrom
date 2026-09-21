const context = $json;
const raw = String(context.rawModelText || '').trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\s*```$/i, '$1').trim();
let parsed = null;
let parseError = context.transportError || null;
let errorType = context.errorType || null;
let parseStatus = 'not_attempted';
let schemaStatus = 'not_attempted';
const statePrefix = String(context.llmAttempt?.stage || 'gemini').toUpperCase();
const stateHistory = [...(context.stateHistory || [])];
const identifierNormalizations = [];

if (!parseError) {
  stateHistory.push(`${statePrefix}_PARSE`);
  try {
    parsed = JSON.parse(raw);
    parseStatus = 'valid';
  } catch (error) {
    parseStatus = 'invalid';
    errorType = 'PARSE_ERROR';
    parseError = `JSON no parseable (${error.message})`;
  }
}

const schemaErrors = [];
const typeMatches = (value, type) => {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'null') return value === null;
  return typeof value === type;
};
const validateSchema = (value, rule, path = '$') => {
  if (!rule || typeof rule !== 'object') return;
  if (rule.type && !typeMatches(value, rule.type)) {
    schemaErrors.push(`${path}: se esperaba ${rule.type}`);
    return;
  }
  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
    schemaErrors.push(`${path}: valor fuera del enum`);
  }
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) schemaErrors.push(`${path}: longitud mínima ${rule.minLength}`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength) schemaErrors.push(`${path}: longitud máxima ${rule.maxLength}`);
    if (rule.pattern && !(new RegExp(rule.pattern).test(value))) schemaErrors.push(`${path}: patrón inválido`);
  }
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) schemaErrors.push(`${path}: mínimo ${rule.minimum}`);
    if (rule.maximum !== undefined && value > rule.maximum) schemaErrors.push(`${path}: máximo ${rule.maximum}`);
  }
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) schemaErrors.push(`${path}: mínimo ${rule.minItems} elementos`);
    if (rule.maxItems !== undefined && value.length > rule.maxItems) schemaErrors.push(`${path}: máximo ${rule.maxItems} elementos`);
    if (rule.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) schemaErrors.push(`${path}: elementos duplicados`);
    value.forEach((entry, index) => validateSchema(entry, rule.items, `${path}[${index}]`));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of rule.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) schemaErrors.push(`${path}: falta ${required}`);
    }
    if (rule.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(rule.properties || {}, key)) schemaErrors.push(`${path}: propiedad no permitida ${key}`);
      }
    }
    for (const [key, childRule] of Object.entries(rule.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateSchema(value[key], childRule, `${path}.${key}`);
    }
  }
};

if (!parseError) {
  stateHistory.push(`${statePrefix}_VALIDATE`);
  // Only normalize internal identifiers, atomically, when the mapping is unambiguous.
  if (Array.isArray(parsed?.issues)) {
    const keyRule = context.schema?.properties?.issues?.items?.properties?.key;
    const pattern = new RegExp(keyRule?.pattern || '^[a-z0-9][a-z0-9-]{1,39}$');
    const originals = parsed.issues.map((issue) => issue?.key);
    const normalized = originals.map((key) => typeof key === 'string' ? key.trim().toLowerCase().replace(/_/g, '-') : key);
    if (originals.every((key) => typeof key === 'string') &&
        new Set(originals).size === originals.length && new Set(normalized).size === normalized.length &&
        normalized.every((key) => pattern.test(key))) {
      const keyMap = new Map(originals.map((key, index) => [key, normalized[index]]));
      for (const [index, issue] of parsed.issues.entries()) {
        if (issue.key !== normalized[index]) identifierNormalizations.push({ path: `$.issues[${index}].key`, from: issue.key, to: normalized[index] });
        issue.key = normalized[index];
        if (Array.isArray(issue.dependsOn)) issue.dependsOn = issue.dependsOn.map((dependency, depIndex) => {
          const mapped = keyMap.get(dependency) ?? dependency;
          if (mapped !== dependency) identifierNormalizations.push({ path: `$.issues[${index}].dependsOn[${depIndex}]`, from: dependency, to: mapped });
          return mapped;
        });
      }
    }
  }
  if (!context.schema || context.schema.type !== 'object') throw new Error('AI_CONFIG_INVALID: schema local ausente');
  validateSchema(parsed, context.schema);
  // Reject collisions before the existing business normalizer could rename them.
  if (Array.isArray(parsed?.issues)) {
    const keys = parsed.issues.map((issue) => issue?.key);
    if (new Set(keys).size !== keys.length) schemaErrors.push('$.issues: keys duplicadas o ambiguas');
  }
  schemaStatus = schemaErrors.length ? 'invalid' : 'valid';
  if (schemaErrors.length) {
    errorType = 'SCHEMA_ERROR';
    parseError = schemaErrors.join('; ');
  } else if (context.normalizedResponse?.truncated) {
    errorType = 'PARSE_ERROR';
    parseStatus = 'invalid';
    parseError = 'Respuesta truncada por límite de salida; se requiere el JSON completo';
  }
}
const issues = !parseError && Array.isArray(parsed?.issues) ? parsed.issues : [];

const week = Number(context.week);
const weekPadded = String(context.weekPadded || (Number.isFinite(week) ? String(week).padStart(2, '0') : ''));
const identity = {
  course: context.course,
  week: Number.isFinite(week) ? week : null,
  weekPadded,
  repository: context.repository,
  assignmentTitle: context.assignmentTitle,
  deadline: context.dueAt ?? null,
  source: {
    courseId: context.courseId,
    courseWorkId: context.courseWorkId,
    updateTime: context.updateTime,
    starterName: context.starter?.name ?? null,
  },
};

const plan = { ...identity, issues };
const normalizedResponse = {
  ...(context.normalizedResponse || {}),
  parsed,
  error: parseError,
  errorType,
  parseStatus,
  schemaStatus,
  validationStatus: parseError ? 'invalid' : 'parsed',
  schemaErrors,
};

return [{ json: { ...context, errorType, parseError, parseStatus, schemaStatus, plan, normalizedResponse, identifierNormalizations, stateHistory } }];
