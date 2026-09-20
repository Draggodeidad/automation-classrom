const data = $json;
const plan = data.plan || {};
const issues = Array.isArray(plan.issues) ? plan.issues : [];
const catalog = data.groundingCatalog || {};
const errors = [];
const addError = (code, message, retryable = true, extra = {}) =>
  errors.push({ code, message, retryable, ...extra });
const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const sourceValues = new Set([
  "classroom",
  "starter",
  "repository",
  "workflowConfiguration",
]);
const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en",
  "y", "o", "u", "a", "al", "con", "por", "para", "que", "es", "son", "como",
  "se", "su", "sus", "lo", "le", "the", "and", "or", "of", "to", "in", "for",
  "on", "with", "this", "that", "it", "is", "are", "was", "were", "be", "been",
  "usa", "usan", "usar", "uso", "hace", "hacer", "haz", "realizar", "realice",
  "realiza", "completar", "complete", "documentar", "documente", "ejecutar",
  "ejecute", "ejecuten", "generar", "genere", "verificar", "verifique",
  "revisar", "revisa", "agregar", "crear", "crea", "debe", "deben", "puede",
  "pueden", "requiere", "requieren", "implementar", "implementa", "mantener",
  "quede", "queda", "respetar", "emplear", "registrar", "registre",
  "preparar", "prepara", "consolidar", "consolida", "reunir", "reune",
  "tomar", "llevar", "cada", "todo", "toda", "todos", "todas", "mismo",
  "misma", "nuevo", "nueva", "segun", "sobre", "bajo", "ante", "hasta",
  "desde", "entre", "durante", "mediante", "contra", "sin", "trav",
  "cual", "cuales", "quien", "quienes", "donde", "cuando", "como",
]);
const wordsOf = (value) =>
  normalize(value)
    .split(/[^a-z0-9._/+:@=-]+/i)
    .filter((word) => word.length >= 3);
const significant = (value) =>
  wordsOf(value).filter((word) => !STOPWORDS.has(word));
