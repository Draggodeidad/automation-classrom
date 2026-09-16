const source = $('Apply Issue Recheck').item.json;
const response = $json.body ?? $json;
const number = response.number || source.issueNumber;
if (!number) throw new Error(`No se pudo reconciliar la Issue existente ${source.issue.key}`);
const staticData = $getWorkflowStaticData('global');
const state = staticData.classroomRuns[source.runKey];
state.numbers[source.issue.key] = number;
state.updatedAt = new Date().toISOString();
return [{ json: { runKey: source.runKey, key: source.issue.key, number, created: false, reconciled: true } }];
