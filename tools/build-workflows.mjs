import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const readExisting = (relative) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
  catch { return { nodes: [] }; }
};
const existingMain = readExisting('workflows/classroom-to-github.json');
const existingError = readExisting('workflows/classroom-error-handler.json');
const existingMainNodes = new Map(existingMain.nodes.map((node) => [node.name, node]));
const existingErrorNodes = new Map(existingError.nodes.map((node) => [node.name, node]));
const nodeAliases = { 'Enforce Operational Issues': 'Enforce Foundation' };
const existingNode = (name, map = existingMainNodes) => map.get(name) || map.get(nodeAliases[name]);
const nodeId = (name, map = existingMainNodes) => existingNode(name, map)?.id || randomUUID();
const conditionId = (name, map = existingMainNodes) =>
  existingNode(name, map)?.parameters?.conditions?.conditions?.[0]?.id || randomUUID();
const codeFiles = {
  'prepare-request.js': 'src/classroom/prepare-request.js',
  'parse-coursework.js': 'src/classroom/parse-coursework.js',
  'inspect-materials.js': 'src/classroom/inspect-materials.js',
  'validate-file.js': 'src/drive/validate-file.js',
  'validate-zip.js': 'src/drive/validate-zip.js',
  'inspect-starter.js': 'src/drive/inspect-starter.js',
  'no-starter.js': 'src/drive/no-starter.js',
  'build-context.js': 'src/github/build-context.js',
  'prepare-llm-request.js': 'src/ai/prepare-llm-request.js',
  'prepare-gemini-repair.js': 'src/ai/prepare-gemini-repair.js',
  'build-llm-payload.js': 'src/ai/build-llm-payload.js',
  'prepare-openrouter-fallback.js': 'src/ai/prepare-openrouter-fallback.js',
  'normalize-ai.js': 'src/ai/normalize-ai.js',
  'parse-structured-plan.js': 'src/ai/parse-structured-plan.js',
  'apply-gap-analysis.js': 'src/ai/apply-gap-analysis.js',
  'enforce-foundation.js': 'src/ai/enforce-foundation.js',
  'normalize-plan.js': 'src/ai/normalize-plan.js',
  'build-bodies.js': 'src/ai/build-bodies.js',
  'validate-plan.js': 'src/ai/validate-plan.js',
  'fail-closed.js': 'src/ai/fail-closed.js',
  'plan-toposort.js': 'src/planning/plan-toposort.js',
  'prepare-issue-queue.js': 'src/planning/prepare-issue-queue.js',
  'dry-run-summary.js': 'src/reporting/dry-run-summary.js',
  'prepare-labels.js': 'src/github/prepare-labels.js',
  'continue-after-labels.js': 'src/glue/continue-after-labels.js',
  'resolve-issue.js': 'src/github/resolve-issue.js',
  'apply-recheck.js': 'src/github/apply-recheck.js',
  'record-created.js': 'src/github/record-created.js',
  'record-existing.js': 'src/github/record-existing.js',
  'verify-created-set.js': 'src/github/verify-created-set.js',
  'reconcile-summary.js': 'src/reporting/reconcile-summary.js',
  'success-summary.js': 'src/reporting/success-summary.js',
};
const code = (name) => fs.readFileSync(path.join(root, codeFiles[name]), 'utf8').trim();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/issue-plan.schema.json'), 'utf8'));
const contextCode = code('build-context.js').replace('__ISSUE_PLAN_SCHEMA__', JSON.stringify(schema));

const nodes = [];
const connections = {};
function add(name, type, position, parameters = {}, extra = {}) {
  const node = { parameters, type, typeVersion: extra.typeVersion ?? 2, position, id: nodeId(name), name };
  if (extra.credentials) node.credentials = extra.credentials;
  if (extra.onError) node.onError = extra.onError;
  if (extra.retryOnFail !== undefined) node.retryOnFail = extra.retryOnFail;
  nodes.push(node);
  return node;
}
function connect(from, to, output = 0) {
  connections[from] ||= { main: [] };
  while (connections[from].main.length <= output) connections[from].main.push([]);
  connections[from].main[output].push({ node: to, type: 'main', index: 0 });
}

