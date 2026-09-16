const data = $json;
const preview = data.plan.issues.map((issue, index) => ({
  order: index + 1,
  key: issue.key,
  title: issue.title,
  assignee: issue.assignee,
  labels: [data.course, `week-${data.weekPadded}`, `type:${issue.type}`, `priority:${issue.priority}`],
  dependsOn: issue.dependsOn,
  body: `${issue.body.trim()}\n\n<!-- automation:classroom -->\n<!-- classroom-message-id:${data.gmailMessageId} -->\n<!-- course:${data.course} -->\n<!-- week:${data.weekPadded} -->\n<!-- issue-key:${issue.key} -->\n<!-- plan-keys:${data.planKeys.join(',')} -->`,
}));
return [{
  json: {
    mode: 'dry-run',
    mutationsPerformed: false,
    gmailMessageId: data.gmailMessageId,
    course: data.course,
    week: data.week,
    repository: data.repository,
    assignmentTitle: data.plan.assignmentTitle,
    deadline: data.plan.deadline,
    missingLabelsThatWouldBeCreated: data.missingLabels,
    issuesThatWouldBeCreated: preview,
    note: 'No se crearon Issues, no se crearon labels y Gmail no fue modificado.',
  },
}];
