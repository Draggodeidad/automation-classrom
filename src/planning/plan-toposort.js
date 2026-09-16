const data = $json;
const plan = structuredClone(data.plan);
const issues = plan.issues;
const byKey = new Map(issues.map((issue) => [issue.key, issue]));
const indegree = new Map(issues.map((issue) => [issue.key, 0]));
const outgoing = new Map(issues.map((issue) => [issue.key, []]));

for (const issue of issues) {
  for (const dependency of issue.dependsOn) {
    indegree.set(issue.key, indegree.get(issue.key) + 1);
    outgoing.get(dependency).push(issue.key);
  }
}

const queue = issues.filter((issue) => indegree.get(issue.key) === 0).map((issue) => issue.key);
const ordered = [];
while (queue.length) {
  const key = queue.shift();
  ordered.push(byKey.get(key));
  for (const next of outgoing.get(key)) {
    indegree.set(next, indegree.get(next) - 1);
    if (indegree.get(next) === 0) queue.push(next);
  }
}
if (ordered.length !== issues.length) throw new Error('Plan rechazado: existen dependencias circulares. No se modificó GitHub.');

const bootstrap = ordered.find((issue) => issue.assignee === 'Draggodeidad' && issue.dependsOn.length === 0 && /bootstrap|baseline|inicio|starter/i.test(`${issue.key} ${issue.title} ${issue.body}`));
if (!bootstrap) throw new Error('Plan rechazado: falta bootstrap/baseline sin dependencias para Draggodeidad.');

const substantial = issues.find((issue) =>
  issue.assignee === 'Draggodeidad' &&
  ['feature', 'devops', 'test'].includes(issue.type) &&
  issue.key !== bootstrap.key &&
  (issue.expectedFiles || []).length > 0 &&
  /c[oó]digo|l[oó]gica|configuraci[oó]n|ci\/cd|pipeline|arquitectura|implement|test/i.test(`${issue.title} ${issue.body}`)
);
if (!substantial) throw new Error('Plan rechazado: Draggodeidad no tiene implementación técnica sustancial independiente del bootstrap.');

const julian = issues.filter((issue) => issue.assignee === 'JulianDele');
const osbaldo = issues.filter((issue) => issue.assignee === 'osbaldoXxC');
if (!julian.length || !osbaldo.length) throw new Error('Plan rechazado: JulianDele y osbaldoXxC deben tener trabajo explícito.');
const julianKeys = new Set(julian.map((issue) => issue.key));
const osbaldoKeys = new Set(osbaldo.map((issue) => issue.key));
for (const issue of julian) {
  if (issue.dependsOn.some((key) => osbaldoKeys.has(key))) throw new Error(`Plan rechazado: ${issue.key} crea dependencia Osbaldo → Julian.`);
}
for (const issue of osbaldo) {
  if (issue.dependsOn.some((key) => julianKeys.has(key))) throw new Error(`Plan rechazado: ${issue.key} crea dependencia Julian → Osbaldo.`);
}

const planKeys = ordered.map((issue) => issue.key);
const desiredLabels = [...new Set([
  data.course,
  `week-${data.weekPadded}`,
  ...ordered.flatMap((issue) => [`type:${issue.type}`, `priority:${issue.priority}`]),
])];
const existingLabels = new Set(data.repoContext.labels || []);
const missingLabels = desiredLabels.filter((label) => !existingLabels.has(label));

return [{
  json: {
    ...data,
    plan: { ...plan, issues: ordered },
    planKeys,
    desiredLabels,
    missingLabels,
    bootstrapKey: bootstrap.key,
    substantialDraggodeidadKey: substantial.key,
  },
}];
