const data = $json;
const plan = data.plan || {};
const issues = Array.isArray(plan.issues) ? plan.issues : [];
const errors = [];
const addError = (code, message, retryable) => errors.push({ code, message, retryable });

if (data.parseError) {
  addError('LLM_SCHEMA_INVALID', data.parseError, true);
}

if (!data.parseError) {
  const weekPadded = String(plan.weekPadded || String(plan.week || '').padStart(2, '0'));
  const prefix = `[${plan.course}][W${weekPadded}]`;
  const allowedAssignees = new Set(['Draggodeidad', 'JulianDele', 'osbaldoXxC']);
  const allowedTypes = new Set(['feature', 'test', 'docs', 'devops', 'evidence']);
  const allowedPriorities = new Set(['high', 'medium', 'low']);
  const HEADINGS = [
    '## Historia de Usuario',
    '## Contexto',
    '## Objetivo técnico',
    '## Alcance',
    '## Fuera de alcance',
    '## Archivos esperados',
    '## Pasos sugeridos',
    '## Criterios de aceptación',
    '## Pruebas',
    '## Dependencias',
    '## Evidencia individual',
    '## Definition of Done',
  ];

  if (issues.length < 3 || issues.length > 6) {
    addError('INVALID_ISSUE_COUNT', `issues=${issues.length}; se requieren entre 3 y 6`, true);
  }

  const allKeys = new Set(issues.map((issue) => issue.key));
  const seenKeys = new Set();
  const seenTitles = new Set();

  for (const [index, issue] of issues.entries()) {
    const where = `issues[${index}]`;
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(issue.key || '')) {
      addError('INVALID_KEY', `${where}: key "${issue.key}" no es kebab-case válida`, true);
    }
    if (seenKeys.has(issue.key)) {
      addError('DUPLICATE_KEY', `${where}: key duplicada "${issue.key}"`, false);
    }
    seenKeys.add(issue.key);

    if (!allowedAssignees.has(issue.assignee)) {
      addError('INVALID_ASSIGNEE', `${where}: assignee "${issue.assignee}" no permitido`, true);
    }
    if (!allowedTypes.has(issue.type)) {
      addError('INVALID_TYPE', `${where}: type "${issue.type}" no permitido`, true);
    }
    if (!allowedPriorities.has(issue.priority)) {
      addError('INVALID_PRIORITY', `${where}: priority "${issue.priority}" no permitida`, true);
    }

    if (!String(issue.title || '').startsWith(`${prefix} `)) {
      addError('INVALID_TITLE', `${where}: title sin prefijo ${prefix}`, false);
    }
    const semanticTitle = String(issue.title || '').replace(/^\s*\[[A-Za-z0-9]+\]\[W\d{1,2}\]\s*/, '');
    if (seenTitles.has(semanticTitle)) {
      addError('DUPLICATE_TITLE', `${where}: título semántico duplicado "${semanticTitle}"`, true);
    }
    seenTitles.add(semanticTitle);

    const sections = issue.sections || {};
    if (!String(sections.historiaUsuario || '').trim()) addError('MISSING_CONTENT', `${where}: falta historiaUsuario`, true);
    if (!String(sections.contexto || '').trim()) addError('MISSING_CONTENT', `${where}: falta contexto`, true);
    if ((sections.objetivoTecnico || []).length < 1) addError('MISSING_CONTENT', `${where}: objetivoTecnico vacío`, true);
    if ((sections.criteriosAceptacion || []).length < 2) addError('MISSING_CONTENT', `${where}: criteriosAceptacion < 2`, true);
    if ((sections.pruebas || []).length < 1) addError('MISSING_CONTENT', `${where}: pruebas vacías`, true);
    if ((sections.evidenciaIndividual || []).length < 1) addError('MISSING_CONTENT', `${where}: evidenciaIndividual vacía`, true);

    const body = String(issue.body || '');
    for (const heading of HEADINGS) {
      const occurrences = body.split(heading).length - 1;
      if (occurrences !== 1) addError('INVALID_BODY', `${where}: header "${heading}" aparece ${occurrences} veces`, false);
    }
    let last = -1;
    for (const heading of HEADINGS) {
      const position = body.indexOf(heading);
      if (position >= 0 && position < last) addError('INVALID_BODY', `${where}: headers fuera de orden`, false);
      last = Math.max(last, position);
    }

    const seenDeps = new Set();
    for (const dependency of Array.isArray(issue.dependsOn) ? issue.dependsOn : []) {
      if (dependency === issue.key) {
        addError('SELF_DEPENDENCY', `${where}: depende de sí misma`, true);
      } else if (!allKeys.has(dependency)) {
        addError('INVALID_DEPENDENCY', `${where}: depende de key inexistente "${dependency}"`, true);
      }
      if (seenDeps.has(dependency)) {
        addError('INVALID_DEPENDENCY', `${where}: dependency duplicada "${dependency}"`, true);
      }
      seenDeps.add(dependency);
    }
  }

  for (const dropped of data.normalization?.droppedDependencies || []) {
    const code = dropped.reason === 'SELF_DEPENDENCY' ? 'SELF_DEPENDENCY' : 'INVALID_DEPENDENCY';
    addError(code, `${dropped.issue} → ${dropped.dependency}: ${dropped.reason}`, true);
  }

  if (data.starter?.found) {
    const expectedTitle = `${prefix} Integrar ${plan.source?.starterName} y establecer baseline semanal`;
    const foundation = issues.find((issue) => issue.key === 'foundation');
    if (!foundation) {
      addError('INVALID_FOUNDATION', 'falta la Issue foundation', false);
    } else {
      if (issues.indexOf(foundation) !== 0) addError('INVALID_FOUNDATION', 'foundation no es la primera Issue', false);
      if (foundation.assignee !== 'Draggodeidad') addError('INVALID_FOUNDATION', 'foundation no asignada a Draggodeidad', false);
      if ((foundation.dependsOn || []).length) addError('INVALID_FOUNDATION', 'foundation no debe tener dependencias', false);
      if (foundation.title !== expectedTitle) addError('INVALID_FOUNDATION', `foundation title incorrecto: ${foundation.title}`, false);
    }
  } else if (issues.some((issue) => issue.key === 'foundation')) {
    addError('INVALID_FOUNDATION', 'foundation no debe existir sin starter', false);
  }

  const bootstrapKey = data.starter?.found ? 'foundation' : null;
  const substantial = issues.find((issue) =>
    issue.assignee === 'Draggodeidad' &&
    ['feature', 'devops', 'test'].includes(issue.type) &&
    issue.key !== bootstrapKey &&
    (issue.expectedFiles || []).length > 0 &&
    /c[oó]digo|l[oó]gica|configuraci[oó]n|ci\/cd|pipeline|arquitectura|implement|test/i.test(`${issue.title} ${issue.body}`));
  if (!substantial) {
    addError('MISSING_SUBSTANTIAL', 'Draggodeidad no tiene implementación técnica sustancial independiente de la Foundation', true);
  }

  const byKey = new Map(issues.map((issue) => [issue.key, issue]));
  const indegree = new Map(issues.map((issue) => [issue.key, 0]));
  const outgoing = new Map(issues.map((issue) => [issue.key, []]));
  for (const issue of issues) {
    for (const dependency of issue.dependsOn || []) {
      if (!byKey.has(dependency)) continue;
      indegree.set(issue.key, indegree.get(issue.key) + 1);
      outgoing.get(dependency).push(issue.key);
    }
  }
  const queue = issues.filter((issue) => indegree.get(issue.key) === 0).map((issue) => issue.key);
  let visited = 0;
  while (queue.length) {
    const key = queue.shift();
    visited += 1;
    for (const next of outgoing.get(key)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (visited !== issues.length) addError('DEPENDENCY_CYCLE', 'el grafo de dependencias contiene ciclos', true);

  if (Array.isArray(data.resumeKeys) && data.resumeKeys.length) {
    const expected = [...new Set(data.resumeKeys)].sort().join(',');
    const actual = [...new Set(issues.map((issue) => issue.key))].sort().join(',');
    if (actual !== expected) addError('RESUME_KEYS_MISMATCH', `keys esperadas ${expected}; recibidas ${actual}`, true);
  }
}

const valid = errors.length === 0;
const retryable = errors.some((error) => error.retryable);
const validationErrors = errors;

let retryPrompt = null;
if (!valid) {
  const previousIssues = issues.map((issue) => ({
    key: issue.key,
    title: issue.title,
    assignee: issue.assignee,
    type: issue.type,
    priority: issue.priority,
    dependsOn: issue.dependsOn,
    sections: issue.sections || {},
  }));
  let originalRequest = null;
  try { originalRequest = JSON.parse(data.userPrompt); } catch { /* contexto ausente */ }
  retryPrompt = JSON.stringify({
    instruction: 'Corrige el plan estructurado anterior atendiendo únicamente los errores listados. Devuelve sólo el objeto con el array issues. Conserva las mismas keys cuando no se indique lo contrario. No generes Markdown ni prefijos de curso/semana. No expliques.',
    validationErrors: errors.map((error) => `[${error.code}] ${error.message}`),
    previousPlan: { issues: previousIssues },
    originalRequest,
  });
}

return [{ json: { ...data, valid, retryable, validationErrors, retryPrompt } }];