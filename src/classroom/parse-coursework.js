const data = $json;
const payload = data.classroomResponse?.body ?? data.classroomResponse ?? {};
const rows = Array.isArray(payload.courseWork) ? payload.courseWork : [];
const excluded = /\b(quiz(?:\s+semanal|\s+individual)?|examen|recordatorio)\b/i;
const weekFrom = (title) => {
  const match = String(title || '').match(/(?:\[\s*)?semana\s*0*(\d{1,2})(?:\s*\])?/i);
  return match ? Number(match[1]) : null;
};
const cutoff = Date.now() - 36 * 60 * 60 * 1000;
const activityTimestamp = (courseWork) => Math.max(...[
  courseWork.creationTime, courseWork.updateTime, courseWork.scheduledTime,
].map((value) => Date.parse(value || 0)).filter(Number.isFinite));
const candidates = rows
  .map((courseWork) => ({ courseWork, week: weekFrom(courseWork.title) }))
  .filter(({ courseWork, week }) =>
    courseWork.state === 'PUBLISHED' &&
    week !== null && week >= 1 && week <= 99 &&
    !excluded.test(`${courseWork.title || ''}\n${courseWork.description || ''}`) &&
    (data.requestedWeek === null
      ? activityTimestamp(courseWork) >= cutoff
      : week === data.requestedWeek))
  .sort((a, b) => Date.parse(b.courseWork.updateTime || 0) - Date.parse(a.courseWork.updateTime || 0));

if (!candidates.length) {
  return [{ json: { ...data, found: false, executionResult: data.attempt >= 2 ? 'not_found_after_retry' : 'not_found' } }];
}

const { courseWork, week } = candidates[0];
if (!courseWork.id || !courseWork.courseId || !courseWork.updateTime) {
  throw new Error('CourseWork incompleto: faltan courseId, id o updateTime');
}
if (String(courseWork.courseId) !== String(data.courseId)) {
  throw new Error('CourseWork pertenece a un courseId distinto al solicitado');
}

const dueAt = courseWork.dueDate
  ? `${courseWork.dueDate.year}-${String(courseWork.dueDate.month).padStart(2, '0')}-${String(courseWork.dueDate.day).padStart(2, '0')}` +
    (courseWork.dueTime ? `T${String(courseWork.dueTime.hours || 0).padStart(2, '0')}:${String(courseWork.dueTime.minutes || 0).padStart(2, '0')}:00` : '')
  : null;

return [{
  json: {
    ...data,
    found: true,
    executionResult: 'coursework_found',
    courseWorkId: String(courseWork.id),
    week,
    weekPadded: String(week).padStart(2, '0'),
    assignmentTitle: String(courseWork.title || '').trim(),
    description: String(courseWork.description || '').slice(0, 30000),
    materials: Array.isArray(courseWork.materials) ? courseWork.materials : [],
    alternateLink: courseWork.alternateLink || null,
    creationTime: courseWork.creationTime || null,
    updateTime: courseWork.updateTime,
    dueAt,
    scheduledTime: courseWork.scheduledTime || null,
    maxPoints: courseWork.maxPoints ?? null,
    workType: courseWork.workType || null,
  },
}];
