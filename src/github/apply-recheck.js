const source = $('Resolve Dependencies').item.json;
const response = $json.body ?? $json;
const issues = Array.isArray(response) ? response : [];
const metadata = (body, key) => {
  const match = String(body || '').match(new RegExp(`<!--\\s*${key}:([^>]+?)\\s*-->`, 'i'));
  return match ? match[1].trim() : null;
};
const existing = issues.find((issue) =>
  metadata(issue.body, 'classroom-course-id') === source.courseId &&
  metadata(issue.body, 'classroom-coursework-id') === source.courseWorkId &&
  metadata(issue.body, 'issue-key') === source.issue.key
);
if (existing) {
  const staticData = $getWorkflowStaticData('global');
  staticData.classroomRuns[source.runKey].numbers[source.issue.key] = existing.number;
}
return [{
  json: {
    ...source,
    skipCreate: Boolean(existing || source.skipCreate),
    issueNumber: existing?.number || source.issueNumber || null,
  },
}];
