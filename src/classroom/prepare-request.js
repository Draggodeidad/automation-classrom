const course = String($json.course || '').trim().toUpperCase();
const config = {
  PWA: { courseId: $env.CLASSROOM_PWA_COURSE_ID, repository: $env.PWA_REPOSITORY || 'Draggodeidad/pwa-utt' },
  DMI: { courseId: $env.CLASSROOM_DMI_COURSE_ID, repository: $env.DMI_REPOSITORY || 'Draggodeidad/campusops-dmi-team' },
};
if (!config[course]?.courseId) throw new Error(`Falta configuración Classroom para ${course}`);
if ($json.week != null) throw new Error('Usa manualCourseWorkOverride; la semana sólo es metadata.');
const triggerKind = $json.triggerKind;
if (!['manual', 'schedule'].includes(triggerKind)) throw new Error('Trigger desconocido');
const manualCourseWorkOverride = String($json.manualCourseWorkOverride || '').trim() || null;
if (manualCourseWorkOverride && (triggerKind !== 'manual' || String($env.AUTOMATION_MODE || 'dry-run') !== 'dry-run')) {
  throw new Error('OVERRIDE_FORBIDDEN: sólo ejecución manual explícita en dry-run');
}
if ($json.bootstrapHistorical && (triggerKind !== 'manual' || manualCourseWorkOverride)) {
  throw new Error('BOOTSTRAP_FORBIDDEN: requiere ejecución manual sin override');
}
return [{ json: {
  course, courseId: String(config[course].courseId), repository: config[course].repository,
  triggerKind, attempt: Number($json.attempt || 1), manualCourseWorkOverride,
  bootstrapHistorical: $json.bootstrapHistorical === true,
  selectionStartedAt: new Date().toISOString(), automationMode: 'dry-run', mode: 'dry-run', mutationsPerformed: false,
} }];
