const source = $('Activity Context').item.json;
const outputSchema = __ISSUE_PLAN_SCHEMA__;
const geminiAllowed = new Set([
  'type', 'title', 'description', 'properties', 'required', 'additionalProperties',
  'enum', 'format', 'minimum', 'maximum', 'items', 'prefixItems', 'minItems',
  'maxItems', 'minLength', 'maxLength', 'pattern', 'uniqueItems', 'anyOf', '$ref',
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
const readme = decode(responseBody('GitHub - README').content).slice(0, 2500);

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
source.starter.potentialConflicts = overlapping.slice(0, 30);

const tokens = `${source.assignmentTitle} ${source.description} ${starterPaths.join(' ')}`
  .toLowerCase().split(/[^a-záéíóúüñ0-9._/-]+/i).filter((token) => token.length >= 4);
const relevantPaths = repositoryPaths
  .filter((path) => path.length < 180 && /readme|docs?|package\.json|docker|compose|workflow|src|test|spec|\.github/i.test(path))
  .sort((a, b) => {
    const score = (path) => tokens.reduce((sum, token) => sum + (path.toLowerCase().includes(token) ? 1 : 0), 0);
    return score(b) - score(a);
  }).slice(0, 30);

const compactIssues = recentIssues.slice(0, 15).map((issue) => ({
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
  recentClosedIssues: compactIssues.filter((issue) => issue.state === 'closed').slice(0, 8),
  openPullRequests: openPrs.slice(0, 10).map((pr) => ({ number: pr.number, title: pr.title, head: pr.head?.ref, base: pr.base?.ref })),
  labels: labels.map((label) => label.name), relevantPaths, readme,
  starterComparison: { overlappingPaths: overlapping.slice(0, 30), newPaths: newPaths.slice(0, 30) },
};

const trimList = (value, limit, itemLimit = 500) => asArray(value).slice(0, limit).map((item) => String(item).slice(0, itemLimit));
const compactStarter = source.starter?.found ? {
  found: true,
  name: source.starter.name,
  fileCount: source.starter.fileCount,
  files: trimList(source.starter.files, 30, 180),
  relevantFiles: asArray(source.starter.relevantFiles).slice(0, 4).map((file) => ({
    path: String(file.path || '').slice(0, 180),
    content: String(file.content || '').slice(0, 1200),
    truncated: Boolean(file.truncated) || String(file.content || '').length > 1200,
  })),
  requiredFiles: trimList(source.starter.requiredFiles, 25, 180),
  instructions: trimList(source.starter.instructions, 20, 300),
  commands: trimList(source.starter.commands, 15, 180),
  acceptanceCriteria: trimList(source.starter.acceptanceCriteria, 20, 300),
  tests: trimList(source.starter.tests, 20, 180),
  constraints: trimList(source.starter.constraints, 15, 300),
  rubric: trimList(source.starter.rubric, 15, 300),
  potentialConflicts: trimList(source.starter.potentialConflicts, 30, 180),
} : { found: false, name: null };

const exactIdentity = {
  course: source.course,
  week: source.week,
  weekPadded: source.weekPadded,
  repository: source.repository,
  assignmentTitle: source.assignmentTitle,
  deadline: source.dueAt,
  source: {
    courseId: source.courseId,
    courseWorkId: source.courseWorkId,
    updateTime: source.updateTime,
    starterName: source.starter?.name ?? null,
  },
};
const systemPrompt = `Eres Tech Lead. Analiza exclusivamente el contexto proporcionado (CourseWork, starter y repositorio) y divide la actividad en unidades de trabajo implementables. Devuelve entre 3 y 6 Issues.

Tu única responsabilidad es determinar:
- trabajo requerido;
- división en Issues;
- integrante responsable (sólo Draggodeidad, JulianDele, osbaldoXxC);
- tipo (feature|test|docs|devops|evidence);
- prioridad (high|medium|low);
- dependencias conceptuales entre Issues (por key);
- contenido semántico de cada sección del schema.

Reglas de distribución:
- Draggodeidad recibe además al menos una Issue sustancial de implementación técnica real: type feature, devops o test, con archivosEsperados y contenido de implementación verificable (código, lógica, configuración, CI/CD o arquitectura). Una Issue de docs o evidence no cumple esta regla.
- JulianDele y osbaldoXxC reciben especificaciones guiadas pequeñas que avanzan mayormente en paralelo; evita cadenas entre ellos.
- Si el starter existe, la primera Issue debe llamarse foundation; el sistema completa su título y metadatos, así que aporta sólo el contenido semántico basado en datos reales del ZIP.

Restricciones:
- No generes Markdown.
- No agregues prefijos de curso/semana a los títulos.
- No inventes repositorios, universidades, archivos, comandos, resultados de pruebas, commits, SHAs, tags ni evidencia ya producida.
- No afirmes que algo fue ejecutado ni que una actividad está terminada.
- Si una afirmación no está respaldada por el contexto, omítela.
- Usa keys estables en kebab-case. dependsOn sólo con keys que existan en este plan.
- Si se indican resumeKeys, devuelve exactamente ese conjunto de keys.`;
const userPrompt = JSON.stringify({
  identity: exactIdentity,
  coursework: {
    description: String(source.description || '').slice(0, 4500),
    alternateLink: source.alternateLink,
    maxPoints: source.maxPoints,
    workType: source.workType,
    materials: asArray(source.materialInventory).slice(0, 15),
  },
  starter: compactStarter,
  repository: repoContext,
  resumeKeys,
});

return [{ json: {
  ...source, repoContext,
  existingAutomationIssues: sameIdentity.map((issue) => ({ number: issue.number, title: issue.title, body: issue.body })),
  completeExisting, resumeKeys, courseworkUpdated, identityConflict: identityConflict || unrecoverablePartialState, newestStoredUpdate,
  schema: outputSchema, geminiSchema: geminiCompatibleSchema(outputSchema), systemPrompt, userPrompt,
} }];
