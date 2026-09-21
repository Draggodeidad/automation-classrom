const data = $json;
const globalState = $getWorkflowStaticData('global');
const registry = globalState.classroomRegistry?.[data.courseId];
if (data.selectionMode === 'manual_test_override' || !data.completeExisting || !registry ||
    registry.entries[data.courseWorkId]?.state === 'ignored_historical') return [{ json: data }];
// A complete GitHub issue set is the proof of processing, never a dry-run plan.
const processed = { courseWorkId: data.courseWorkId, state: 'processed',
  reason: 'verified_existing_github_issue_set', verifiedAt: new Date().toISOString(),
  issueNumbers: data.existingAutomationIssues.map(issue => issue.number) };
if (data.triggerKind === 'schedule') registry.entries[data.courseWorkId] = processed;
return [{ json: { ...data, courseWorkState: 'processed', executionResult: 'already_processed',
  registryObservation: { ...processed, persistedByScheduledExecution: data.triggerKind === 'schedule' } } }];
