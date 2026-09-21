const data = $json;
if (!data.plan || !Array.isArray(data.plan.issues)) throw new Error('PLAN_INVALID: plan ausente');
const plan = JSON.parse(JSON.stringify(data.plan));
const members = ['Draggodeidad', 'JulianDele', 'osbaldoXxC'];
const weights = { easy: 1, medium: 2, hard: 3 };
const issues = plan.issues;
const byKey = new Map(issues.map(issue => [issue.key, issue]));
if (byKey.size !== issues.length) throw new Error('PLAN_INVALID: keys duplicadas');
const operational = issue => ['foundation', 'classroom-delivery'].includes(issue.key);
const personal = issue => issue.personalRequirement === true;
const functional = issue => !operational(issue) && !personal(issue);
const technical = issue => Boolean(issue.requiresCoding || issue.requiresRepositoryKnowledge ||
  ['implementation', 'integration', 'infrastructure'].includes(issue.category));
const safe = issue => issue.difficulty !== 'hard' && issue.risk === 'low' &&
  ['testing', 'documentation', 'evidence', 'validation', 'ui', 'implementation'].includes(issue.category) &&
  !(issue.category === 'implementation' && issue.requiresRepositoryKnowledge) &&
  !/arquitectura|auth|autenticaci[oó]n|seguridad|security|infraestructura|ci\/cd|persistencia|sincronizaci[oó]n|concurrencia|backend cr[ií]tico|refactor estructural|integraci[oó]n delicada/i.test(`${issue.title} ${JSON.stringify([issue.sections?.objetivoTecnico, issue.sections?.alcance])}`);
const eligible = issue => safe(issue) ? members : ['Draggodeidad', 'JulianDele'];
function sort() {
  const indegree = new Map(issues.map(issue => [issue.key, 0]));
  const outgoing = new Map(issues.map(issue => [issue.key, []]));
  for (const issue of issues) for (const key of new Set(issue.dependsOn || [])) {
    if (!byKey.has(key)) throw new Error(`PLAN_INVALID: ${issue.key} depende de ${key} inexistente`);
    indegree.set(issue.key, indegree.get(issue.key) + 1);
    outgoing.get(key).push(issue.key);
  }
  const queue = issues.filter(issue => indegree.get(issue.key) === 0).map(issue => issue.key).sort();
  const result = [];
  while (queue.length) {
    const key = queue.shift(); result.push(byKey.get(key));
    for (const next of outgoing.get(key)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) { queue.push(next); queue.sort(); }
    }
  }
  if (result.length !== issues.length) throw new Error('PLAN_INVALID: dependency cycle');
  return result;
}
let ordered = sort();
const loads = Object.fromEntries(members.map(member => [member,
  { functional: 0, technical: 0, operational: 0, personalRequirement: 0, issueCount: 0 }]));
