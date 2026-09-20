const data = $json;
const plan = data.plan || {};
const issues = Array.isArray(plan.issues) ? plan.issues : [];
const catalog = data.groundingCatalog || {};
const errors = [];
const addError = (code, message, retryable = true) =>
  errors.push({ code, message, retryable });
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

const evidenceSupports = (record) => {
  const entry = catalog[record?.evidence];
  if (
    !entry ||
    !sourceValues.has(record?.source) ||
    entry.source !== record.source
  )
    return false;
  const claim = normalize(record.claim);
  const content = normalize(entry.content);
  return (
    claim.length > 0 &&
    (content.includes(claim) ||
      (content.length >= 8 && claim.includes(content)))
  );
};
const concreteDetails = (issue) => {
  const text = [
    issue?.title,
    ...Object.values(issue?.sections || {}).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    ),
  ].join("\n");
  const found = new Set();
  const patterns = [
    /\b(?:npm|pnpm|yarn|bun|npx|node|python3?|pytest|make|docker(?:[ \t]+compose)?|git|go[ \t]+test|mvn|gradle|swift[ \t]+test)[ \t]+[A-Za-z0-9_./:@=-]+(?:[ \t]+[A-Za-z0-9_./:@=-]+)*/gi,
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

if (data.parseError) {
  const messages = data.normalizedResponse?.schemaErrors?.length
    ? data.normalizedResponse.schemaErrors : [data.parseError];
  for (const message of messages) addError(data.errorType || 'SCHEMA_ERROR', message);
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
        );

    const provenance = Array.isArray(issue.provenance) ? issue.provenance : [];
    for (const record of provenance) {
      if (!evidenceSupports(record))
        addError(
          "UNGROUNDED_CLAIM",
          `${where}: claim sin respaldo verificable "${record?.claim || ""}" (${record?.evidence || "sin evidence"})`,
        );
    }
    for (const detail of concreteDetails(issue)) {
      const grounded = provenance.some(
        (record) =>
          evidenceSupports(record) &&
          normalize(record.claim).includes(normalize(detail)),
      );
      if (!grounded)
        addError(
          "UNGROUNDED_TECHNICAL_DETAIL",
          `${where}: detalle técnico sin provenance: "${detail}"`,
        );
    }
    issue.groundingStatus = "grounded";

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
        addError("SELF_DEPENDENCY", `${where}: depende de sí misma`);
      else if (!allKeys.has(dependency))
        addError(
          "INVALID_DEPENDENCY",
          `${where}: depende de key inexistente "${dependency}"`,
        );
      if (seenDeps.has(dependency))
        addError(
          "INVALID_DEPENDENCY",
          `${where}: dependencia duplicada "${dependency}"`,
        );
      seenDeps.add(dependency);
    }
  }

  for (const dropped of data.normalization?.droppedDependencies || [])
    addError(
      dropped.reason,
      `${dropped.issue} → ${dropped.dependency}: ${dropped.reason}`,
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
    addError("DEPENDENCY_CYCLE", "el grafo de dependencias contiene ciclos");

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
const valid = errors.length === 0 && data.parseStatus === 'valid' && data.schemaStatus === 'valid';
const errorType = valid ? 'VALID' : data.errorType || 'SCHEMA_ERROR';
const failureReason = valid ? null : {
  errorType,
  provider: data.llmAttempt?.provider || null,
  model: data.llmAttempt?.model || null,
  httpStatus: data.normalizedResponse?.httpStatus ?? null,
  message: data.normalizedResponse?.error || errors.map((error) => error.message).join('; '),
  ...(['PARSE_ERROR', 'SCHEMA_ERROR'].includes(errorType)
    ? { validationErrors: errors.map((error) => error.message) } : {}),
};
const stage = data.llmAttempt?.stage || 'gemini';
const repairUsed = Boolean(data.repairUsed);
const fallbackUsed = ['qwen', 'glm'].includes(stage);
const transitions = { gemini_repair: 'QWEN_REQUEST', qwen: 'GLM_REQUEST', glm: 'FAIL_CLOSED' };
let nextState;
if (valid) nextState = 'PLAN_VALID';
else if (stage === 'gemini') nextState = !repairUsed && ['PARSE_ERROR', 'SCHEMA_ERROR'].includes(errorType)
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
};
const observation = {
  provider: normalizedResponse.provider || data.llmAttempt?.provider || null,
  model: normalizedResponse.model || data.llmAttempt?.model || null,
  stage: stage === 'gemini' ? 'initial' : stage === 'gemini_repair' ? 'repair' : stage,
  httpStatus: normalizedResponse.httpStatus ?? null,
  result: errorType.toLowerCase(), errorType, success: valid,
  parseStatus: data.parseStatus, schemaStatus: data.schemaStatus,
  validationStatus: normalizedResponse.validationStatus,
  repairUsed, fallbackUsed, failureReason,
  providerError: normalizedResponse.providerError || null,
  durationMs: normalizedResponse.durationMs ?? null,
  identifierNormalizations: data.identifierNormalizations || [],
};
const aiObservability = [...(data.aiObservability || []), observation];
const aiExecution = {
  requestedProvider: 'gemini',
  resolvedProvider: valid ? observation.provider : null,
  resolvedModel: valid ? observation.model : null,
  repairUsed, fallbackUsed,
};
const stateHistory = [...(data.stateHistory || [])];
if (['PLAN_VALID', 'FAIL_CLOSED'].includes(nextState)) stateHistory.push(nextState);
return [{ json: {
  ...data, valid, retryable: false, errorType, failureReason, nextState,
  llmState: nextState, stateHistory, repairUsed, fallbackUsed,
  validationErrors: errors, normalizedResponse, aiObservability, aiExecution,
  mode: 'dry-run', automationMode: 'dry-run', mutationsPerformed: false,
} }];
