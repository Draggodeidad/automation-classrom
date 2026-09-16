const data = $json;
const metadata = (body, key) => {
  const match = String(body || '').match(new RegExp(`<!--\\s*${key}:([^>]+?)\\s*-->`, 'i'));
  return match ? match[1].trim() : null;
};
const runKey = `${data.courseId}:${data.courseWorkId}`;
const staticData = $getWorkflowStaticData('global');
staticData.classroomRuns ||= {};
const numbers = {};
for (const issue of data.existingAutomationIssues || []) {
  const key = metadata(issue.body, 'issue-key');
  if (key) numbers[key] = issue.number;
}
staticData.classroomRuns[runKey] = {
  courseId: data.courseId,
  courseWorkId: data.courseWorkId,
  course: data.course,
  week: data.weekPadded,
  repository: data.repository,
  planKeys: data.planKeys,
  numbers,
  updatedAt: new Date().toISOString(),
};

return data.plan.issues.map((issue, index) => ({
  json: {
    runKey,
    index,
    repository: data.repository,
    courseId: data.courseId,
    courseWorkId: data.courseWorkId,
    updateTime: data.updateTime,
    starterName: data.starter?.name || null,
    course: data.course,
    weekPadded: data.weekPadded,
    planKeys: data.planKeys,
    issue,
  },
}));