for (const issue of ordered) {
  if (!weights[issue.difficulty]) throw new Error(`PLAN_INVALID: dificultad ${issue.key}`);
  issue.estimatedWeight = weights[issue.difficulty];
  issue.functionalWeight = functional(issue) ? issue.estimatedWeight : 0;
  issue.technicalWeight = functional(issue) && technical(issue) ? issue.estimatedWeight : 0;
  issue.operationalWeight = operational(issue) ? issue.estimatedWeight : 0;
  issue.personalRequirementWeight = personal(issue) ? issue.estimatedWeight : 0;
  if (operational(issue)) issue.assignee = 'Draggodeidad';
  else if (personal(issue)) {
    if (!members.includes(issue.personalOwner) || issue.key !== `evidence-${issue.personalOwner.toLowerCase()}` ||
      issue.delegable !== false || (issue.assignee && issue.assignee !== issue.personalOwner)) {
      throw new Error('PLAN_INVALID: evidencia personal no delegable');
    }
    issue.assignee = issue.personalOwner;
  } else {
    const support = ['testing', 'validation', 'evidence'].includes(issue.category) || (issue.category === 'documentation' && !technical(issue));
    const preference = issue.difficulty === 'hard' ? ['Draggodeidad', 'JulianDele', 'osbaldoXxC'] :
      issue.difficulty === 'easy' && support ? ['osbaldoXxC', 'JulianDele', 'Draggodeidad'] :
      ['JulianDele', 'Draggodeidad', 'osbaldoXxC'];
    const score = member => loads[member].functional + (issue.difficulty === 'hard' ? loads[member].technical * 2 : 0) -
      (issue.difficulty === 'easy' && support && member === 'osbaldoXxC' ? 1 : 0);
    issue.assignee = [...eligible(issue)].sort((a, b) => score(a) - score(b) || preference.indexOf(a) - preference.indexOf(b))[0];
  }
  const load = loads[issue.assignee];
  load.functional += issue.functionalWeight; load.technical += issue.technicalWeight;
  load.operational += issue.operationalWeight; load.personalRequirement += issue.personalRequirementWeight; load.issueCount++;
}
const warnings = [];
const count = member => issues.filter(issue => functional(issue) && issue.assignee === member).length;
// Move only real, compatible work from a member with multiple tasks. Personal/operational work is locked.
for (const member of ['JulianDele', 'Draggodeidad', 'osbaldoXxC']) {
  if (count(member)) continue;
  const movable = issues.filter(issue => functional(issue) && eligible(issue).includes(member) && count(issue.assignee) > 1)
    .sort((a, b) => b.functionalWeight - a.functionalWeight || a.key.localeCompare(b.key));
  if (movable.length) {
    const issue = movable[0]; const from = issue.assignee;
    for (const [field, weight] of [['functional', issue.functionalWeight], ['technical', issue.technicalWeight]]) {
      loads[from][field] -= weight; loads[member][field] += weight;
    }
    loads[from].issueCount--; loads[member].issueCount++; issue.assignee = member;
    warnings.push({ code: 'WARNING_ASSIGNMENT_IMBALANCE', member, resolution: 'rebalanced', key: issue.key, from });
  } else warnings.push({ code: 'INFO_NO_COMPATIBLE_WORK', member,
    message: 'No existe trabajo funcional pendiente compatible disponible después del Gap Analysis sin dejar a otro integrante en cero.' });
}
// Personal evidence waits for that person's contribution, excluding successors that already wait for evidence.
const reaches = (start, target, seen = new Set()) => {
  if (start === target) return true;
  if (seen.has(start)) return false;
  seen.add(start);
  return (byKey.get(start)?.dependsOn || []).some(key => reaches(key, target, seen));
};
for (const issue of issues.filter(personal)) {
  issue.dependsOn = issues.filter(other => functional(other) && other.assignee === issue.personalOwner &&
    !reaches(other.key, issue.key)).map(other => other.key);
  if (!issue.dependsOn.length && byKey.has('foundation')) issue.dependsOn = ['foundation'];
}
const delivery = byKey.get('classroom-delivery');
if (delivery) delivery.dependsOn = issues.filter(issue => issue !== delivery).map(issue => issue.key);
ordered = sort();
for (const issue of ordered) {
  issue.personalRequirement = personal(issue);
  issue.delegable = personal(issue) || operational(issue) ? false : true;
  issue.sections ||= {};
  issue.sections.dependencias = [...(issue.dependsOn || []), ...(issue.satisfiedDependencies || []).map(d => `${d.dependency}: ${d.resolution}`)];
}
const teamCoverage = Object.fromEntries(members.map(member => [member, {
  functionalIssues: count(member), personalEvidence: issues.some(issue => personal(issue) && issue.assignee === member) || (data.completePersonalEvidence || []).some(entry => entry.member === member),
  operationalIssues: issues.filter(issue => operational(issue) && issue.assignee === member).length,
  functionalWeight: loads[member].functional, technicalWeight: loads[member].technical,
  operationalWeight: loads[member].operational, personalRequirementWeight: loads[member].personalRequirement,
}]));
const planKeys = ordered.map(issue => issue.key);
const desiredLabels = [...new Set([data.course, `week-${data.weekPadded}`,
  ...ordered.flatMap(issue => [`type:${issue.type}`, `priority:${issue.priority}`])])].filter(Boolean);
return [{ json: { ...data, plan: { ...plan, issues: ordered }, planKeys, desiredLabels,
  missingLabels: desiredLabels.filter(label => !(data.repoContext?.labels || []).includes(label)),
  bootstrapKey: data.starter?.found ? 'foundation' : null, teamCoverage, assignmentWarnings: warnings,
  assignmentPolicy: { strategy: 'capability-aware-weighted-load', difficultyWeights: weights,
    operationalExcludedFromFunctionalBalance: true, personalExcludedFromFunctionalBalance: true, loads },
} }];
