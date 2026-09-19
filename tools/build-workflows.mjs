import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const codeFiles = {
  'prepare-request.js': 'src/classroom/prepare-request.js',
  'parse-coursework.js': 'src/classroom/parse-coursework.js',
  'inspect-materials.js': 'src/classroom/inspect-materials.js',
  'validate-file.js': 'src/drive/validate-file.js',
  'validate-zip.js': 'src/drive/validate-zip.js',
  'inspect-starter.js': 'src/drive/inspect-starter.js',
  'no-starter.js': 'src/drive/no-starter.js',
  'build-context.js': 'src/github/build-context.js',
  'normalize-ai.js': 'src/ai/normalize-ai.js',
  'parse-structured-plan.js': 'src/ai/parse-structured-plan.js',
  'enforce-foundation.js': 'src/ai/enforce-foundation.js',
  'normalize-plan.js': 'src/ai/normalize-plan.js',
  'build-bodies.js': 'src/ai/build-bodies.js',
  'validate-plan.js': 'src/ai/validate-plan.js',
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

let idCounter = 0;
const id = () => randomUUID();
const nodes = [];
const connections = {};
function add(name, type, position, parameters = {}, extra = {}) {
  const node = { parameters, type, typeVersion: extra.typeVersion ?? 2, position, id: id(), name };
  if (extra.credentials) node.credentials = extra.credentials;
  if (extra.onError) node.onError = extra.onError;
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
const githubHeaders = { parameters: [
  { name: 'Accept', value: 'application/vnd.github+json' },
  { name: 'X-GitHub-Api-Version', value: '2026-03-10' },
] };
const fullResponse = { response: { response: { fullResponse: true, neverError: false } } };
const safeFullResponse = { response: { response: { fullResponse: true, neverError: true } } };
function githubGet(name, position, url, safe = false) {
  add(name, 'n8n-nodes-base.httpRequest', position, {
    url, authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
    sendHeaders: true, headerParameters: githubHeaders, options: safe ? safeFullResponse : fullResponse,
  }, { typeVersion: 4.3, credentials: githubCredentials });
}
function boolIf(name, position, leftValue) {
  add(name, 'n8n-nodes-base.if', position, {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: id(), leftValue, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
  }, { typeVersion: 2.2 });
}
function equalsIf(name, position, leftValue, rightValue) {
  add(name, 'n8n-nodes-base.if', position, {
    conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: id(), leftValue, rightValue, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {},
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

equalsIf('AI Provider Gemini?', [5100, 160], '={{ $json.aiProvider }}', 'gemini');
add('Gemini - Plan', 'n8n-nodes-base.httpRequest', [5320, 100], {
  method: 'POST', url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + ($env.GEMINI_MODEL || 'gemini-2.5-flash') + ':generateContent' }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true,
  headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ systemInstruction: { parts: [{ text: $json.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: $json.userPrompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseJsonSchema: $json.geminiSchema } }) }}", options: fullResponse,
}, { typeVersion: 4.3, credentials: geminiCredentials });
add('Ollama - Plan', 'n8n-nodes-base.httpRequest', [5320, 240], {
  method: 'POST', url: "={{ ($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434') + '/api/chat' }}", sendHeaders: true,
  headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ model: ($env.OLLAMA_MODEL || 'qwen2.5-coder:7b'), messages: [{ role: 'system', content: $json.systemPrompt }, { role: 'user', content: $json.userPrompt }], stream: false, think: false, format: $json.schema, options: { temperature: 0.1, num_ctx: 8192, num_predict: 5000 } }) }}", options: fullResponse,
}, { typeVersion: 4.3 });
add('Normalize AI Response', 'n8n-nodes-base.code', [5540, 160], { jsCode: code('normalize-ai.js') }, { typeVersion: 2 });
add('Parse Structured Plan', 'n8n-nodes-base.code', [5760, 160], { jsCode: code('parse-structured-plan.js') }, { typeVersion: 2 });
add('Enforce Foundation', 'n8n-nodes-base.code', [5980, 160], { jsCode: code('enforce-foundation.js') }, { typeVersion: 2 });
add('Normalize Titles & Keys & Dependencies', 'n8n-nodes-base.code', [6200, 160], { jsCode: code('normalize-plan.js') }, { typeVersion: 2 });
add('Build GitHub Issue Bodies', 'n8n-nodes-base.code', [6420, 160], { jsCode: code('build-bodies.js') }, { typeVersion: 2 });
add('Validate Final Plan', 'n8n-nodes-base.code', [6640, 160], { jsCode: code('validate-plan.js') }, { typeVersion: 2 });
boolIf('Plan Valid?', [6860, 160], '={{ $json.valid }}');
add('LLM Retry Attempt Left?', 'n8n-nodes-base.if', [7080, 300], {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: id(), leftValue: "={{ Number($json.llmAttempt || 0) < 2 && Boolean($json.retryable) }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
}, { typeVersion: 2.2 });
equalsIf('Retry with Gemini?', [7300, 300], '={{ $json.aiProvider }}', 'gemini');
add('Gemini - Repair Once', 'n8n-nodes-base.httpRequest', [7520, 240], {
  method: 'POST', url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + ($env.GEMINI_MODEL || 'gemini-2.5-flash') + ':generateContent' }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendHeaders: true,
  headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ systemInstruction: { parts: [{ text: $json.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: $json.retryPrompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: $json.geminiSchema } }) }}", options: fullResponse,
}, { typeVersion: 4.3, credentials: geminiCredentials });
add('Ollama - Repair Once', 'n8n-nodes-base.httpRequest', [7520, 380], {
  method: 'POST', url: "={{ ($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434') + '/api/chat' }}", sendHeaders: true,
  headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] }, sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ model: ($env.OLLAMA_MODEL || 'qwen2.5-coder:7b'), messages: [{ role: 'system', content: $json.systemPrompt }, { role: 'user', content: $json.retryPrompt }], stream: false, think: false, format: $json.schema, options: { temperature: 0, num_ctx: 8192, num_predict: 5000 } }) }}", options: fullResponse,
}, { typeVersion: 4.3 });
add('Normalize Repair Response', 'n8n-nodes-base.code', [7740, 300], { jsCode: code('normalize-ai.js') }, { typeVersion: 2 });
add('Fail Closed - Invalid Plan', 'n8n-nodes-base.code', [7960, 440], {
  jsCode: "const errors = ($json.validationErrors || []).map((e) => '[' + (e.code || 'ERROR') + '] ' + (e.message || e)).join('; '); throw new Error('Plan inválido tras reintento: ' + (errors || 'sin errores') + '. GitHub no fue modificado.');",
}, { typeVersion: 2 });

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
connect('Existing Set Complete?', 'AI Provider Gemini?', 1);
connect('Build Reconcile Summary', 'Notify Reconcile?');
connect('Notify Reconcile?', 'Gmail - Send Reconcile Summary', 0);
connect('AI Provider Gemini?', 'Gemini - Plan', 0);
connect('AI Provider Gemini?', 'Ollama - Plan', 1);
connect('Gemini - Plan', 'Normalize AI Response');
connect('Ollama - Plan', 'Normalize AI Response');
connect('Normalize AI Response', 'Parse Structured Plan');
connect('Normalize Repair Response', 'Parse Structured Plan');
connect('Parse Structured Plan', 'Enforce Foundation');
connect('Enforce Foundation', 'Normalize Titles & Keys & Dependencies');
connect('Normalize Titles & Keys & Dependencies', 'Build GitHub Issue Bodies');
connect('Build GitHub Issue Bodies', 'Validate Final Plan');
connect('Validate Final Plan', 'Plan Valid?');
connect('Plan Valid?', 'Plan and Topological Sort', 0);
connect('Plan Valid?', 'LLM Retry Attempt Left?', 1);
connect('LLM Retry Attempt Left?', 'Retry with Gemini?', 0);
connect('LLM Retry Attempt Left?', 'Fail Closed - Invalid Plan', 1);
connect('Retry with Gemini?', 'Gemini - Repair Once', 0);
connect('Retry with Gemini?', 'Ollama - Repair Once', 1);
connect('Gemini - Repair Once', 'Normalize Repair Response');
connect('Ollama - Repair Once', 'Normalize Repair Response');
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
  { parameters: {}, type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], id: id(), name: 'Error Trigger' },
  { parameters: { jsCode: "const e=$json.execution||{}; const t=$json.trigger||{}; const phase=e.lastNodeExecuted||'desconocida'; const message=e.error?.message||t.error?.message||'Error no especificado'; return [{json:{notificationSubject:'❌ Falló Classroom API → GitHub',notificationBody:`❌ No se pudo completar una ejecución\\n\\nFase: ${phase}\\nError: ${message}\\nEjecución: ${e.url||e.id||'sin URL'}\\n\\nGitHub no se modifica antes de completar todas las validaciones. Revisa la ejecución antes de reintentar.`}}];" }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], id: id(), name: 'Build Error Summary' },
  { parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: id(), leftValue: "={{ String($env.NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true' }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [440, 0], id: id(), name: 'Notifications Enabled?' },
  { parameters: { operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false } }, type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [660, -40], id: id(), name: 'Gmail - Send Error Summary', credentials: gmailCredentials },
];
const errorWorkflow = {
  id: 'classroomError2026', name: 'Classroom to GitHub - Error Handler', nodes: errorNodes, pinData: {}, active: false,
  connections: {
    'Error Trigger': { main: [[{ node: 'Build Error Summary', type: 'main', index: 0 }]] },
    'Build Error Summary': { main: [[{ node: 'Notifications Enabled?', type: 'main', index: 0 }]] },
    'Notifications Enabled?': { main: [[{ node: 'Gmail - Send Error Summary', type: 'main', index: 0 }], []] },
  },
  settings: { executionOrder: 'v1', timezone: 'America/Mexico_City' },
  versionId: id(), meta: { templateCredsSetupCompleted: false }, tags: [],
};

fs.writeFileSync(path.join(root, 'workflows', 'classroom-to-github.json'), `${JSON.stringify(workflow, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'workflows', 'classroom-error-handler.json'), `${JSON.stringify(errorWorkflow, null, 2)}\n`);
