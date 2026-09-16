const planData = $('Plan and Topological Sort').item.json;
const response = $json.body ?? $json;
const issues = Array.isArray(response) ? response : [];
const metadata = (body, key) => {
  const match = String(body || '').match(new RegExp(`<!--\\s*${key}:([^>]+?)\\s*-->`, 'i'));
  return match ? match[1].trim() : null;
};
const matching = issues.filter((issue) =>
  metadata(issue.body, 'classroom-course-id') === planData.courseId &&
  metadata(issue.body, 'classroom-coursework-id') === planData.courseWorkId &&
  metadata(issue.body, 'course') === planData.course &&
  metadata(issue.body, 'week') === planData.weekPadded
);
const byKey = Object.fromEntries(matching.map((issue) => [metadata(issue.body, 'issue-key'), issue]));
const missing = planData.planKeys.filter((key) => !byKey[key]);
if (missing.length) throw new Error(`Verificación falló; faltan Issues: ${missing.join(', ')}.`);
const configurationErrors = [];
for (const expected of planData.plan.issues) {
  const actual = byKey[expected.key];
  const assignees = (actual.assignees || []).map((assignee) => assignee.login);
  const labels = (actual.labels || []).map((label) => label.name || label);
  const expectedLabels = [planData.course, `week-${planData.weekPadded}`, `type:${expected.type}`, `priority:${expected.priority}`];
  if (!assignees.includes(expected.assignee)) configurationErrors.push(`${expected.key}: falta assignee ${expected.assignee}`);
  for (const label of expectedLabels) if (!labels.includes(label)) configurationErrors.push(`${expected.key}: falta label ${label}`);
  if (!metadata(actual.body, 'plan-keys')) configurationErrors.push(`${expected.key}: falta plan-keys`);
}
if (configurationErrors.length) throw new Error(`Verificación de Issues falló: ${configurationErrors.join('; ')}.`);
const assignments = { Draggodeidad: 0, JulianDele: 0, osbaldoXxC: 0 };
for (const issue of planData.plan.issues) assignments[issue.assignee] += 1;
return [{
  json: {
    ...planData,
    verifiedIssues: planData.planKeys.map((key) => ({ key, number: byKey[key].number, title: byKey[key].title })),
    assignments,
    verified: true,
  },
}];