const googleCredentials = { oAuth2Api: { name: 'Google Classroom and Drive OAuth2' } };
const gmailCredentials = { gmailOAuth2: { name: 'Gmail notifications (optional)' } };
const githubCredentials = { githubApi: { name: 'GitHub account' } };
const geminiCredentials = { httpHeaderAuth: { name: 'Gemini API Key' } };
const openRouterCredentials = { httpHeaderAuth: { name: 'OpenRouter API Key' } };
const githubHeaders = { parameters: [
  { name: 'Accept', value: 'application/vnd.github+json' },
  { name: 'X-GitHub-Api-Version', value: '2026-03-10' },
] };
const fullResponse = { response: { response: { fullResponse: true, neverError: false } } };
const safeFullResponse = { response: { response: { fullResponse: true, neverError: true } } };
const safeAiResponse = { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } };
function githubGet(name, position, url, safe = false) {
  add(name, 'n8n-nodes-base.httpRequest', position, {
    url, authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
    sendHeaders: true, headerParameters: githubHeaders, options: safe ? safeFullResponse : fullResponse,
  }, { typeVersion: 4.3, credentials: githubCredentials });
}
function boolIf(name, position, leftValue) {
  add(name, 'n8n-nodes-base.if', position, {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: conditionId(name), leftValue, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
  }, { typeVersion: 2.2 });
}
function equalsIf(name, position, leftValue, rightValue) {
  add(name, 'n8n-nodes-base.if', position, {
    conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: conditionId(name), leftValue, rightValue, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {},
  }, { typeVersion: 2.2 });
}
function googleGet(name, position, url, options = fullResponse) {
  add(name, 'n8n-nodes-base.httpRequest', position, {
    url, authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api', options,
  }, { typeVersion: 4.3, credentials: googleCredentials });
}
function notificationGate(name, position) {
  boolIf(name, position, "={{ String($env.NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true' }}");
}

add('Schedule PWA Monday 09:10', 'n8n-nodes-base.scheduleTrigger', [-2600, -260], {
  rule: { interval: [{ field: 'cronExpression', expression: '10 9 * * 1' }] },
}, { typeVersion: 1.2 });
add('Route PWA', 'n8n-nodes-base.code', [-2380, -260], {
  jsCode: "return [{ json: { course: 'PWA', triggerKind: 'schedule', attempt: 1 } }];",
}, { typeVersion: 2 });
add('Schedule DMI Tuesday 09:10', 'n8n-nodes-base.scheduleTrigger', [-2600, -80], {
  rule: { interval: [{ field: 'cronExpression', expression: '10 9 * * 2' }] },
}, { typeVersion: 1.2 });
add('Route DMI', 'n8n-nodes-base.code', [-2380, -80], {
  jsCode: "return [{ json: { course: 'DMI', triggerKind: 'schedule', attempt: 1 } }];",
}, { typeVersion: 2 });
add('Manual Trigger', 'n8n-nodes-base.manualTrigger', [-2600, 120], {}, { typeVersion: 1 });
add('Manual Request', 'n8n-nodes-base.code', [-2380, 120], {
  jsCode: "// Edita únicamente estos valores para backfill/recuperación manual.\nconst request = { course: 'PWA', week: 1 };\nreturn [{ json: { ...request, triggerKind: 'manual', attempt: 1 } }];",
}, { typeVersion: 2 });
add('Prepare Classroom Request', 'n8n-nodes-base.code', [-2160, -80], { jsCode: code('prepare-request.js') }, { typeVersion: 2 });

