const source = $('Activity Context').item.json;
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
const recentIssues = asArray(responseBody('GitHub - Recent Issues')).filter((entry) => !entry.pull_request);
const openPrs = asArray(responseBody('GitHub - Open Pull Requests'));
const labels = asArray(responseBody('GitHub - Labels'));
const searchByCourseWork = responseBody('GitHub - Search CourseWork ID');
const searchByWeek = responseBody('GitHub - Search Course Week');
const tree = asArray(responseBody('GitHub - Tree').tree);
const readme = decode(responseBody('GitHub - README').content).slice(0, 12000);

const matches = [];
for (const issue of [...asArray(searchByCourseWork.items), ...asArray(searchByWeek.items), ...recentIssues]) {
  const body = String(issue.body || '');
  const sameCourseWork = metadata(body, 'classroom-coursework-id') === source.courseWorkId && metadata(body, 'classroom-course-id') === source.courseId;
  const sameCourseWeek = metadata(body, 'course') === source.course && metadata(body, 'week') === source.weekPadded;
  if ((sameCourseWork || sameCourseWeek) && !matches.some((item) => item.number === issue.number)) matches.push(issue);
}
const sameIdentity = matches.filter((issue) =>
  metadata(issue.body, 'classroom-coursework-id') === source.courseWorkId &&
  metadata(issue.body, 'classroom-course-id') === source.courseId);
const identityConflict = matches.some((issue) =>
  metadata(issue.body, 'classroom-coursework-id') !== source.courseWorkId);
const storedUpdateTimes = sameIdentity.map((issue) => metadata(issue.body, 'classroom-update-time')).filter(Boolean);
const newestStoredUpdate = storedUpdateTimes.sort().at(-1) || null;
const courseworkUpdated = Boolean(newestStoredUpdate && Date.parse(source.updateTime) > Date.parse(newestStoredUpdate));

const issueKeys = sameIdentity.map((issue) => metadata(issue.body, 'issue-key')).filter(Boolean);
const planKeys = [...new Set(sameIdentity
  .map((issue) => metadata(issue.body, 'plan-keys'))
  .filter(Boolean)
  .flatMap((value) => value.split(',').map((key) => key.trim()).filter(Boolean)))];
const unrecoverablePartialState = sameIdentity.length > 0 && planKeys.length === 0;
const completeExisting = sameIdentity.length > 0 && !courseworkUpdated && planKeys.length > 0 && planKeys.every((key) => issueKeys.includes(key));
const resumeKeys = sameIdentity.length > 0 && !completeExisting && !courseworkUpdated ? planKeys : [];

const starterPaths = source.starter?.files || [];
const repositoryPaths = tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path);
const repositoryPathSet = new Set(repositoryPaths.map((path) => path.toLowerCase()));
const overlapping = starterPaths.filter((path) => repositoryPathSet.has(path.toLowerCase()));
const newPaths = starterPaths.filter((path) => !repositoryPathSet.has(path.toLowerCase()));
source.starter.potentialConflicts = overlapping.slice(0, 80);

const tokens = `${source.assignmentTitle} ${source.description} ${starterPaths.join(' ')}`
  .toLowerCase().split(/[^a-záéíóúüñ0-9._/-]+/i).filter((token) => token.length >= 4);
const relevantPaths = repositoryPaths
  .filter((path) => path.length < 180 && /readme|docs?|package\.json|docker|compose|workflow|src|test|spec|\.github/i.test(path))
  .sort((a, b) => {
    const score = (path) => tokens.reduce((sum, token) => sum + (path.toLowerCase().includes(token) ? 1 : 0), 0);
    return score(b) - score(a);
  }).slice(0, 80);

const compactIssues = recentIssues.slice(0, 40).map((issue) => ({
  number: issue.number, state: issue.state, title: issue.title,
  labels: (issue.labels || []).map((label) => label.name || label),
  assignees: (issue.assignees || []).map((assignee) => assignee.login),
  createdAt: issue.created_at, closedAt: issue.closed_at,
  metadata: {
    courseId: metadata(issue.body, 'classroom-course-id'),
    courseWorkId: metadata(issue.body, 'classroom-coursework-id'),
    updateTime: metadata(issue.body, 'classroom-update-time'),
    course: metadata(issue.body, 'course'), week: metadata(issue.body, 'week'), key: metadata(issue.body, 'issue-key'),
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
  labels: labels.map((label) => label.name), relevantPaths, readme,
  starterComparison: { overlappingPaths: overlapping.slice(0, 80), newPaths: newPaths.slice(0, 80) },
};

const systemPrompt = `Eres Tech Lead y Project Manager técnico. Devuelve sólo JSON conforme al schema. Usa CourseWork, starter real y repositorio; no inventes. Si starter.found=true, crea una Foundation inicial para Draggodeidad titulada exactamente [${source.course}][W${source.weekPadded}] Integrar ${source.starter.name} y establecer baseline semanal, sin dependencias y basada en archivos/comandos/criterios reales del starter. Draggodeidad recibe además implementación técnica sustancial. JulianDele y osbaldoXxC trabajan mayormente en paralelo y reciben especificaciones guiadas. Keys estables; dependencias sólo por key; no inventes evidencia. Cada body usa en orden: ## Historia de Usuario, ## Contexto, ## Objetivo técnico, ## Alcance, ## Fuera de alcance, ## Archivos esperados, ## Pasos sugeridos, ## Criterios de aceptación, ## Pruebas, ## Dependencias, ## Evidencia individual, ## Definition of Done. No añadas metadata HTML.`;
const userPrompt = JSON.stringify({
  coursework: {
    course: source.course, week: source.week, courseId: source.courseId, courseWorkId: source.courseWorkId,
    title: source.assignmentTitle, description: source.description, deadline: source.dueAt,
    updateTime: source.updateTime, alternateLink: source.alternateLink, maxPoints: source.maxPoints, workType: source.workType,
    materials: source.materialInventory,
  },
  starter: source.starter,
  repository: repoContext,
  resumeKeys,
});

return [{ json: {
  ...source, repoContext,
  existingAutomationIssues: sameIdentity.map((issue) => ({ number: issue.number, title: issue.title, body: issue.body })),
  completeExisting, resumeKeys, courseworkUpdated, identityConflict: identityConflict || unrecoverablePartialState, newestStoredUpdate,
  schema: outputSchema, geminiSchema: geminiCompatibleSchema(outputSchema), systemPrompt, userPrompt,
} }];
