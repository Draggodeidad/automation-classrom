const data = $json;
const numbers = data.existingAutomationIssues.map((issue) => `#${issue.number} ${issue.title}`).join('\n');
return [{
  json: {
    ...data,
    notificationSubject: `✅ ${data.course} Semana ${data.weekPadded} ya estaba completa`,
    notificationBody: `✅ ${data.course} W${data.weekPadded} ya estaba completa\n\nCourseWork ID: ${data.courseWorkId}\nRepositorio: ${data.repository}\nActividad: ${data.assignmentTitle}\nStarter: ${data.starter?.name || 'sin ZIP'}\n\nEl conjunto ya existía en GitHub y no se duplicó.\n\n${numbers}`,
  },
}];
