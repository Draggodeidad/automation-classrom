const HEADINGS = [
  '## Historia de Usuario',
  '## Contexto',
  '## Objetivo técnico',
  '## Alcance',
  '## Fuera de alcance',
  '## Archivos esperados',
  '## Pasos sugeridos',
  '## Criterios de aceptación',
  '## Pruebas',
  '## Dependencias',
  '## Evidencia individual',
  '## Definition of Done',
];

const asList = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [String(value)];
};
const bullets = (value) => {
  const items = asList(value);
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- No aplica.';
};
const numbered = (value) => {
  const items = asList(value);
  return items.length ? items.map((item, index) => `${index + 1}. ${item}`).join('\n') : '1. No aplica.';
};
const paragraph = (value) => {
  if (!value) return 'No aplica.';
  return Array.isArray(value) ? value.join('\n') : String(value);
};
const buildBody = (sections = {}) => [
  '## Historia de Usuario', paragraph(sections.historiaUsuario),
  '## Contexto', paragraph(sections.contexto),
  '## Objetivo técnico', bullets(sections.objetivoTecnico),
  '## Alcance', bullets(sections.alcance),
  '## Fuera de alcance', bullets(sections.fueraDeAlcance),
  '## Archivos esperados', bullets(sections.archivosEsperados),
  '## Pasos sugeridos', numbered(sections.pasosSugeridos),
  '## Criterios de aceptación', bullets(sections.criteriosAceptacion),
  '## Pruebas', bullets(sections.pruebas),
  '## Dependencias', bullets(sections.dependencias),
  '## Evidencia individual', bullets(sections.evidenciaIndividual),
  '## Definition of Done', bullets(sections.definitionOfDone),
].join('\n\n');

const data = $json;
const plan = data.plan || { issues: [] };
const issues = (Array.isArray(plan.issues) ? plan.issues : []).map((issue) => {
  const sections = issue.sections || {};
  return {
    ...issue,
    expectedFiles: asList(sections.archivosEsperados),
    acceptanceCriteria: asList(sections.criteriosAceptacion),
    tests: asList(sections.pruebas),
    evidence: asList(sections.evidenciaIndividual),
    body: buildBody(sections),
  };
});

return [{ json: { ...data, plan: { ...plan, issues } } }];