const classroomUrl = "={{ 'https://classroom.googleapis.com/v1/courses/' + encodeURIComponent($json.courseId) + '/courseWork?courseWorkStates=PUBLISHED&orderBy=updateTime%20desc&pageSize=5&fields=courseWork(courseId,id,title,description,materials,state,alternateLink,creationTime,updateTime,dueDate,dueTime,scheduledTime,maxPoints,workType)' }}";
googleGet('Classroom - List CourseWork Initial', [-1940, -80], classroomUrl);
add('Attach Initial Classroom Response', 'n8n-nodes-base.code', [-1720, -80], {
  jsCode: "const context = $('Prepare Classroom Request').item.json; return [{ json: { ...context, classroomResponse: $json } }];",
}, { typeVersion: 2 });
add('Parse Initial CourseWork', 'n8n-nodes-base.code', [-1500, -80], { jsCode: code('parse-coursework.js') }, { typeVersion: 2 });
boolIf('CourseWork Found Initial?', [-1280, -80], '={{ $json.found }}');
add('Wait 30 Minutes Once', 'n8n-nodes-base.wait', [-1060, 100], { amount: 30, unit: 'minutes' }, { typeVersion: 1.1 });
add('Increment Retry', 'n8n-nodes-base.code', [-840, 100], {
  jsCode: "if (Number($json.attempt) !== 1) throw new Error('Retry guard: sólo se permite un retry'); return [{ json: { ...$json, attempt: 2 } }];",
}, { typeVersion: 2 });
googleGet('Classroom - List CourseWork Retry', [-620, 100], classroomUrl);
add('Attach Retry Classroom Response', 'n8n-nodes-base.code', [-400, 100], {
  jsCode: "const context = $('Increment Retry').item.json; return [{ json: { ...context, classroomResponse: $json } }];",
}, { typeVersion: 2 });
add('Parse Retry CourseWork', 'n8n-nodes-base.code', [-180, 100], { jsCode: code('parse-coursework.js') }, { typeVersion: 2 });
boolIf('CourseWork Found Retry?', [40, 100], '={{ $json.found }}');
add('Build No Activity Summary', 'n8n-nodes-base.code', [260, 260], {
  jsCode: "return [{json:{...$json,notificationSubject:`❌ No se encontró ${$json.course} tras el retry`,notificationBody:`❌ No se procesó ${$json.course}\\n\\nCourse ID: ${$json.courseId}\\nConsultas Classroom: 2\\nResultado: ninguna actividad semanal válida a las 09:10 ni a las 09:40.\\n\\nGitHub no fue modificado.`,executionResult:'not_found_after_retry'}}];",
}, { typeVersion: 2 });
notificationGate('Notify No Activity?', [480, 260]);
add('Gmail - Send No Activity Alert', 'n8n-nodes-base.gmail', [700, 220], {
  operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false },
}, { typeVersion: 2.1, credentials: gmailCredentials });

add('Inspect Materials', 'n8n-nodes-base.code', [260, -80], { jsCode: code('inspect-materials.js') }, { typeVersion: 2 });
boolIf('Starter ZIP Found?', [480, -80], '={{ $json.starterFound }}');
add('No Starter Context', 'n8n-nodes-base.code', [700, 40], { jsCode: code('no-starter.js') }, { typeVersion: 2 });
googleGet('Drive - Starter Metadata', [700, -200], "={{ 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent($json.starterDriveFileId) + '?fields=id,name,mimeType,size,md5Checksum,capabilities(canDownload),modifiedTime' }}");
add('Attach Drive Metadata', 'n8n-nodes-base.code', [920, -200], {
  jsCode: "const context = $('Inspect Materials').item.json; return [{ json: { ...context, driveMetadata: $json } }];",
}, { typeVersion: 2 });
add('Validate Drive File', 'n8n-nodes-base.code', [1140, -200], { jsCode: code('validate-file.js') }, { typeVersion: 2 });
add('Drive - Download Starter ZIP', 'n8n-nodes-base.httpRequest', [1360, -200], {
  url: "={{ 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent($json.starterDriveFileId) + '?alt=media' }}",
  authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api',
  options: { response: { response: { responseFormat: 'file', outputPropertyName: 'data', neverError: false } } },
}, { typeVersion: 4.3, credentials: googleCredentials });
add('Attach Download Context', 'n8n-nodes-base.code', [1580, -200], {
  jsCode: "const context = $('Validate Drive File').item.json; return [{ json: context, binary: $binary }];",
}, { typeVersion: 2 });
add('Validate ZIP Security', 'n8n-nodes-base.code', [1800, -200], { jsCode: code('validate-zip.js') }, { typeVersion: 2 });
add('Extract Starter ZIP', 'n8n-nodes-base.compression', [2020, -200], {
  binaryPropertyName: 'data', outputPrefix: 'file_',
}, { typeVersion: 1.1 });
add('Inspect Starter', 'n8n-nodes-base.code', [2240, -200], { jsCode: code('inspect-starter.js') }, { typeVersion: 2 });
add('Activity Context', 'n8n-nodes-base.code', [2460, -80], { jsCode: 'return $input.all();' }, { typeVersion: 2 });

