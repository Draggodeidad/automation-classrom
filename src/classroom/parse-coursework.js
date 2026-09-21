const data = $json;
const payload = data.classroomResponse?.body ?? data.classroomResponse ?? {};
if (payload.nextPageToken) throw new Error('CLASSROOM_INCOMPLETE_SNAPSHOT: faltan páginas');
const rows = Array.isArray(payload.courseWork) ? payload.courseWork : [];
const globalState = $getWorkflowStaticData('global');
const saved = globalState.classroomRegistry?.[data.courseId];
const registry = saved ? JSON.parse(JSON.stringify(saved)) : null;
const override = data.manualCourseWorkOverride;
if (override && (data.triggerKind !== 'manual' || data.automationMode !== 'dry-run')) throw new Error('OVERRIDE_FORBIDDEN');
const weekFrom = (title) => {
  const match = String(title || '').match(/(?:\[\s*)?semana\s*0*(\d{1,2})(?:\s*\])?/i);
  return match ? Number(match[1]) : null;
};
const applicable = (cw) => cw.state === 'PUBLISHED' && weekFrom(cw.title) >= 1 && weekFrom(cw.title) <= 99 &&
  !/\b(quiz|examen|recordatorio)\b/i.test(`${cw.title || ''}`);
for (const cw of rows) {
  if (!cw.id || String(cw.courseId) !== String(data.courseId)) throw new Error('CLASSROOM_INVALID_IDENTITY');
}
const noWork = (extra) => [{ json: { ...data, mode: 'dry-run', automationMode: 'dry-run', mutationsPerformed: false,
  found: false, pendingCourseworkCount: 0, issuesThatWouldBeCreated: [], ...extra } }];
if (data.bootstrapHistorical) {
  if (registry) throw new Error('BOOTSTRAP_ALREADY_EXISTS: no se permite mover el cutover');
  const cutoverAt = data.selectionStartedAt || new Date().toISOString();
  const entries = Object.fromEntries(rows.map(cw => [String(cw.id), {
    courseWorkId: String(cw.id), state: 'ignored_historical', reason: 'present_before_automation_cutover',
    title: cw.title, observedAt: cutoverAt,
  }]));
  return noWork({ executionResult: 'no_pending_coursework', selectionMode: 'historical_bootstrap_preview',
    historicalCourseworkCount: rows.length, cutoverAt, registryPersisted: false,
    proposedRegistry: { version: 1, courseId: data.courseId, cutoverAt, entries } });
}
if (!registry && !override) return noWork({ executionResult: 'historical_bootstrap_required',
  selectionMode: 'bootstrap_required', historicalCourseworkCount: 0, registryPersisted: false });
if (registry && (registry.version !== 1 || !Number.isFinite(Date.parse(registry.cutoverAt)) || !registry.entries)) {
  throw new Error('REGISTRY_INVALID');
}
const allowedStates = new Set(['ignored_historical', 'pending', 'processing', 'processed', 'failed', 'skipped', 'superseded']);
if (registry) for (const [id, entry] of Object.entries(registry.entries)) {
  if (entry.courseWorkId !== id || !allowedStates.has(entry.state)) throw new Error('REGISTRY_INVALID');
}
const entries = registry?.entries || {};
const candidates = rows.filter(applicable).filter(cw => {
  if (override) return String(cw.id) === override;
  const state = entries[cw.id]?.state;
  return !state || state === 'pending' || state === 'failed';
});
// Creation/publication time ascending; never updateTime. Stable ID breaks ties.
const timestamp = cw => {
  for (const value of [cw.scheduledTime, cw.creationTime]) {
    const time = Date.parse(value || '');
    if (Number.isFinite(time)) return time;
  }
  return Number.MAX_SAFE_INTEGER;
};
candidates.sort((a, b) => timestamp(a) - timestamp(b) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
if (!override && registry) for (const cw of candidates) {
  entries[cw.id] ||= { courseWorkId: String(cw.id), state: 'pending', reason: 'new_id_after_bootstrap', observedAt: new Date().toISOString() };
}
// n8n persists static data only in successful published trigger executions; manual previews remain read-only.
if (!override && registry && data.triggerKind === 'schedule') {
  globalState.classroomRegistry[data.courseId] = registry;
}
const selection = {
  selectionMode: override ? 'manual_test_override' : 'pending_registry', cutoverAt: registry?.cutoverAt || null,
  historicalCourseworkCount: Object.values(entries).filter(x => x.state === 'ignored_historical').length,
  pendingCourseworkCount: override ? 0 : candidates.length,
  selectionOrder: 'scheduledTime || creationTime ascending, courseWorkId ascending',
};
if (!candidates.length) {
  if (override) throw new Error('OVERRIDE_NOT_APPLICABLE_OR_NOT_FOUND');
  return noWork({ ...selection, executionResult: 'no_pending_coursework' });
}
const cw = candidates[0];
const week = weekFrom(cw.title);
const dueAt = cw.dueDate ? `${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2,'0')}-${String(cw.dueDate.day).padStart(2,'0')}` +
  (cw.dueTime ? `T${String(cw.dueTime.hours || 0).padStart(2,'0')}:${String(cw.dueTime.minutes || 0).padStart(2,'0')}:00` : '') : null;
return [{ json: { ...data, ...selection, found: true, executionResult: 'coursework_found',
  courseWorkId: String(cw.id), courseWorkState: entries[cw.id]?.state || 'pending',
  historicalStatus: entries[cw.id]?.state === 'ignored_historical' ? 'ignored_historical' : 'not_historical',
  week, weekPadded: String(week).padStart(2,'0'), assignmentTitle: String(cw.title || '').trim(),
  description: String(cw.description || '').slice(0,30000), materials: cw.materials || [],
  alternateLink: cw.alternateLink || null, creationTime: cw.creationTime || null, updateTime: cw.updateTime || null,
  dueAt, scheduledTime: cw.scheduledTime || null, maxPoints: cw.maxPoints ?? null, workType: cw.workType || null,
} }];
