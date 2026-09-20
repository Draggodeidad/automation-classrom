const data = $json;
const plan = data.plan || { issues: [] };
const issues = Array.isArray(plan.issues) ? plan.issues : [];
const completedKeys = new Set(
  issues
    .filter((issue) => issue?.gapAnalysis?.status === "complete")
    .map((issue) => issue.key),
);
const excludedCompletedWork = issues
  .filter((issue) => completedKeys.has(issue.key))
  .map((issue) => ({
    key: issue.key,
    title: issue.title,
    reason:
      issue.gapAnalysis?.summary ||
      "La evidencia indica que ya está implementada.",
    evidence: issue.gapAnalysis?.evidence || [],
  }));
const remaining = issues
  .filter((issue) => !completedKeys.has(issue.key))
  .map((issue) => ({
    ...issue,
    dependsOn: (Array.isArray(issue.dependsOn) ? issue.dependsOn : []).filter(
      (dependency) => !completedKeys.has(dependency),
    ),
  }));

return [
  {
    json: {
      ...data,
      plan: { ...plan, issues: remaining },
      gapAnalysis: { excludedCompletedWork },
    },
  },
];
