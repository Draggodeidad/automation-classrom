const source = $('Parse and Route').item.json;
const outputSchema = __ISSUE_PLAN_SCHEMA__;
const geminiAllowed = new Set([
  'type', 'title', 'description', 'properties', 'required', 'additionalProperties',
  'enum', 'format', 'minimum', 'maximum', 'items', 'prefixItems', 'minItems',
  'maxItems', 'anyOf', '$ref',
]);
function geminiCompatibleSchema(value) {
  if (Array.isArray(value)) return value.map(geminiCompatibleSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => geminiAllowed.has(key))
    .map(([key, child]) => [key, key === 'properties'
      ? Object.fromEntries(Object.entries(child).map(([name, property]) => [name, geminiCompatibleSchema(property)]))
      : geminiCompatibleSchema(child)]));
}
const geminiSchema = geminiCompatibleSchema(outputSchema);
const responseBody = (name) => {
  const value = $(name).item.json;
  return value.body ?? value;
};
const asArray = (value) => Array.isArray(value) ? value : [];
const decode = (value) => {
  try { return Buffer.from(String(value || '').replace(/\n/g, ''), 'base64').toString('utf8'); }
  catch { return ''; }
};
const metadata = (body, key) => {
  const match = String(body || '').match(new RegExp(`<!--\\s*${key}:([^>]+?)\\s*-->`, 'i'));
  return match ? match[1].trim() : null;
};

const repo = responseBody('GitHub - Repository');
const recentRaw = asArray(responseBody('GitHub - Recent Issues'));
const recentIssues = recentRaw.filter((entry) => !entry.pull_request);
const openPrs = asArray(responseBody('GitHub - Open Pull Requests'));
const labels = asArray(responseBody('GitHub - Labels'));
const searchByMessage = responseBody('GitHub - Search Message ID');
const searchByWeek = responseBody('GitHub - Search Course Week');
const tree = asArray(responseBody('GitHub - Tree').tree);
const readmePayload = responseBody('GitHub - README');
const readme = decode(readmePayload.content).slice(0, 12000);

const matches = [];
for (const issue of [
  ...asArray(searchByMessage.items),
  ...asArray(searchByWeek.items),
  ...recentIssues,
]) {
  const body = String(issue.body || '');
  const sameMessage = metadata(body, 'classroom-message-id') === source.gmailMessageId;
  const sameCourseWeek = metadata(body, 'course') === source.course && metadata(body, 'week') === source.weekPadded;
  if ((sameMessage || sameCourseWeek) && !matches.some((x) => x.number === issue.number)) matches.push(issue);
}

const issueKeys = matches.map((issue) => metadata(issue.body, 'issue-key')).filter(Boolean);
const declaredPlanKeys = matches
  .map((issue) => metadata(issue.body, 'plan-keys'))
  .filter(Boolean)
  .flatMap((value) => value.split(',').map((key) => key.trim()).filter(Boolean));
const planKeys = [...new Set(declaredPlanKeys)];
const completeExisting = matches.length > 0 && (planKeys.length === 0 || planKeys.every((key) => issueKeys.includes(key)));
const resumeKeys = matches.length > 0 && !completeExisting ? planKeys : [];

const tokens = `${source.assignmentTitle} ${source.emailText}`
  .toLowerCase()
  .split(/[^a-záéíóúüñ0-9._/-]+/i)
  .filter((token) => token.length >= 4);
const relevantPaths = tree
  .filter((entry) => entry.type === 'blob' && entry.path && entry.path.length < 180)
  .map((entry) => entry.path)
  .filter((path) => /readme|docs?|package\.json|docker|compose|workflow|src|test|spec|\.github/i.test(path))
  .sort((a, b) => {
    const score = (path) => tokens.reduce((sum, token) => sum + (path.toLowerCase().includes(token) ? 1 : 0), 0);
    return score(b) - score(a);
  })
  .slice(0, 80);

const compactIssues = recentIssues.slice(0, 40).map((issue) => ({
  number: issue.number,
  state: issue.state,
  title: issue.title,
  labels: (issue.labels || []).map((label) => label.name || label),
  assignees: (issue.assignees || []).map((assignee) => assignee.login),
  createdAt: issue.created_at,
  closedAt: issue.closed_at,
  metadata: {
    messageId: metadata(issue.body, 'classroom-message-id'),
    course: metadata(issue.body, 'course'),
    week: metadata(issue.body, 'week'),
    key: metadata(issue.body, 'issue-key'),
  },
}));

const repoContext = {
  repository: source.repository,
  defaultBranch: repo.default_branch,
  description: repo.description,
  language: repo.language,
  topics: repo.topics || [],
  openIssues: compactIssues.filter((issue) => issue.state === 'open'),
  recentClosedIssues: compactIssues.filter((issue) => issue.state === 'closed').slice(0, 20),
  openPullRequests: openPrs.slice(0, 20).map((pr) => ({ number: pr.number, title: pr.title, head: pr.head?.ref, base: pr.base?.ref })),
  labels: labels.map((label) => label.name),
  relevantPaths,
  readme,
};

const systemPrompt = `Eres Tech Lead y Project Manager técnico. Devuelve exclusivamente JSON válido conforme al schema. Reglas: (1) course/week/repository coinciden con la entrada; (2) equipo: Draggodeidad, JulianDele, osbaldoXxC; (3) Draggodeidad recibe bootstrap sin dependencias y además al menos una implementación técnica sustancial que no sea sólo docs/evidencia/integración; (4) tras bootstrap Julian y Osbaldo trabajan en paralelo, sin cadenas cruzadas; (5) sus Issues explican qué hacer, dónde, archivos probables, qué no tocar, resultado, pruebas y evidencia, sin escribirles toda la solución; (6) keys estables kebab-case y dependsOn usa sólo keys; (7) no inventes evidencia, resultados, SHA, tags ni archivos confirmados; (8) si resumeKeys existe usa exactamente esas keys; (9) títulos [COURSE][WNN]. Cada body incluye exactamente y en orden: ## Historia de Usuario, ## Contexto, ## Objetivo técnico, ## Alcance, ## Fuera de alcance, ## Archivos esperados, ## Pasos sugeridos, ## Criterios de aceptación, ## Pruebas, ## Dependencias, ## Evidencia individual, ## Definition of Done. Definition of Done termina con checks de implementación, criterios, tests, evidencia y PR. No añadas metadata HTML.`;
const userPrompt = JSON.stringify({
  assignment: {
    course: source.course,
    week: source.week,
    repository: source.repository,
    title: source.assignmentTitle,
    email: source.emailText,
  },
  resumeKeys,
  repositoryContext: repoContext,
});

return [{
  json: {
    ...source,
    repoContext,
    existingAutomationIssues: matches.map((issue) => ({ number: issue.number, title: issue.title, body: issue.body })),
    completeExisting,
    resumeKeys,
    schema: outputSchema,
    geminiSchema,
    systemPrompt,
    userPrompt,
  },
}];
