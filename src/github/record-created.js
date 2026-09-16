const source = $('Resolve Dependencies').item.json;
const response = $json.body ?? $json;
if (!response.number) throw new Error(`GitHub no devolvió número para ${source.issue.key}`);
const staticData = $getWorkflowStaticData('global');
const state = staticData.classroomRuns[source.runKey];
state.numbers[source.issue.key] = response.number;
state.updatedAt = new Date().toISOString();
return [{ json: { runKey: source.runKey, key: source.issue.key, number: response.number, created: true } }];