githubGet('GitHub - Repository', [2680, -80], "={{ 'https://api.github.com/repos/' + $('Activity Context').item.json.repository }}");
githubGet('GitHub - Recent Issues', [2900, -80], "={{ 'https://api.github.com/repos/' + $('Activity Context').item.json.repository + '/issues?state=all&sort=created&direction=desc&per_page=100' }}");
githubGet('GitHub - Search CourseWork ID', [3120, -80], "={{ 'https://api.github.com/search/issues?q=' + encodeURIComponent('repo:' + $('Activity Context').item.json.repository + ' is:issue in:body \"classroom-coursework-id:' + $('Activity Context').item.json.courseWorkId + '\"') + '&per_page=100' }}");
githubGet('GitHub - Search Course Week', [3340, -80], "={{ 'https://api.github.com/search/issues?q=' + encodeURIComponent('repo:' + $('Activity Context').item.json.repository + ' is:issue in:body \"course:' + $('Activity Context').item.json.course + '\" \"week:' + $('Activity Context').item.json.weekPadded + '\"') + '&per_page=100' }}");
githubGet('GitHub - Open Pull Requests', [3560, -80], "={{ 'https://api.github.com/repos/' + $('Activity Context').item.json.repository + '/pulls?state=open&per_page=30' }}");
githubGet('GitHub - Labels', [3780, -80], "={{ 'https://api.github.com/repos/' + $('Activity Context').item.json.repository + '/labels?per_page=100' }}");
githubGet('GitHub - Tree', [4000, -80], "={{ 'https://api.github.com/repos/' + $('Activity Context').item.json.repository + '/git/trees/' + encodeURIComponent($('GitHub - Repository').item.json.body.default_branch) + '?recursive=1' }}", true);
githubGet('GitHub - README', [4220, -80], "={{ 'https://api.github.com/repos/' + $('Activity Context').item.json.repository + '/readme' }}", true);
add('Build Context & Dedup', 'n8n-nodes-base.code', [4440, -80], { jsCode: contextCode }, { typeVersion: 2 });
boolIf('Needs Manual Review?', [4660, -80], '={{ $json.courseworkUpdated || $json.identityConflict }}');
add('Build Manual Review Alert', 'n8n-nodes-base.code', [4880, -240], {
  jsCode: "const reason=$json.courseworkUpdated?'CourseWork actualizado después de crear Issues':'otra identidad CourseWork ya usa la misma materia/semana'; return [{json:{...$json,executionResult:'coursework_updated',notificationSubject:`⚠️ Revisión manual ${$json.course} W${$json.weekPadded}`,notificationBody:`⚠️ No se modificó GitHub\\n\\nCourseWork: ${$json.courseWorkId}\\nRazón: ${reason}\\nUpdateTime actual: ${$json.updateTime}\\nUpdateTime almacenado: ${$json.newestStoredUpdate || 'n/a'}\\n\\nRevisa cambios antes de reconciliar.`}}];",
}, { typeVersion: 2 });
notificationGate('Notify Manual Review?', [5100, -240]);
add('Gmail - Send Manual Review Alert', 'n8n-nodes-base.gmail', [5320, -280], {
  operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false },
}, { typeVersion: 2.1, credentials: gmailCredentials });
boolIf('Existing Set Complete?', [4880, 20], '={{ $json.completeExisting }}');
add('Build Reconcile Summary', 'n8n-nodes-base.code', [5100, -20], { jsCode: code('reconcile-summary.js') }, { typeVersion: 2 });
notificationGate('Notify Reconcile?', [5320, -20]);
add('Gmail - Send Reconcile Summary', 'n8n-nodes-base.gmail', [5540, -60], {
  operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false },
}, { typeVersion: 2.1, credentials: gmailCredentials });

