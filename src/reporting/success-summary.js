const data = $json;
const issueLines = data.verifiedIssues.map((issue) => `${issue.key}: #${issue.number} ${issue.title}`).join('\n');
return [{
  json: {
    ...data,
    notificationSubject: `✅ ${data.course} Semana ${data.weekPadded} procesada`,
    notificationBody: `✅ ${data.course} W${data.weekPadded} procesada\n\nCourseWork: ${data.plan.assignmentTitle}\nCourseWork ID: ${data.courseWorkId}\nStarter: ${data.starter?.name || 'sin ZIP'}\nRepositorio: ${data.repository}\nDeadline: ${data.plan.deadline || 'No indicada'}\n\nIssues verificadas: ${data.verifiedIssues.length}\n\nDraggodeidad: ${data.assignments.Draggodeidad} Issues; carga funcional ${data.assignmentLoads?.Draggodeidad?.functional ?? 'n/a'}\nJulianDele: ${data.assignments.JulianDele} Issues; carga funcional ${data.assignmentLoads?.JulianDele?.functional ?? 'n/a'}\nosbaldoXxC: ${data.assignments.osbaldoXxC} Issues; carga funcional ${data.assignmentLoads?.osbaldoXxC?.functional ?? 'n/a'}\n\n${issueLines}`,
  },
}];