const TECHNICAL_PATTERNS = [
  /\b(?:npm|pnpm|yarn|bun|npx|node|python3?|pytest|make|docker(?:[ \t]+compose)?|git|go[ \t]+test|mvn|gradle|swift[ \t]+test)[ \t]+[A-Za-z0-9_./:@=-]+(?:[ \t]+[A-Za-z0-9_./:@=-]+){0,1}/gi,
  /\bhttps?:\/\/[^\s)`"']+/gi,
  /(?:^|[\s`("'])((?:\.?\.?\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|ya?ml|md|py|java|kt|swift|go|rs|css|html|sql|sh|toml))\b/gim,
  /\b(?:node(?:\.js)?|python|npm|pnpm|yarn|java|go)\s+v?\d+(?:\.\d+){0,2}\b/gi,
];
const technicalTokens = (value) => {
  const found = new Set();
  for (const pattern of TECHNICAL_PATTERNS)
    for (const match of String(value || "").matchAll(pattern))
      found.add(String(match[1] || match[0]).trim());
  return [...found];
};
const resolveEvidence = (record) => {
  if (!record || !String(record.evidence || "").trim())
    return { status: "missing_evidence" };
  const entry = catalog[record.evidence];
  if (!entry) return { status: "unresolved_id", evidence: record.evidence };
  if (!sourceValues.has(record.source) || entry.source !== record.source)
    return {
      status: "unresolved_source",
      evidence: record.evidence,
      source: record.source,
      expected: entry.source,
    };
  return { status: "resolved", entry, sourceId: record.evidence };
};
const claimSupported = (claim, content) => {
  const c = normalize(claim);
  const k = normalize(content);
  if (!c) return { supported: false, reason: "Claim vacío" };
  if (!k) return { supported: false, reason: "Fuente sin contenido" };
  if (k.includes(c) || (c.length >= 4 && c.includes(k)))
    return { supported: true, matchType: "containment" };
  const technical = technicalTokens(c);
  if (technical.length) {
    if (technical.some((token) => k.includes(normalize(token))))
      return { supported: true, matchType: "technical-token-match" };
  }
  const claimWords = significant(c);
  const contentWords = new Set(significant(k));
  if (!claimWords.length)
    return { supported: false, reason: "Sin términos significativos" };
  const shared = claimWords.filter((word) => contentWords.has(word)).length;
  if (shared >= 2 && shared / claimWords.length >= 2 / 3)
    return { supported: true, matchType: "semantic-overlap" };
  return { supported: false, reason: "Sin respaldo verificable en la fuente" };
};
const isSectionDetailGrounded = (detail, records) => {
  const d = normalize(detail);
  if (!d) return true;
  const detailTechnical = technicalTokens(detail);
  return records.some((record) => {
    const claim = normalize(record.claim);
    if (!claim) return false;
    if (claim.includes(d)) return true;
    if (detailTechnical.length) {
      const claimTechnical = technicalTokens(record.claim);
      return claimTechnical.some((token) => normalize(token) === d);
    }
    return false;
  });
};
const difficultyWeight = { easy: 1, medium: 2, hard: 3 };
const allowedCategories = new Set([
  "implementation",
  "testing",
  "documentation",
  "evidence",
  "validation",
  "ui",
  "integration",
  "infrastructure",
  "setup",
  "delivery",
]);
const allowedTypes = new Set(["feature", "test", "docs", "devops", "evidence"]);
const allowedPriorities = new Set(["high", "medium", "low"]);
const allowedRisk = new Set(["low", "medium", "high"]);
const HEADINGS = [
  "## Historia de Usuario",
  "## Contexto",
  "## Objetivo técnico",
  "## Alcance",
  "## Fuera de alcance",
  "## Archivos esperados",
  "## Pasos sugeridos",
  "## Criterios de aceptación",
  "## Pruebas",
  "## Dependencias",
  "## Evidencia individual",
  "## Definition of Done",
];
const concreteDetails = (issue) => {
  const text = [
    issue?.title,
    ...Object.values(issue?.sections || {}).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    ),
  ].join("\n");
  const found = new Set();
  const patterns = [
    /\b(?:npm|pnpm|yarn|bun|npx|node|python3?|pytest|make|docker(?:[ \t]+compose)?|git|go[ \t]+test|mvn|gradle|swift[ \t]+test)[ \t]+[A-Za-z0-9_./:@=-]+(?:[ \t]+[A-Za-z0-9_./:@=-]+){0,1}/gi,
    /\bhttps?:\/\/[^\s)`"']+/gi,
    /(?:^|[\s`("'])((?:\.?\.?\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+|[A-Za-z0-9_.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|ya?ml|md|py|java|kt|swift|go|rs|css|html|sql|sh|toml))\b/gim,
    /\b(?:node(?:\.js)?|python|npm|pnpm|yarn|java|go)\s+v?\d+(?:\.\d+){0,2}\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern))
      found.add(String(match[1] || match[0]).trim());
  }
  return [...found];
};

const groundingReport = {
  status: "valid",
  validatedClaims: 0,
  validatedTechnicalDetails: 0,
  unresolvedClaims: [],
  unresolvedTechnicalDetails: [],
};

if (data.parseError) {
  const messages = data.normalizedResponse?.schemaErrors?.length
    ? data.normalizedResponse.schemaErrors : [data.parseError];
  for (const message of messages)
    addError(data.errorType || "SCHEMA_ERROR", message);
}