// Four acyclic attempt branches share the same source modules and transition table.
add('LLM Request', 'n8n-nodes-base.code', [5100, 160], { jsCode: code('prepare-llm-request.js') }, { typeVersion: 2 });
const validationSteps = [
  ['Normalize AI Response', 'normalize-ai.js'],
  ['Parse Structured Plan', 'parse-structured-plan.js'],
  ['Apply Gap Analysis', 'apply-gap-analysis.js'],
  ['Enforce Operational Issues', 'enforce-foundation.js'],
  ['Normalize Titles & Keys & Dependencies', 'normalize-plan.js'],
  ['Build GitHub Issue Bodies', 'build-bodies.js'],
  ['Validate Final Plan', 'validate-plan.js'],
];
function attemptBranch({ suffix, prepare, adapter, http, gemini, y, gate }) {
  add(adapter, 'n8n-nodes-base.code', [5100, y], { jsCode: code('build-llm-payload.js') }, { typeVersion: 2 });
  add(http, 'n8n-nodes-base.httpRequest', [5320, y], {
    method: 'POST',
    url: gemini ? "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $json.llmAttempt.model + ':generateContent' }}" : 'https://openrouter.ai/api/v1/chat/completions',
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.llmPayload }}', options: safeAiResponse,
  }, { typeVersion: 4.3, credentials: gemini ? geminiCredentials : openRouterCredentials, onError: 'continueRegularOutput', retryOnFail: false });
  connect(prepare, adapter);
  connect(adapter, http);
  let previous = http;
  validationSteps.forEach(([baseName, file], index) => {
    const name = baseName + suffix;
    add(name, 'n8n-nodes-base.code', suffix ? [5540 + index * 180, y] : [[5540, 5760, 5980, 6140, 6300, 6460, 6640][index], y], {
      jsCode: code(file).replace('__LLM_REQUEST_NODE__', adapter),
    }, { typeVersion: 2 });
    connect(previous, name);
    previous = name;
  });
  boolIf(gate, [6860, y], "={{ $json.nextState === 'PLAN_VALID' && $json.valid && $json.parseStatus === 'valid' && $json.schemaStatus === 'valid' }}");
  connect(previous, gate);
  connect(gate, 'Plan and Topological Sort', 0);
}
attemptBranch({ suffix: '', prepare: 'LLM Request', adapter: 'Gemini Adapter', http: 'Gemini - Plan', gemini: true, y: 160, gate: 'Plan Valid?' });
boolIf('Gemini Repair Required?', [7080, 300], "={{ $json.nextState === 'GEMINI_REPAIR_REQUEST' }}");
add('Prepare Gemini Repair', 'n8n-nodes-base.code', [4880, 500], { jsCode: code('prepare-gemini-repair.js') }, { typeVersion: 2 });
attemptBranch({ suffix: ' - Repair', prepare: 'Prepare Gemini Repair', adapter: 'Gemini Repair Adapter', http: 'Gemini - Repair Once', gemini: true, y: 500, gate: 'Repair Plan Valid?' });
add('Prepare OpenRouter Fallback', 'n8n-nodes-base.code', [4880, 840], { jsCode: code('prepare-openrouter-fallback.js') }, { typeVersion: 2 });
attemptBranch({ suffix: ' - Qwen', prepare: 'Prepare OpenRouter Fallback', adapter: 'Qwen Adapter', http: 'OpenRouter - Chat Completion', gemini: false, y: 840, gate: 'Qwen Plan Valid?' });
add('Prepare GLM Fallback', 'n8n-nodes-base.code', [4880, 1180], { jsCode: code('prepare-openrouter-fallback.js') }, { typeVersion: 2 });
attemptBranch({ suffix: ' - GLM', prepare: 'Prepare GLM Fallback', adapter: 'GLM Adapter', http: 'OpenRouter - GLM', gemini: false, y: 1180, gate: 'GLM Plan Valid?' });
add('Fail Closed - Invalid Plan', 'n8n-nodes-base.code', [7080, 1320], { jsCode: code('fail-closed.js') }, { typeVersion: 2 });

