const data = $json;
const issues = data.plan?.issues || [];
const byKey = new Map(issues.map(issue => [issue.key, issue]));
const invalid = message => { throw new Error(`PLAN_INVALID: ${message}`); };
if (byKey.size !== issues.length) invalid('keys duplicadas');
if (!data.teamCoverage) invalid('team coverage ausente');
const visiting = new Set(), visited = new Set();
const visit = key => {
  if (!byKey.has(key)) invalid(`dependencia fantasma ${key}`);
  if (visiting.has(key)) invalid('ciclo');
  if (visited.has(key)) return;
  visiting.add(key);
  for (const dependency of byKey.get(key).dependsOn || []) visit(dependency);
  visiting.delete(key); visited.add(key);
};
for (const issue of issues) {
  visit(issue.key);
  if (['foundation', 'classroom-delivery'].includes(issue.key) && issue.assignee !== 'Draggodeidad') invalid('operational owner');
  if (issue.personalRequirement && (issue.assignee !== issue.personalOwner || issue.delegable !== false ||
    issue.key !== `evidence-${issue.personalOwner.toLowerCase()}`)) invalid('evidencia personal reasignada');
  if (issue.personalRequirement) for (const requirement of issue.personalSourceRequirements || []) {
    const source = data.groundingCatalog?.[requirement.id];
    if (!source || !['classroom', 'starter'].includes(source.source) || !source.content.includes(requirement.text)) invalid('evidencia personal sin fuente');
  }
  if (!issue.personalRequirement && issue.requirementKind !== 'internalWorkflowRequirement' && !(issue.provenance || []).length) invalid('trabajo sin provenance');
}
if (data.personalRequirementsRequired) for (const member of ['Draggodeidad', 'JulianDele', 'osbaldoXxC']) {
  const key = `evidence-${member.toLowerCase()}`;
  if ((data.completePersonalEvidence || []).some(entry => entry.key === key && entry.member === member)) continue;
  if (!byKey.has(key)) invalid(`falta ${key}`);
  if (!byKey.get('classroom-delivery')?.dependsOn.includes(key)) invalid('entrega sin evidencia obligatoria');
}
return [{ json: { ...data, mode: 'dry-run', automationMode: 'dry-run', mutationsPerformed: false, finalAssignmentStatus: 'valid' } }];
