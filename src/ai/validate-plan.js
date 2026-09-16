const requiredHeadings = [
  '## Historia de Usuario', '## Contexto', '## Objetivo técnico', '## Alcance',
  '## Fuera de alcance', '## Archivos esperados', '## Pasos sugeridos',
  '## Criterios de aceptación', '## Pruebas', '## Dependencias',
  '## Evidencia individual', '## Definition of Done',
];
const allowedAssignees = new Set(['Draggodeidad', 'JulianDele', 'osbaldoXxC']);
const allowedTypes = new Set(['feature', 'test', 'docs', 'devops', 'evidence']);
const allowedPriorities = new Set(['high', 'medium', 'low']);
const errors = [];
let plan;
try { plan = JSON.parse($json.rawModelText); }
catch (error) { errors.push(`JSON inválido: ${error.message}`); }

if (plan) {
  if (plan.course !== $json.course) errors.push('course no coincide con la entrada');
  if (plan.week !== $json.week) errors.push('week no coincide con la entrada');
  if (plan.repository !== $json.repository) errors.push('repository no coincide con la entrada');
  if (plan.source?.courseId !== $json.courseId) errors.push('source.courseId no coincide con la entrada');
  if (plan.source?.courseWorkId !== $json.courseWorkId) errors.push('source.courseWorkId no coincide con la entrada');
  if (plan.source?.updateTime !== $json.updateTime) errors.push('source.updateTime no coincide con la entrada');
  if ((plan.source?.starterName ?? null) !== ($json.starter?.name ?? null)) errors.push('source.starterName no coincide con la entrada');
  if (typeof plan.assignmentTitle !== 'string' || plan.assignmentTitle.length < 3) errors.push('assignmentTitle inválido');
  if (!Array.isArray(plan.issues) || plan.issues.length < 3 || plan.issues.length > 12) errors.push('issues debe contener entre 3 y 12 elementos');
  const keys = new Set();
  for (const [index, issue] of (plan.issues || []).entries()) {
    const prefix = `issues[${index}]`;
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(issue.key || '')) errors.push(`${prefix}.key inválida`);
    if (keys.has(issue.key)) errors.push(`${prefix}.key duplicada`);
    keys.add(issue.key);
    if (!String(issue.title || '').startsWith(`[${$json.course}][W${$json.weekPadded}]`)) errors.push(`${prefix}.title no usa el prefijo requerido`);
    if (!allowedAssignees.has(issue.assignee)) errors.push(`${prefix}.assignee inválido`);
    if (!allowedTypes.has(issue.type)) errors.push(`${prefix}.type inválido`);
    if (!allowedPriorities.has(issue.priority)) errors.push(`${prefix}.priority inválida`);
    if (!Array.isArray(issue.dependsOn)) errors.push(`${prefix}.dependsOn debe ser array`);
    for (const field of ['expectedFiles', 'acceptanceCriteria', 'tests', 'evidence']) {
      if (!Array.isArray(issue[field])) errors.push(`${prefix}.${field} debe ser array`);
    }
    if ((issue.acceptanceCriteria || []).length < 2) errors.push(`${prefix} requiere al menos 2 criterios`);
    if ((issue.tests || []).length < 1) errors.push(`${prefix} requiere pruebas`);
    if ((issue.evidence || []).length < 1) errors.push(`${prefix} requiere evidencia futura`);
    let last = -1;
    for (const heading of requiredHeadings) {
      const position = String(issue.body || '').indexOf(heading);
      if (position < 0) errors.push(`${prefix}.body no contiene ${heading}`);
      if (position >= 0 && position < last) errors.push(`${prefix}.body tiene encabezados fuera de orden`);
      last = Math.max(last, position);
    }
  }
  for (const issue of plan.issues || []) {
    for (const dependency of issue.dependsOn || []) {
      if (!keys.has(dependency)) errors.push(`${issue.key} depende de key inexistente: ${dependency}`);
      if (dependency === issue.key) errors.push(`${issue.key} depende de sí misma`);
    }
  }
  if ($json.starter?.found) {
    const expectedTitle = `[${$json.course}][W${$json.weekPadded}] Integrar ${$json.starter.name} y establecer baseline semanal`;
    const foundation = (plan.issues || []).find((issue) => issue.title === expectedTitle && issue.assignee === 'Draggodeidad' && issue.dependsOn?.length === 0);
    if (!foundation) errors.push(`falta Foundation exacta: ${expectedTitle}`);
  }
  if ($json.resumeKeys?.length) {
    const expected = [...$json.resumeKeys].sort().join(',');
    const actual = [...keys].sort().join(',');
    if (actual !== expected) errors.push(`reanudación insegura: keys esperadas ${expected}; recibidas ${actual}`);
  }
}

const retryPrompt = JSON.stringify({
  instruction: 'Corrige la respuesta anterior. Devuelve sólo JSON conforme al schema; no expliques.',
  validationErrors: errors,
  previousResponse: $json.rawModelText,
  originalRequest: JSON.parse($json.userPrompt),
});

return [{ json: { ...$json, valid: errors.length === 0, validationErrors: errors, plan, retryPrompt } }];
