const item = $json;
const staticData = $getWorkflowStaticData('global');
const state = staticData.classroomRuns?.[item.runKey];
if (!state) throw new Error(`No existe estado de ejecución para ${item.runKey}`);
const issue = item.issue;
const existingNumber = state.numbers[issue.key];
const missingDependencies = issue.dependsOn.filter((key) => !state.numbers[key]);
if (missingDependencies.length) throw new Error(`No se resolvieron dependencias de ${issue.key}: ${missingDependencies.join(', ')}`);
const dependencyLines = issue.dependsOn.length
  ? issue.dependsOn.map((key) => `- #${state.numbers[key]} (${key})`).join('\n')
  : '- Ninguna.';
let body = String(issue.body).replace(
  /## Dependencias[\s\S]*?(?=\n## Evidencia individual)/,
  `## Dependencias\n\n${dependencyLines}\n`,
);
body = `${body.trim()}\n\n<!-- automation:classroom -->\n<!-- classroom-course-id:${item.courseId} -->\n<!-- classroom-coursework-id:${item.courseWorkId} -->\n<!-- classroom-update-time:${item.updateTime} -->\n<!-- course:${item.course} -->\n<!-- week:${item.weekPadded} -->\n<!-- issue-key:${issue.key} -->\n<!-- starter:${item.starterName || 'none'} -->\n<!-- plan-keys:${item.planKeys.join(',')} -->`;

return [{
  json: {
    ...item,
    skipCreate: Boolean(existingNumber),
    issueNumber: existingNumber || null,
    issuePayload: {
      title: issue.title,
      body,
      assignees: [issue.assignee],
      labels: [item.course, `week-${item.weekPadded}`, `type:${issue.type}`, `priority:${issue.priority}`],
    },
  },
}];
