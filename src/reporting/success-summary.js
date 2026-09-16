const data = $json;
const issueLines = data.verifiedIssues.map((issue) => `${issue.key}: #${issue.number} ${issue.title}`).join('\n');
return [{
  json: {
    ...data,
    notificationSubject: `✅ ${data.course} Semana ${data.weekPadded} procesada`,
    notificationBody: `✅ Semana ${data.weekPadded} procesada\n\nMateria: ${data.course}\nRepositorio: ${data.repository}\nActividad: ${data.plan.assignmentTitle}\nDeadline: ${data.plan.deadline || 'No indicada'}\n\nIssues verificadas: ${data.verifiedIssues.length}\n\nDraggodeidad: ${data.assignments.Draggodeidad}\nJulianDele: ${data.assignments.JulianDele}\nosbaldoXxC: ${data.assignments.osbaldoXxC}\n\n${issueLines}\n\nActividad marcada como procesada.`,
  },
}];