add('Plan and Topological Sort', 'n8n-nodes-base.code', [7300, 120], { jsCode: code('plan-toposort.js') }, { typeVersion: 2 });
equalsIf('Dry Run?', [7520, 120], '={{ $json.automationMode }}', 'dry-run');
add('Exact Dry-Run Preview', 'n8n-nodes-base.code', [7740, 20], { jsCode: code('dry-run-summary.js') }, { typeVersion: 2 });
boolIf('Missing Labels?', [7740, 200], '={{ $json.missingLabels.length > 0 }}');
add('Prepare Missing Labels', 'n8n-nodes-base.code', [7960, 160], { jsCode: code('prepare-labels.js') }, { typeVersion: 2 });
add('GitHub - Create Missing Label', 'n8n-nodes-base.httpRequest', [8180, 160], {
  method: 'POST', url: "={{ 'https://api.github.com/repos/' + $json.runData.repository + '/labels' }}", authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
  sendHeaders: true, headerParameters: githubHeaders, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.labelPayload }}', options: fullResponse,
}, { typeVersion: 4.3, credentials: githubCredentials });
add('Continue After Labels', 'n8n-nodes-base.code', [8400, 240], { jsCode: code('continue-after-labels.js') }, { typeVersion: 2 });
add('Prepare Issue Queue', 'n8n-nodes-base.code', [8620, 240], { jsCode: code('prepare-issue-queue.js') }, { typeVersion: 2 });
add('Loop Issues Sequentially', 'n8n-nodes-base.splitInBatches', [8840, 240], { batchSize: 1, options: {} }, { typeVersion: 3 });
add('Resolve Dependencies', 'n8n-nodes-base.code', [9060, 340], { jsCode: code('resolve-issue.js') }, { typeVersion: 2 });
githubGet('GitHub - Recheck Issue Key', [9280, 340], "={{ 'https://api.github.com/repos/' + $('Resolve Dependencies').item.json.repository + '/issues?state=all&sort=created&direction=desc&per_page=100' }}");
add('Apply Issue Recheck', 'n8n-nodes-base.code', [9500, 340], { jsCode: code('apply-recheck.js') }, { typeVersion: 2 });
boolIf('Issue Already Exists?', [9720, 340], '={{ $json.skipCreate }}');
add('GitHub - Reconcile Existing Issue', 'n8n-nodes-base.httpRequest', [9940, 260], {
  method: 'PATCH', url: "={{ 'https://api.github.com/repos/' + $json.repository + '/issues/' + $json.issueNumber }}", authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
  sendHeaders: true, headerParameters: githubHeaders, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.issuePayload }}', options: fullResponse,
}, { typeVersion: 4.3, credentials: githubCredentials });
add('Record Existing Issue', 'n8n-nodes-base.code', [10160, 260], { jsCode: code('record-existing.js') }, { typeVersion: 2 });
add('GitHub - Create Issue', 'n8n-nodes-base.httpRequest', [9940, 420], {
  method: 'POST', url: "={{ 'https://api.github.com/repos/' + $json.repository + '/issues' }}", authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
  sendHeaders: true, headerParameters: githubHeaders, sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.issuePayload }}', options: fullResponse,
}, { typeVersion: 4.3, credentials: githubCredentials });
add('Record Created Issue', 'n8n-nodes-base.code', [10160, 420], { jsCode: code('record-created.js') }, { typeVersion: 2 });
githubGet('GitHub - Verify Complete Set', [9060, 80], "={{ 'https://api.github.com/repos/' + $('Activity Context').item.json.repository + '/issues?state=all&sort=created&direction=desc&per_page=100' }}");
add('Verify Complete Set', 'n8n-nodes-base.code', [9280, 80], { jsCode: code('verify-created-set.js') }, { typeVersion: 2 });
add('Build Success Summary', 'n8n-nodes-base.code', [9500, 80], { jsCode: code('success-summary.js') }, { typeVersion: 2 });
notificationGate('Notify Success?', [9720, 80]);
add('Gmail - Send Success Summary', 'n8n-nodes-base.gmail', [9940, 40], {
  operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false },
}, { typeVersion: 2.1, credentials: gmailCredentials });

