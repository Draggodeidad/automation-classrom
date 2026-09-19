const data = $json;
const plan = data.plan || { issues: [] };
const hasStarter = Boolean(data.starter?.found);
const weekPadded = String(plan.weekPadded || String(plan.week || '').padStart(2, '0'));
const prefix = `[${plan.course}][W${weekPadded}]`;
const starterName = plan.source?.starterName ?? null;
const issues = Array.isArray(plan.issues) ? plan.issues : [];

let next;
if (hasStarter) {
  const llmFoundation = issues.find((issue) => issue && issue.key === 'foundation');
  const foundation = {
    ...(llmFoundation || {}),
    key: 'foundation',
    title: `${prefix} Integrar ${starterName} y establecer baseline semanal`,
    assignee: 'Draggodeidad',
    dependsOn: [],
  };
  if (!llmFoundation) {
    foundation.type = foundation.type || 'devops';
    foundation.priority = foundation.priority || 'high';
  }
  next = [foundation, ...issues.filter((issue) => issue && issue.key !== 'foundation')];
} else {
  next = issues.filter((issue) => issue && issue.key !== 'foundation');
}

return [{ json: { ...data, plan: { ...plan, issues: next } } }];