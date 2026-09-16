const data = $json;
const preview = data.plan.issues.map((issue, index) => ({
  order: index + 1,
  key: issue.key,
  title: issue.title,
  assignee: issue.assignee,
  labels: [data.course, `week-${data.weekPadded}`, `type:${issue.type}`, `priority:${issue.priority}`],
  dependsOn: issue.dependsOn,
  body: `${issue.body.trim()}\n\n<!-- automation:classroom -->\n<!-- classroom-course-id:${data.courseId} -->\n<!-- classroom-coursework-id:${data.courseWorkId} -->\n<!-- classroom-update-time:${data.updateTime} -->\n<!-- course:${data.course} -->\n<!-- week:${data.weekPadded} -->\n<!-- issue-key:${issue.key} -->\n<!-- starter:${data.starter?.name || 'none'} -->\n<!-- plan-keys:${data.planKeys.join(',')} -->`,
}));
return [{
  json: {
    mode: 'dry-run',
    mutationsPerformed: false,
    courseId: data.courseId,
    courseWorkId: data.courseWorkId,
    updateTime: data.updateTime,
    starter: { found: data.starter?.found, name: data.starter?.name || null, fileCount: data.starter?.fileCount || 0 },
    course: data.course,
    week: data.week,
    repository: data.repository,
    assignmentTitle: data.plan.assignmentTitle,
    deadline: data.plan.deadline,
    missingLabelsThatWouldBeCreated: data.missingLabels,
    issuesThatWouldBeCreated: preview,
    note: 'No se crearon Issues ni labels; Classroom y Drive se consultaron en modo de sólo lectura.',
  },
}];
