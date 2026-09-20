const data = $json;
if (!data.plan || !Array.isArray(data.plan.issues))
  throw new Error("Plan rechazado: data.plan.issues no existe.");

const plan = JSON.parse(JSON.stringify(data.plan));
const issues = plan.issues;
const byKey = new Map(issues.map((issue) => [issue.key, issue]));
const indegree = new Map(issues.map((issue) => [issue.key, 0]));
const outgoing = new Map(issues.map((issue) => [issue.key, []]));
for (const issue of issues) {
  if (!Array.isArray(issue.dependsOn)) issue.dependsOn = [];
  for (const dependency of issue.dependsOn) {
    if (!byKey.has(dependency))
      throw new Error(
        `Plan rechazado: ${issue.key} depende de "${dependency}" inexistente.`,
      );
    indegree.set(issue.key, indegree.get(issue.key) + 1);
    outgoing.get(dependency).push(issue.key);
  }
}
const queue = issues
  .filter((issue) => indegree.get(issue.key) === 0)
  .map((issue) => issue.key);
const ordered = [];
while (queue.length) {
  const key = queue.shift();
  ordered.push(byKey.get(key));
  for (const next of outgoing.get(key)) {
    indegree.set(next, indegree.get(next) - 1);
    if (indegree.get(next) === 0) queue.push(next);
  }
}
if (ordered.length !== issues.length)
  throw new Error("Plan rechazado: existen dependencias circulares.");

const members = ["Draggodeidad", "JulianDele", "osbaldoXxC"];
const loads = Object.fromEntries(
  members.map((member) => [
    member,
    {
      functional: 0,
      technical: 0,
      operational: 0,
      issueCount: 0,
    },
  ]),
);
const technicalCategories = new Set([
  "implementation",
  "integration",
  "infrastructure",
]);
const osbaldoSafeCategories = new Set([
  "testing",
  "documentation",
  "evidence",
  "validation",
  "ui",
  "implementation",
]);
const riskyNature =
  /arquitectura|autenticaci[oó]n|seguridad|infraestructura|ci\/cd|persistencia|sincronizaci[oó]n|concurrencia|backend cr[ií]tico|refactor estructural/i;
const isTechnical = (issue) =>
  Boolean(
    issue.requiresCoding ||
    issue.requiresRepositoryKnowledge ||
    technicalCategories.has(issue.category),
  );
const safeForOsbaldo = (issue) =>
  issue.difficulty !== "hard" &&
  issue.risk === "low" &&
  osbaldoSafeCategories.has(issue.category) &&
  !(issue.category === "implementation" && issue.requiresRepositoryKnowledge) &&
  !(
    issue.requiresCoding &&
    technicalCategories.has(issue.category) &&
    riskyNature.test(`${issue.title} ${issue.body}`)
  );
const choose = (candidates, score, preference) =>
  [...candidates].sort((a, b) => {
    const difference = score(a) - score(b);
    return difference || preference.indexOf(a) - preference.indexOf(b);
  })[0];

for (const issue of ordered) {
  const operational = issue.requirementKind === "internalWorkflowRequirement";
  if (operational) {
    issue.assignee = "Draggodeidad";
    issue.functionalWeight = 0;
    issue.operationalWeight = Number(issue.operationalWeight || 1);
    loads.Draggodeidad.operational += issue.operationalWeight;
    loads.Draggodeidad.issueCount += 1;
    continue;
  }

  const weight = Number(issue.estimatedWeight || 1);
  const technical = isTechnical(issue);
  let candidates;
  let preference;
  let score;
  if (issue.difficulty === "hard") {
    candidates = ["Draggodeidad", "JulianDele"];
    preference = ["Draggodeidad", "JulianDele"];
    score = (member) => loads[member].technical * 10 + loads[member].functional;
  } else if (issue.difficulty === "medium") {
    const skilled = ["JulianDele", "Draggodeidad"];
    const leastSkilledLoad = Math.min(
      ...skilled.map((member) => loads[member].functional),
    );
    candidates =
      safeForOsbaldo(issue) &&
      loads.osbaldoXxC.functional + weight < leastSkilledLoad
        ? [...skilled, "osbaldoXxC"]
        : skilled;
    preference = ["JulianDele", "Draggodeidad", "osbaldoXxC"];
    score = (member) =>
      loads[member].functional + (technical ? loads[member].technical : 0);
  } else {
    const eligible = safeForOsbaldo(issue)
      ? members
      : ["Draggodeidad", "JulianDele"];
    const leastOther = Math.min(
      loads.Draggodeidad.functional,
      loads.JulianDele.functional,
    );
    if (
      eligible.includes("osbaldoXxC") &&
      loads.osbaldoXxC.functional <= leastOther + 2
    ) {
      candidates = ["osbaldoXxC"];
    } else {
      candidates = eligible;
    }
    preference = ["osbaldoXxC", "JulianDele", "Draggodeidad"];
    score = (member) => loads[member].functional;
  }

  issue.assignee = choose(candidates, score, preference);
  issue.functionalWeight = weight;
  issue.operationalWeight = 0;
  loads[issue.assignee].functional += weight;
  if (technical) loads[issue.assignee].technical += weight;
  loads[issue.assignee].issueCount += 1;
}

const unsafeOsbaldo = ordered.filter(
  (issue) =>
    issue.assignee === "osbaldoXxC" &&
    issue.requirementKind === "sourceRequirement" &&
    !safeForOsbaldo(issue),
);
if (unsafeOsbaldo.length)
  throw new Error(
    `Plan rechazado: asignación insegura para osbaldoXxC: ${unsafeOsbaldo.map((issue) => issue.key).join(", ")}`,
  );
const hardOwners = new Set(
  ordered
    .filter(
      (issue) =>
        issue.difficulty === "hard" &&
        issue.requirementKind === "sourceRequirement",
    )
    .map((issue) => issue.assignee),
);
if (hardOwners.has("osbaldoXxC"))
  throw new Error("Plan rechazado: una tarea hard fue asignada a osbaldoXxC.");

const planKeys = ordered.map((issue) => issue.key);
const desiredLabels = [
  ...new Set([
    data.course,
    `week-${data.weekPadded}`,
    ...ordered.flatMap((issue) => [
      `type:${issue.type}`,
      `priority:${issue.priority}`,
    ]),
  ]),
].filter(Boolean);
const existingLabels = new Set(data.repoContext?.labels || []);

return [
  {
    json: {
      ...data,
      plan: { ...plan, issues: ordered },
      planKeys,
      desiredLabels,
      missingLabels: desiredLabels.filter(
        (label) => !existingLabels.has(label),
      ),
      bootstrapKey: data.starter?.found ? "foundation" : null,
      assignmentPolicy: {
        strategy: "capability-aware-weighted-load",
        difficultyWeights: { easy: 1, medium: 2, hard: 3 },
        operationalExcludedFromFunctionalBalance: true,
        loads,
      },
    },
  },
];