if (!data.parseError) {
  const weekPadded = String(
    plan.weekPadded || String(plan.week || "").padStart(2, "0"),
  );
  const prefix = `[${plan.course}][W${weekPadded}]`;
  if (issues.length < 1 || issues.length > 10)
    addError(
      "INVALID_ISSUE_COUNT",
      `issues=${issues.length}; se requieren entre 1 y 10 después de agregar tareas operacionales`,
    );

  const allKeys = new Set(issues.map((issue) => issue.key));
  const seenKeys = new Set();
  const seenTitles = new Set();
  for (const [index, issue] of issues.entries()) {
    const where = `issues[${index}]`;
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(issue.key || ""))
      addError("INVALID_KEY", `${where}: key inválida`);
    if (seenKeys.has(issue.key))
      addError(
        "DUPLICATE_KEY",
        `${where}: key duplicada "${issue.key}"`,
        false,
      );
    seenKeys.add(issue.key);
    if (!allowedTypes.has(issue.type))
      addError("INVALID_TYPE", `${where}: type "${issue.type}" no permitido`);
    if (!allowedPriorities.has(issue.priority))
      addError(
        "INVALID_PRIORITY",
        `${where}: priority "${issue.priority}" no permitida`,
      );
    if (!allowedCategories.has(issue.category))
      addError(
        "INVALID_CLASSIFICATION",
        `${where}: category "${issue.category}" no permitida`,
      );
    if (!(issue.difficulty in difficultyWeight))
      addError("INVALID_CLASSIFICATION", `${where}: difficulty inválida`);
    if (difficultyWeight[issue.difficulty] !== issue.estimatedWeight)
      addError(
        "INVALID_WEIGHT",
        `${where}: ${issue.difficulty} debe pesar ${difficultyWeight[issue.difficulty]}`,
      );
    if (!allowedRisk.has(issue.risk))
      addError("INVALID_CLASSIFICATION", `${where}: risk inválido`);
    if (
      typeof issue.requiresCoding !== "boolean" ||
      typeof issue.requiresRepositoryKnowledge !== "boolean"
    )
      addError(
        "INVALID_CLASSIFICATION",
        `${where}: flags de capacidad inválidos`,
      );

    if (!String(issue.title || "").startsWith(`${prefix} `))
      addError("INVALID_TITLE", `${where}: title sin prefijo ${prefix}`, false);
    const semanticTitle = String(issue.title || "").replace(
      /^\s*\[[A-Za-z0-9]+\]\[W\d{1,2}\]\s*/,
      "",
    );
    if (seenTitles.has(semanticTitle))
      addError(
        "DUPLICATE_TITLE",
        `${where}: título semántico duplicado "${semanticTitle}"`,
      );
    seenTitles.add(semanticTitle);

    const internal = issue.requirementKind === "internalWorkflowRequirement";
    if (!internal && issue.requirementKind !== "sourceRequirement")
      addError(
        "INVALID_REQUIREMENT_KIND",
        `${where}: requirementKind inválido`,
      );
    if (internal && !["foundation", "classroom-delivery"].includes(issue.key))
      addError(
        "INVALID_REQUIREMENT_KIND",
        `${where}: sólo setup y entrega pueden ser reglas internas`,
        false,
      );
    if (!internal && issue.assignee)
      addError(
        "PREMATURE_ASSIGNMENT",
        `${where}: el LLM no debe elegir assignee`,
      );
    if (internal && issue.assignee !== "Draggodeidad")
      addError(
        "INVALID_OPERATIONAL_OWNER",
        `${where}: tarea operacional no asignada al owner`,
        false,
      );

    const gap = issue.gapAnalysis || {};
    if (!["missing", "partial"].includes(gap.status))
      addError(
        "INVALID_GAP_ANALYSIS",
        `${where}: el plan final no puede contener status=${gap.status}`,
      );
    if (
      !String(gap.summary || "").trim() ||
      !Array.isArray(gap.evidence) ||
      gap.evidence.length === 0
    )
      addError("INVALID_GAP_ANALYSIS", `${where}: Gap Analysis incompleto`);
    for (const evidenceId of gap.evidence || [])
      if (!catalog[evidenceId])
        addError(
          "UNKNOWN_EVIDENCE",
          `${where}: evidencia de gap inexistente "${evidenceId}"`,
          true,
          { kind: "provenance" },
        );

    const provenance = Array.isArray(issue.provenance) ? issue.provenance : [];
    const supportedRecords = [];
    const claimErrors = [];
    for (const record of provenance) {
      const resolution = resolveEvidence(record);
      if (resolution.status !== "resolved") {
        const reason =
          resolution.status === "unresolved_id"
            ? `Evidence ID no existe en groundingCatalog: "${record.evidence}"`
            : `source "${record.source}" no coincide con la fuente de "${record.evidence}"`;
        claimErrors.push({
          kind: "provenance",
          code: "UNRESOLVED_EVIDENCE",
          issueKey: issue.key,
          detail: record.claim || "",
          reason,
          sourceId: record.evidence,
          message: `${where}: evidence no resoluble "${record.evidence || ""}" (${reason})`,
        });
        continue;
      }
      const support = claimSupported(record.claim, resolution.entry.content);
      if (!support.supported) {
        claimErrors.push({
          kind: "grounding",
          code: "UNGROUNDED_CLAIM",
          issueKey: issue.key,
          detail: record.claim || "",
          reason: support.reason,
          sourceId: resolution.sourceId,
          message: `${where}: claim sin respaldo verificable "${record.claim || ""}" (${record.evidence})`,
        });
        continue;
      }
      supportedRecords.push({
        ...record,
        sourceId: resolution.sourceId,
        matchType: support.matchType,
      });
    }
    groundingReport.validatedClaims += supportedRecords.length;
    claimErrors.forEach((error) => {
      addError(error.code, error.message, true, error);
      groundingReport.unresolvedClaims.push({
        text: error.detail,
        reason: error.reason,
        sourceId: error.sourceId,
      });
      if (error.kind === "provenance")
        groundingReport.status = "invalid";
    });
    if (claimErrors.some((error) => error.kind === "grounding"))
      groundingReport.status = "invalid";

    const detailErrors = [];
    for (const detail of concreteDetails(issue)) {
      if (isSectionDetailGrounded(detail, supportedRecords))
        groundingReport.validatedTechnicalDetails += 1;
      else
        detailErrors.push({
          kind: "grounding",
          code: "UNGROUNDED_TECHNICAL_DETAIL",
          issueKey: issue.key,
          detail,
          reason: "No matching provenance",
          message: `${where}: detalle técnico sin provenance: "${detail}"`,
        });
    }
    for (const detailError of detailErrors) {
      const coveredBySupported = supportedRecords.some((record) =>
        normalize(record.claim).includes(normalize(detailError.detail)),
      );
      if (coveredBySupported) {
        detailError.kind = "validator";
        detailError.code = "VALIDATOR_INTERNAL";
        detailError.message = `${where}: el validator ignoró provenance resoluble que respalda "${detailError.detail}"`;
        detailError.reason = "Provenance resoluble ignorado por el validator";
      }
      addError(detailError.code, detailError.message, true, detailError);
      groundingReport.unresolvedTechnicalDetails.push({
        text: detailError.detail,
        reason: detailError.reason,
      });
    }
    if (detailErrors.length) groundingReport.status = "invalid";
    issue.groundingStatus = claimErrors.length || detailErrors.length ? "invalid" : "grounded";

    const sections = issue.sections || {};
    if (
      !String(sections.historiaUsuario || "").trim() ||
      !String(sections.contexto || "").trim()
    )
      addError("MISSING_CONTENT", `${where}: faltan narrativa o contexto`);
    if (
      (sections.objetivoTecnico || []).length < 1 ||
      (sections.criteriosAceptacion || []).length < 2 ||
      (sections.pruebas || []).length < 1 ||
      (sections.evidenciaIndividual || []).length < 1
    )
      addError(
        "MISSING_CONTENT",
        `${where}: secciones obligatorias incompletas`,
      );
    const body = String(issue.body || "");
    let last = -1;
    for (const heading of HEADINGS) {
      const occurrences = body.split(heading).length - 1;
      if (occurrences !== 1)
        addError(
          "INVALID_BODY",
          `${where}: header "${heading}" aparece ${occurrences} veces`,
          false,
        );
      const position = body.indexOf(heading);
      if (position >= 0 && position < last)
        addError("INVALID_BODY", `${where}: headers fuera de orden`, false);
      last = Math.max(last, position);
    }

    const seenDeps = new Set();
    for (const dependency of Array.isArray(issue.dependsOn)
      ? issue.dependsOn
      : []) {
      if (dependency === issue.key)
        addError(
          "SELF_DEPENDENCY",
          `${where}: depende de sí misma`,
          true,
          { kind: "dependency" },
        );
      else if (!allKeys.has(dependency))
        addError(
          "INVALID_DEPENDENCY",
          `${where}: depende de key inexistente "${dependency}"`,
          true,
          { kind: "dependency" },
        );
      if (seenDeps.has(dependency))
        addError(
          "INVALID_DEPENDENCY",
          `${where}: dependencia duplicada "${dependency}"`,
          true,
          { kind: "dependency" },
        );
      seenDeps.add(dependency);
    }
  }

  for (const dropped of data.normalization?.droppedDependencies || [])
    addError(
      dropped.reason,
      `${dropped.issue} → ${dropped.dependency}: ${dropped.reason}`,
      true,
      { kind: "dependency" },
    );

  const foundation = issues.find((issue) => issue.key === "foundation");
  if (data.starter?.found) {
    if (
      !foundation ||
      issues[0] !== foundation ||
      foundation.assignee !== "Draggodeidad" ||
      foundation.dependsOn.length
    )
      addError("INVALID_FOUNDATION", "Foundation operacional inválida", false);
  } else if (foundation)
    addError(
      "INVALID_FOUNDATION",
      "Foundation no debe existir sin starter",
      false,
    );
  const delivery = issues.find((issue) => issue.key === "classroom-delivery");
  if (!delivery || delivery.assignee !== "Draggodeidad")
    addError(
      "INVALID_DELIVERY",
      "Falta la entrega operacional del owner",
      false,
    );
  else {
    const expected = issues
      .filter((issue) => issue.key !== "classroom-delivery")
      .map((issue) => issue.key);
    if (expected.some((key) => !delivery.dependsOn.includes(key)))
      addError(
        "INVALID_DELIVERY",
        "La entrega no depende de todo el trabajo necesario",
        false,
      );
  }

  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const indegree = new Map(issues.map((issue) => [issue.key, 0]));
  const outgoing = new Map(issues.map((issue) => [issue.key, []]));
  for (const issue of issues)
    for (const dependency of issue.dependsOn || [])
      if (byKey.has(dependency)) {
        indegree.set(issue.key, indegree.get(issue.key) + 1);
        outgoing.get(dependency).push(issue.key);
      }
  const queue = issues
    .filter((issue) => indegree.get(issue.key) === 0)
    .map((issue) => issue.key);
  let visited = 0;
  while (queue.length) {
    const key = queue.shift();
    visited += 1;
    for (const next of outgoing.get(key)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (visited !== issues.length)
    addError(
      "DEPENDENCY_CYCLE",
      "el grafo de dependencias contiene ciclos",
      true,
      { kind: "dependency" },
    );

  if (Array.isArray(data.resumeKeys) && data.resumeKeys.length) {
    const expected = [...new Set(data.resumeKeys)].sort().join(",");
    const actual = [
      ...new Set(
        issues
          .filter((issue) => issue.requirementKind === "sourceRequirement")
          .map((issue) => issue.key),
      ),
    ]
      .sort()
      .join(",");
    if (actual !== expected)
      addError(
        "RESUME_KEYS_MISMATCH",
        `keys funcionales esperadas ${expected}; recibidas ${actual}`,
      );
  }
}

// A single transition table owns routing; IF nodes only inspect nextState.
let valid = errors.length === 0 && data.parseStatus === 'valid' && data.schemaStatus === 'valid';
const hasParseIssue = Boolean(data.parseError);
let internalDetected = errors.some((error) => error.kind === "validator");
if (data.schemaStatus === "valid" && data.errorType === "SCHEMA_ERROR" && !hasParseIssue) {
  internalDetected = true;
  addError(
    "VALIDATOR_INTERNAL",
    "Inconsistencia interna: schemaStatus=valid no puede producir SCHEMA_ERROR",
    false,
    { kind: "validator" },
  );
  valid = false;
}
const provenanceDetected = errors.some((error) => error.kind === "provenance");
const groundingDetected = errors.some((error) => error.kind === "grounding");
const dependencyDetected = errors.some((error) => error.kind === "dependency");
const semanticDetected = errors.some((error) => !error.kind);

let errorType;
if (hasParseIssue) errorType = data.errorType || "SCHEMA_ERROR";
else if (internalDetected) errorType = "VALIDATOR_INTERNAL_ERROR";
else if (provenanceDetected) errorType = "PROVENANCE_ERROR";
else if (groundingDetected) errorType = "GROUNDING_ERROR";
else if (dependencyDetected) errorType = "DEPENDENCY_ERROR";
else if (semanticDetected) errorType = "SEMANTIC_ERROR";
else errorType = valid ? "VALID" : "SCHEMA_ERROR";

const statuses = {
  transportStatus: data.normalizedResponse?.transportStatus || "not_attempted",
  providerStatus: data.normalizedResponse?.providerStatus || "not_attempted",
  parseStatus: data.parseStatus || "not_attempted",
  schemaStatus: data.schemaStatus || "not_attempted",
  groundingStatus:
    provenanceDetected || groundingDetected
      ? "invalid"
      : hasParseIssue ? "not_attempted" : "valid",
  semanticStatus: semanticDetected
    ? "invalid"
    : hasParseIssue ? "not_attempted" : "valid",
  dependencyStatus: dependencyDetected
    ? "invalid"
    : hasParseIssue ? "not_attempted" : "valid",
  finalPlanStatus: valid ? "accepted" : "rejected",
};

const failureReason = valid ? null : {
  errorType,
  provider: data.llmAttempt?.provider || null,
  model: data.llmAttempt?.model || null,
  httpStatus: data.normalizedResponse?.httpStatus ?? null,
  message: data.normalizedResponse?.error || errors.map((error) => error.message).join("; "),
  ...(["PARSE_ERROR", "SCHEMA_ERROR"].includes(errorType)
    ? { validationErrors: errors.map((error) => error.message) } : {}),
  ...(["GROUNDING_ERROR", "PROVENANCE_ERROR"].includes(errorType)
    ? {
        validationErrors: errors.map((error) => error.message),
        groundingErrors: errors
          .filter((error) => ["grounding", "provenance"].includes(error.kind))
          .map((error) => ({
            issueKey: error.issueKey,
            detail: error.detail,
            reason: error.reason,
            sourceId: error.sourceId || null,
          })),
      }
    : {}),
  ...(errorType === "VALIDATOR_INTERNAL_ERROR"
    ? {
        message: "Provenance resoluble ignorado por el validator",
        details: errors
          .filter((error) => error.kind === "validator")
          .map((error) => ({
            issueKey: error.issueKey,
            detail: error.detail,
            matchedSourceId: error.sourceId || null,
            message: error.message,
          })),
      }
    : {}),
};
const stage = data.llmAttempt?.stage || 'gemini';
const repairUsed = Boolean(data.repairUsed);
const fallbackUsed = ['qwen', 'glm'].includes(stage);
const REPAIRABLE = new Set([
  'PARSE_ERROR', 'SCHEMA_ERROR', 'GROUNDING_ERROR', 'PROVENANCE_ERROR',
  'SEMANTIC_ERROR', 'DEPENDENCY_ERROR',
]);
const transitions = { gemini_repair: 'QWEN_REQUEST', qwen: 'GLM_REQUEST', glm: 'FAIL_CLOSED' };
let nextState;
if (valid) nextState = 'PLAN_VALID';
else if (errorType === 'VALIDATOR_INTERNAL_ERROR') nextState = 'FAIL_VALIDATOR';
else if (stage === 'gemini') nextState = !repairUsed && REPAIRABLE.has(errorType)
  ? 'GEMINI_REPAIR_REQUEST' : 'QWEN_REQUEST';
else nextState = transitions[stage];
if (!nextState) throw new Error('AI_STATE_INVALID: transición desconocida');
const normalizedResponse = {
  ...(data.normalizedResponse || {}),
  success: valid,
  error: failureReason?.message || null,
  errorType,
  failureReason,
  validationStatus: valid ? 'valid' : 'invalid',
  ...statuses,
  groundingReport,
};
const stateHistory = [...(data.stateHistory || [])];
if (!hasParseIssue && data.schemaStatus === 'valid')
  stateHistory.push(`${String(stage).toUpperCase()}_GROUNDING_VALIDATE`);
if (['PLAN_VALID', 'FAIL_CLOSED', 'FAIL_VALIDATOR'].includes(nextState))
  stateHistory.push(nextState);
const observation = {
  provider: normalizedResponse.provider || data.llmAttempt?.provider || null,
  model: normalizedResponse.model || data.llmAttempt?.model || null,
  stage: stage === 'gemini' ? 'initial' : stage === 'gemini_repair' ? 'repair' : stage,
  httpStatus: normalizedResponse.httpStatus ?? null,
  result: errorType.toLowerCase(), errorType, success: valid,
  ...statuses,
  validationStatus: normalizedResponse.validationStatus,
  repairUsed, fallbackUsed, failureReason,
  providerError: normalizedResponse.providerError || null,
  durationMs: normalizedResponse.durationMs ?? null,
  identifierNormalizations: data.identifierNormalizations || [],
  groundingReport,
};
const aiObservability = [...(data.aiObservability || []), observation];
const aiExecution = {
  requestedProvider: 'gemini',
  resolvedProvider: valid ? observation.provider : null,
  resolvedModel: valid ? observation.model : null,
  repairUsed, fallbackUsed,
};
return [{ json: {
  ...data, valid, retryable: false, errorType, failureReason, nextState,
  llmState: nextState, stateHistory, repairUsed, fallbackUsed,
  validationErrors: errors, normalizedResponse, aiObservability, aiExecution,
  ...statuses, groundingReport,
  mode: 'dry-run', automationMode: 'dry-run', mutationsPerformed: false,
} }];