connect('Schedule PWA Monday 09:10', 'Route PWA');
connect('Schedule DMI Tuesday 09:10', 'Route DMI');
connect('Manual Trigger', 'Manual Request');
connect('Route PWA', 'Prepare Classroom Request');
connect('Route DMI', 'Prepare Classroom Request');
connect('Manual Request', 'Prepare Classroom Request');
connect('Prepare Classroom Request', 'Classroom - List CourseWork Initial');
connect('Classroom - List CourseWork Initial', 'Attach Initial Classroom Response');
connect('Attach Initial Classroom Response', 'Parse Initial CourseWork');
connect('Parse Initial CourseWork', 'CourseWork Found Initial?');
connect('CourseWork Found Initial?', 'Inspect Materials', 0);
connect('CourseWork Found Initial?', 'Wait 30 Minutes Once', 1);
connect('Wait 30 Minutes Once', 'Increment Retry');
connect('Increment Retry', 'Classroom - List CourseWork Retry');
connect('Classroom - List CourseWork Retry', 'Attach Retry Classroom Response');
connect('Attach Retry Classroom Response', 'Parse Retry CourseWork');
connect('Parse Retry CourseWork', 'CourseWork Found Retry?');
connect('CourseWork Found Retry?', 'Inspect Materials', 0);
connect('CourseWork Found Retry?', 'Build No Activity Summary', 1);
connect('Build No Activity Summary', 'Notify No Activity?');
connect('Notify No Activity?', 'Gmail - Send No Activity Alert', 0);
connect('Inspect Materials', 'Starter ZIP Found?');
connect('Starter ZIP Found?', 'Drive - Starter Metadata', 0);
connect('Starter ZIP Found?', 'No Starter Context', 1);
connect('Drive - Starter Metadata', 'Attach Drive Metadata');
connect('Attach Drive Metadata', 'Validate Drive File');
connect('Validate Drive File', 'Drive - Download Starter ZIP');
connect('Drive - Download Starter ZIP', 'Attach Download Context');
connect('Attach Download Context', 'Validate ZIP Security');
connect('Validate ZIP Security', 'Extract Starter ZIP');
connect('Extract Starter ZIP', 'Inspect Starter');
connect('Inspect Starter', 'Activity Context');
connect('No Starter Context', 'Activity Context');
connect('Activity Context', 'GitHub - Repository');
connect('GitHub - Repository', 'GitHub - Recent Issues');
connect('GitHub - Recent Issues', 'GitHub - Search CourseWork ID');
connect('GitHub - Search CourseWork ID', 'GitHub - Search Course Week');
connect('GitHub - Search Course Week', 'GitHub - Open Pull Requests');
connect('GitHub - Open Pull Requests', 'GitHub - Labels');
connect('GitHub - Labels', 'GitHub - Tree');
connect('GitHub - Tree', 'GitHub - README');
connect('GitHub - README', 'Build Context & Dedup');
connect('Build Context & Dedup', 'Needs Manual Review?');
connect('Needs Manual Review?', 'Build Manual Review Alert', 0);
connect('Needs Manual Review?', 'Existing Set Complete?', 1);
connect('Build Manual Review Alert', 'Notify Manual Review?');
connect('Notify Manual Review?', 'Gmail - Send Manual Review Alert', 0);
connect('Existing Set Complete?', 'Build Reconcile Summary', 0);
connect('Existing Set Complete?', 'LLM Request', 1);
connect('Build Reconcile Summary', 'Notify Reconcile?');
connect('Notify Reconcile?', 'Gmail - Send Reconcile Summary', 0);
connect('Plan Valid?', 'Gemini Repair Required?', 1);
connect('Gemini Repair Required?', 'Prepare Gemini Repair', 0);
connect('Gemini Repair Required?', 'Prepare OpenRouter Fallback', 1);
connect('Repair Plan Valid?', 'Prepare OpenRouter Fallback', 1);
connect('Qwen Plan Valid?', 'Prepare GLM Fallback', 1);
connect('GLM Plan Valid?', 'Fail Closed - Invalid Plan', 1);
connect('Plan and Topological Sort', 'Dry Run?');
connect('Dry Run?', 'Exact Dry-Run Preview', 0);
connect('Dry Run?', 'Missing Labels?', 1);
connect('Missing Labels?', 'Prepare Missing Labels', 0);
connect('Missing Labels?', 'Continue After Labels', 1);
connect('Prepare Missing Labels', 'GitHub - Create Missing Label');
connect('GitHub - Create Missing Label', 'Continue After Labels');
connect('Continue After Labels', 'Prepare Issue Queue');
connect('Prepare Issue Queue', 'Loop Issues Sequentially');
connect('Loop Issues Sequentially', 'GitHub - Verify Complete Set', 0);
connect('Loop Issues Sequentially', 'Resolve Dependencies', 1);
connect('Resolve Dependencies', 'GitHub - Recheck Issue Key');
connect('GitHub - Recheck Issue Key', 'Apply Issue Recheck');
connect('Apply Issue Recheck', 'Issue Already Exists?');
connect('Issue Already Exists?', 'GitHub - Reconcile Existing Issue', 0);
connect('Issue Already Exists?', 'GitHub - Create Issue', 1);
connect('GitHub - Reconcile Existing Issue', 'Record Existing Issue');
connect('Record Existing Issue', 'Loop Issues Sequentially');
connect('GitHub - Create Issue', 'Record Created Issue');
connect('Record Created Issue', 'Loop Issues Sequentially');
connect('GitHub - Verify Complete Set', 'Verify Complete Set');
connect('Verify Complete Set', 'Build Success Summary');
connect('Build Success Summary', 'Notify Success?');
connect('Notify Success?', 'Gmail - Send Success Summary', 0);

