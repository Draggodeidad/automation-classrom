const context = $json;
const raw = String(context.rawModelText || '').trim();
let parsed = null;
let parseError = null;

try {
  parsed = JSON.parse(raw);
} catch (error) {
  parseError = `LLM_SCHEMA_INVALID: JSON no parseable (${error.message})`;
}

const issues = parsed && Array.isArray(parsed.issues) ? parsed.issues : [];
if (!parseError && issues.length === 0) {
  parseError = 'LLM_SCHEMA_INVALID: falta el array "issues"';
}

const week = Number(context.week);
const weekPadded = String(context.weekPadded || (Number.isFinite(week) ? String(week).padStart(2, '0') : ''));
const identity = {
  course: context.course,
  week: Number.isFinite(week) ? week : null,
  weekPadded,
  repository: context.repository,
  assignmentTitle: context.assignmentTitle,
  deadline: context.dueAt ?? null,
  source: {
    courseId: context.courseId,
    courseWorkId: context.courseWorkId,
    updateTime: context.updateTime,
    starterName: context.starter?.name ?? null,
  },
};

const plan = { ...identity, issues };
const llmAttempt = Number($runIndex ?? context.llmAttempt ?? 0) + 1;

return [{ json: { ...context, llmAttempt, parseError, plan } }];