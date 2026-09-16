const data = $json;
const numbers = data.existingAutomationIssues.map((issue) => `#${issue.number} ${issue.title}`).join('\n');
return [{
  json: {
    ...data,
    notificationSubject: `✅ ${data.course} Semana ${data.weekPadded} ya estaba completa`,
    notificationBody: `✅ Semana ${data.weekPadded} reconciliada\n\nMateria: ${data.course}\nRepositorio: ${data.repository}\nActividad: ${data.assignmentTitle}\n\nEl conjunto ya existía en GitHub y no se duplicó.\n\n${numbers}\n\nEl correo fue marcado como procesado.`,
  },
}];