const workflow = {
  id: 'classroomDmiPwa2026', name: 'Classroom API to GitHub Issues - DMI and PWA', nodes, pinData: {}, connections, active: false,
  settings: {
    executionOrder: 'v1', timezone: 'America/Mexico_City', saveManualExecutions: true,
    saveExecutionProgress: true, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none',
  },
  versionId: '10000000-0000-4000-8000-000000000002', meta: { templateCredsSetupCompleted: false }, tags: [],
};

const errorNodes = [
  { parameters: {}, type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], id: nodeId('Error Trigger', existingErrorNodes), name: 'Error Trigger' },
  { parameters: { jsCode: "const e=$json.execution||{}; const t=$json.trigger||{}; const phase=e.lastNodeExecuted||'desconocida'; const message=e.error?.message||t.error?.message||'Error no especificado'; return [{json:{notificationSubject:'❌ Falló Classroom API → GitHub',notificationBody:`❌ No se pudo completar una ejecución\\n\\nFase: ${phase}\\nError: ${message}\\nEjecución: ${e.url||e.id||'sin URL'}\\n\\nGitHub no se modifica antes de completar todas las validaciones. Revisa la ejecución antes de reintentar.`}}];" }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], id: nodeId('Build Error Summary', existingErrorNodes), name: 'Build Error Summary' },
  { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: conditionId('Notifications Enabled?', existingErrorNodes), leftValue: "={{ String($env.NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true' }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [440, 0], id: nodeId('Notifications Enabled?', existingErrorNodes), name: 'Notifications Enabled?' },
  { parameters: { operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false } }, type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [660, -40], id: nodeId('Gmail - Send Error Summary', existingErrorNodes), name: 'Gmail - Send Error Summary', credentials: gmailCredentials },
];
const errorWorkflow = {
  id: 'classroomError2026', name: 'Classroom to GitHub - Error Handler', nodes: errorNodes, pinData: {}, active: false,
  connections: {
    'Error Trigger': { main: [[{ node: 'Build Error Summary', type: 'main', index: 0 }]] },
    'Build Error Summary': { main: [[{ node: 'Notifications Enabled?', type: 'main', index: 0 }]] },
    'Notifications Enabled?': { main: [[{ node: 'Gmail - Send Error Summary', type: 'main', index: 0 }], []] },
  },
  settings: { executionOrder: 'v1', timezone: 'America/Mexico_City' },
  versionId: existingError.versionId || randomUUID(), meta: { templateCredsSetupCompleted: false }, tags: [],
};

fs.writeFileSync(path.join(root, 'workflows', 'classroom-to-github.json'), `${JSON.stringify(workflow, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'workflows', 'classroom-error-handler.json'), `${JSON.stringify(errorWorkflow, null, 2)}\n`);
