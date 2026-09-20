const course = String($json.course || '').trim().toUpperCase();
const config = {
  PWA: {
    courseId: $env.CLASSROOM_PWA_COURSE_ID,
    repository: $env.PWA_REPOSITORY || 'Draggodeidad/pwa-utt',
  },
  DMI: {
    courseId: $env.CLASSROOM_DMI_COURSE_ID,
    repository: $env.DMI_REPOSITORY || 'Draggodeidad/campusops-dmi-team',
  },
};
if (!config[course]) throw new Error(`Materia no permitida: ${course || '(vacía)'}`);
if (!config[course].courseId) throw new Error(`Falta CLASSROOM_${course}_COURSE_ID`);

const manualWeek = $json.week === undefined || $json.week === null || $json.week === ''
  ? null
  : Number($json.week);
if (manualWeek !== null && (!Number.isInteger(manualWeek) || manualWeek < 1 || manualWeek > 99)) {
  throw new Error('La semana manual debe ser un entero entre 1 y 99');
}

return [{
  json: {
    course,
    courseId: String(config[course].courseId),
    repository: config[course].repository,
    requestedWeek: manualWeek,
    triggerKind: $json.triggerKind || 'manual',
    attempt: Number($json.attempt || 1),
    automationMode: String($env.AUTOMATION_MODE || 'dry-run').toLowerCase(),
  },
}];
