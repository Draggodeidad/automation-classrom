const colors = {
  DMI: '1D76DB', PWA: '5319E7',
  feature: '0E8A16', test: 'BFD4F2', docs: '0075CA', devops: 'FBCA04', evidence: 'C5DEF5',
  high: 'D93F0B', medium: 'FBCA04', low: '0E8A16',
};
const descriptions = {
  DMI: 'Materia DMI', PWA: 'Materia PWA',
  feature: 'Implementación de funcionalidad', test: 'Pruebas y calidad', docs: 'Documentación', devops: 'Infraestructura y automatización', evidence: 'Evidencia requerida',
  high: 'Prioridad alta', medium: 'Prioridad media', low: 'Prioridad baja',
};
const base = $json;
return base.missingLabels.map((name) => {
  const suffix = name.split(':')[1] || name;
  const isWeek = name.startsWith('week-');
  return {
    json: {
      runData: base,
      labelPayload: {
        name,
        color: isWeek ? 'D4C5F9' : (colors[suffix] || colors[name] || 'EDEDED'),
        description: isWeek ? `Semana ${name.slice(5)}` : (descriptions[suffix] || descriptions[name] || 'Creada por automatización Classroom'),
      },
    },
  };
});
