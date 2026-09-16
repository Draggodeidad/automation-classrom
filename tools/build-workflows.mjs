import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const codeFiles = {
  'parse-route.js': 'src/gmail/parse-route.js',
  'build-context.js': 'src/github/build-context.js',
  'normalize-ai.js': 'src/ai/normalize-ai.js',
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
const code = (name) => {
  const relative = codeFiles[name];
  if (!relative) throw new Error(`Código de nodo no registrado: ${name}`);
  return fs.readFileSync(path.join(root, relative), 'utf8').trim();
};
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'issue-plan.schema.json'), 'utf8'));
const contextCode = code('build-context.js').replace('__ISSUE_PLAN_SCHEMA__', JSON.stringify(schema));

let idCounter = 0;
const id = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`;
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

const gmailCredentials = { gmailOAuth2: { name: 'Gmail account' } };
const githubCredentials = { githubApi: { name: 'GitHub account' } };
const geminiCredentials = { httpHeaderAuth: { name: 'Gemini API Key' } };
const githubHeaders = {
  parameters: [
    { name: 'Accept', value: 'application/vnd.github+json' },
    { name: 'X-GitHub-Api-Version', value: '2026-03-10' },
  ],
};
const fullResponse = { response: { response: { fullResponse: true, neverError: false } } };
const safeFullResponse = { response: { response: { fullResponse: true, neverError: true } } };

function githubGet(name, position, url, safe = false) {
  return add(name, 'n8n-nodes-base.httpRequest', position, {
    url,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'githubApi',
    sendHeaders: true,
    headerParameters: githubHeaders,
    options: safe ? safeFullResponse : fullResponse,
  }, { typeVersion: 4.3, credentials: githubCredentials });
}

function boolIf(name, position, leftValue) {
  return add(name, 'n8n-nodes-base.if', position, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: id(), leftValue, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    options: {},
  }, { typeVersion: 2.2 });
}

function equalsIf(name, position, leftValue, rightValue) {
  return add(name, 'n8n-nodes-base.if', position, {
    conditions: {
      options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id: id(), leftValue, rightValue, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and',
    },
    options: {},
  }, { typeVersion: 2.2 });
}

add('Schedule Monday-Wednesday', 'n8n-nodes-base.scheduleTrigger', [-2200, 0], {
  rule: { interval: [{ field: 'cronExpression', expression: '0 7-20 * * 1-3' }] },
}, { typeVersion: 1.2 });
add('Manual Dry Run', 'n8n-nodes-base.manualTrigger', [-2200, 180], {}, { typeVersion: 1 });
add('Gmail - Search Candidates', 'n8n-nodes-base.gmail', [-1980, 80], {
  operation: 'getAll',
  returnAll: false,
  limit: 20,
  simple: false,
  filters: {
    q: 'from:no-reply@classroom.google.com newer_than:21d -label:Automation/Classroom/Processed',
    readStatus: 'both',
  },
}, { typeVersion: 2.1, credentials: gmailCredentials });
add('Parse and Route', 'n8n-nodes-base.code', [-1760, 80], { jsCode: code('parse-route.js') }, { typeVersion: 2 });
add('Loop Messages Sequentially', 'n8n-nodes-base.splitInBatches', [-1650, 220], { batchSize: 1, options: {} }, { typeVersion: 3 });

githubGet('GitHub - Repository', [-1540, 80], "={{ 'https://api.github.com/repos/' + $('Parse and Route').item.json.repository }}");
githubGet('GitHub - Recent Issues', [-1320, 80], "={{ 'https://api.github.com/repos/' + $('Parse and Route').item.json.repository + '/issues?state=all&sort=created&direction=desc&per_page=100' }}");
githubGet('GitHub - Search Message ID', [-1100, 80], "={{ 'https://api.github.com/search/issues?q=' + encodeURIComponent('repo:' + $('Parse and Route').item.json.repository + ' is:issue in:body \"classroom-message-id:' + $('Parse and Route').item.json.gmailMessageId + '\"') + '&per_page=100' }}");
githubGet('GitHub - Search Course Week', [-880, 80], "={{ 'https://api.github.com/search/issues?q=' + encodeURIComponent('repo:' + $('Parse and Route').item.json.repository + ' is:issue in:body \"course:' + $('Parse and Route').item.json.course + '\" \"week:' + $('Parse and Route').item.json.weekPadded + '\"') + '&per_page=100' }}");
githubGet('GitHub - Open Pull Requests', [-660, 80], "={{ 'https://api.github.com/repos/' + $('Parse and Route').item.json.repository + '/pulls?state=open&per_page=30' }}");
githubGet('GitHub - Labels', [-440, 80], "={{ 'https://api.github.com/repos/' + $('Parse and Route').item.json.repository + '/labels?per_page=100' }}");
githubGet('GitHub - Tree', [-220, 80], "={{ 'https://api.github.com/repos/' + $('Parse and Route').item.json.repository + '/git/trees/' + encodeURIComponent($('GitHub - Repository').item.json.body.default_branch) + '?recursive=1' }}", true);
githubGet('GitHub - README', [0, 80], "={{ 'https://api.github.com/repos/' + $('Parse and Route').item.json.repository + '/readme' }}", true);
add('Build Context & Dedup', 'n8n-nodes-base.code', [220, 80], { jsCode: contextCode }, { typeVersion: 2 });
boolIf('Existing Set Complete?', [440, 80], '={{ $json.completeExisting }}');
equalsIf('Existing Reconcile Live?', [660, -140], '={{ $json.automationMode }}', 'live');
add('Existing Dry-Run Summary', 'n8n-nodes-base.code', [880, -40], {
  jsCode: "return [{ json: { mode: 'dry-run', mutationsPerformed: false, duplicateDetected: true, course: $json.course, week: $json.week, repository: $json.repository, existingIssues: $json.existingAutomationIssues, note: 'El conjunto ya existe; no se modificó GitHub ni Gmail.' } }];",
}, { typeVersion: 2 });
add('Gmail - Mark Existing Processed', 'n8n-nodes-base.gmail', [880, -240], {
  operation: 'addLabels', messageId: "={{ $('Parse and Route').item.json.gmailMessageId }}", labelNames: ['Automation/Classroom/Processed'],
}, { typeVersion: 2.1, credentials: gmailCredentials });
add('Build Reconcile Summary', 'n8n-nodes-base.code', [1100, -240], { jsCode: code('reconcile-summary.js') }, { typeVersion: 2 });
add('Gmail - Send Reconcile Summary', 'n8n-nodes-base.gmail', [1320, -240], {
  operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false },
}, { typeVersion: 2.1, credentials: gmailCredentials });

equalsIf('AI Provider Gemini?', [660, 180], '={{ $json.aiProvider }}', 'gemini');
add('Gemini - Plan', 'n8n-nodes-base.httpRequest', [880, 100], {
  method: 'POST',
  url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + ($env.GEMINI_MODEL || 'gemini-2.5-flash') + ':generateContent' }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
  sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ systemInstruction: { parts: [{ text: $json.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: $json.userPrompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseJsonSchema: $json.geminiSchema } }) }}",
  options: fullResponse,
}, { typeVersion: 4.3, credentials: geminiCredentials });
add('Ollama - Plan', 'n8n-nodes-base.httpRequest', [880, 280], {
  method: 'POST', url: "={{ ($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434') + '/api/chat' }}",
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
  sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ model: ($env.OLLAMA_MODEL || 'qwen2.5-coder:7b'), messages: [{ role: 'system', content: $json.systemPrompt }, { role: 'user', content: $json.userPrompt }], stream: false, format: $json.schema, options: { temperature: 0.1 } }) }}",
  options: fullResponse,
}, { typeVersion: 4.3 });
add('Normalize AI Response', 'n8n-nodes-base.code', [1100, 180], { jsCode: code('normalize-ai.js') }, { typeVersion: 2 });
add('Validate Plan', 'n8n-nodes-base.code', [1320, 180], { jsCode: code('validate-plan.js') }, { typeVersion: 2 });
boolIf('Plan Valid?', [1540, 180], '={{ $json.valid }}');
equalsIf('Retry with Gemini?', [1760, 340], '={{ $json.aiProvider }}', 'gemini');
add('Gemini - Repair Once', 'n8n-nodes-base.httpRequest', [1980, 280], {
  method: 'POST',
  url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + ($env.GEMINI_MODEL || 'gemini-2.5-flash') + ':generateContent' }}",
  authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
  sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ systemInstruction: { parts: [{ text: $json.systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: $json.retryPrompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json', responseJsonSchema: $json.geminiSchema } }) }}",
  options: fullResponse,
}, { typeVersion: 4.3, credentials: geminiCredentials });
add('Ollama - Repair Once', 'n8n-nodes-base.httpRequest', [1980, 420], {
  method: 'POST', url: "={{ ($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434') + '/api/chat' }}",
  sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
  sendBody: true, specifyBody: 'json',
  jsonBody: "={{ ({ model: ($env.OLLAMA_MODEL || 'qwen2.5-coder:7b'), messages: [{ role: 'system', content: $json.systemPrompt }, { role: 'user', content: $json.retryPrompt }], stream: false, format: $json.schema, options: { temperature: 0 } }) }}",
  options: fullResponse,
}, { typeVersion: 4.3 });
add('Normalize Repair Response', 'n8n-nodes-base.code', [2200, 340], { jsCode: code('normalize-ai.js') }, { typeVersion: 2 });
add('Validate Repaired Plan', 'n8n-nodes-base.code', [2420, 340], { jsCode: code('validate-plan.js') }, { typeVersion: 2 });
boolIf('Repaired Plan Valid?', [2640, 340], '={{ $json.valid }}');
add('Fail Closed - Invalid Plan', 'n8n-nodes-base.code', [2860, 460], {
  jsCode: "throw new Error('LLM devolvió JSON inválido después de un reintento: ' + ($json.validationErrors || []).join('; ') + '. GitHub y Gmail no fueron modificados.');",
}, { typeVersion: 2 });

add('Plan and Topological Sort', 'n8n-nodes-base.code', [2860, 120], { jsCode: code('plan-toposort.js') }, { typeVersion: 2 });
equalsIf('Dry Run?', [3080, 120], '={{ $json.automationMode }}', 'dry-run');
add('Exact Dry-Run Preview', 'n8n-nodes-base.code', [3300, 20], { jsCode: code('dry-run-summary.js') }, { typeVersion: 2 });
boolIf('Missing Labels?', [3300, 200], '={{ $json.missingLabels.length > 0 }}');
add('Prepare Missing Labels', 'n8n-nodes-base.code', [3520, 160], { jsCode: code('prepare-labels.js') }, { typeVersion: 2 });
add('GitHub - Create Missing Label', 'n8n-nodes-base.httpRequest', [3740, 160], {
  method: 'POST', url: "={{ 'https://api.github.com/repos/' + $json.runData.repository + '/labels' }}",
  authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
  sendHeaders: true, headerParameters: githubHeaders,
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.labelPayload }}', options: fullResponse,
}, { typeVersion: 4.3, credentials: githubCredentials });
add('Continue After Labels', 'n8n-nodes-base.code', [3960, 240], { jsCode: code('continue-after-labels.js') }, { typeVersion: 2 });
add('Prepare Issue Queue', 'n8n-nodes-base.code', [4180, 240], { jsCode: code('prepare-issue-queue.js') }, { typeVersion: 2 });
add('Loop Issues Sequentially', 'n8n-nodes-base.splitInBatches', [4400, 240], { batchSize: 1, options: {} }, { typeVersion: 3 });
add('Resolve Dependencies', 'n8n-nodes-base.code', [4620, 340], { jsCode: code('resolve-issue.js') }, { typeVersion: 2 });
githubGet('GitHub - Recheck Issue Key', [4840, 340], "={{ 'https://api.github.com/repos/' + $('Resolve Dependencies').item.json.repository + '/issues?state=all&sort=created&direction=desc&per_page=100' }}");
add('Apply Issue Recheck', 'n8n-nodes-base.code', [5060, 340], { jsCode: code('apply-recheck.js') }, { typeVersion: 2 });
boolIf('Issue Already Exists?', [5280, 340], '={{ $json.skipCreate }}');
add('GitHub - Reconcile Existing Issue', 'n8n-nodes-base.httpRequest', [5500, 260], {
  method: 'PATCH', url: "={{ 'https://api.github.com/repos/' + $json.repository + '/issues/' + $json.issueNumber }}",
  authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
  sendHeaders: true, headerParameters: githubHeaders,
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.issuePayload }}', options: fullResponse,
}, { typeVersion: 4.3, credentials: githubCredentials });
add('Record Existing Issue', 'n8n-nodes-base.code', [5720, 260], { jsCode: code('record-existing.js') }, { typeVersion: 2 });
add('GitHub - Create Issue', 'n8n-nodes-base.httpRequest', [5500, 420], {
  method: 'POST', url: "={{ 'https://api.github.com/repos/' + $json.repository + '/issues' }}",
  authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
  sendHeaders: true, headerParameters: githubHeaders,
  sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.issuePayload }}', options: fullResponse,
}, { typeVersion: 4.3, credentials: githubCredentials });
add('Record Created Issue', 'n8n-nodes-base.code', [5720, 420], { jsCode: code('record-created.js') }, { typeVersion: 2 });
githubGet('GitHub - Verify Complete Set', [4620, 80], "={{ 'https://api.github.com/repos/' + $('Parse and Route').item.json.repository + '/issues?state=all&sort=created&direction=desc&per_page=100' }}");
add('Verify Complete Set', 'n8n-nodes-base.code', [4840, 80], { jsCode: code('verify-created-set.js') }, { typeVersion: 2 });
add('Gmail - Mark Processed', 'n8n-nodes-base.gmail', [5060, 80], {
  operation: 'addLabels', messageId: "={{ $('Parse and Route').item.json.gmailMessageId }}", labelNames: ['Automation/Classroom/Processed'],
}, { typeVersion: 2.1, credentials: gmailCredentials });
add('Build Success Summary', 'n8n-nodes-base.code', [5280, 80], { jsCode: code('success-summary.js') }, { typeVersion: 2 });
add('Gmail - Send Success Summary', 'n8n-nodes-base.gmail', [5500, 80], {
  operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false },
}, { typeVersion: 2.1, credentials: gmailCredentials });

connect('Schedule Monday-Wednesday', 'Gmail - Search Candidates');
connect('Manual Dry Run', 'Gmail - Search Candidates');
connect('Gmail - Search Candidates', 'Parse and Route');
connect('Parse and Route', 'Loop Messages Sequentially');
connect('Loop Messages Sequentially', 'GitHub - Repository', 1);
connect('GitHub - Repository', 'GitHub - Recent Issues');
connect('GitHub - Recent Issues', 'GitHub - Search Message ID');
connect('GitHub - Search Message ID', 'GitHub - Search Course Week');
connect('GitHub - Search Course Week', 'GitHub - Open Pull Requests');
connect('GitHub - Open Pull Requests', 'GitHub - Labels');
connect('GitHub - Labels', 'GitHub - Tree');
connect('GitHub - Tree', 'GitHub - README');
connect('GitHub - README', 'Build Context & Dedup');
connect('Build Context & Dedup', 'Existing Set Complete?');
connect('Existing Set Complete?', 'Existing Reconcile Live?', 0);
connect('Existing Set Complete?', 'AI Provider Gemini?', 1);
connect('Existing Reconcile Live?', 'Gmail - Mark Existing Processed', 0);
connect('Existing Reconcile Live?', 'Existing Dry-Run Summary', 1);
connect('Gmail - Mark Existing Processed', 'Build Reconcile Summary');
connect('Build Reconcile Summary', 'Gmail - Send Reconcile Summary');
connect('Gmail - Send Reconcile Summary', 'Loop Messages Sequentially');
connect('Existing Dry-Run Summary', 'Loop Messages Sequentially');
connect('AI Provider Gemini?', 'Gemini - Plan', 0);
connect('AI Provider Gemini?', 'Ollama - Plan', 1);
connect('Gemini - Plan', 'Normalize AI Response');
connect('Ollama - Plan', 'Normalize AI Response');
connect('Normalize AI Response', 'Validate Plan');
connect('Validate Plan', 'Plan Valid?');
connect('Plan Valid?', 'Plan and Topological Sort', 0);
connect('Plan Valid?', 'Retry with Gemini?', 1);
connect('Retry with Gemini?', 'Gemini - Repair Once', 0);
connect('Retry with Gemini?', 'Ollama - Repair Once', 1);
connect('Gemini - Repair Once', 'Normalize Repair Response');
connect('Ollama - Repair Once', 'Normalize Repair Response');
connect('Normalize Repair Response', 'Validate Repaired Plan');
connect('Validate Repaired Plan', 'Repaired Plan Valid?');
connect('Repaired Plan Valid?', 'Plan and Topological Sort', 0);
connect('Repaired Plan Valid?', 'Fail Closed - Invalid Plan', 1);
connect('Plan and Topological Sort', 'Dry Run?');
connect('Dry Run?', 'Exact Dry-Run Preview', 0);
connect('Dry Run?', 'Missing Labels?', 1);
connect('Exact Dry-Run Preview', 'Loop Messages Sequentially');
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
connect('Verify Complete Set', 'Gmail - Mark Processed');
connect('Gmail - Mark Processed', 'Build Success Summary');
connect('Build Success Summary', 'Gmail - Send Success Summary');
connect('Gmail - Send Success Summary', 'Loop Messages Sequentially');

const workflow = {
  id: 'classroomDmiPwa2026',
  name: 'Classroom to GitHub Issues - DMI and PWA',
  nodes,
  pinData: {},
  connections,
  active: false,
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Mexico_City',
    saveManualExecutions: true,
    saveExecutionProgress: true,
    saveDataErrorExecution: 'all',
    saveDataSuccessExecution: 'all',
  },
  versionId: '10000000-0000-4000-8000-000000000001',
  meta: { templateCredsSetupCompleted: false },
  tags: [],
};

const errorNodes = [
  {
    parameters: {}, type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0],
    id: '20000000-0000-4000-8000-000000000001', name: 'Error Trigger',
  },
  {
    parameters: {
      jsCode: "const e = $json.execution || {}; const t = $json.trigger || {}; const phase = e.lastNodeExecuted || 'desconocida'; const message = e.error?.message || t.error?.message || 'Error no especificado'; return [{json:{notificationSubject:'❌ Falló Classroom → GitHub',notificationBody:`❌ No se pudo completar una ejecución\\n\\nFase: ${phase}\\nProblema: ${message}\\nEjecución: ${e.url || e.id || 'sin URL'}\\n\\nGmail sólo se marca después de verificar todas las Issues. Si la fase fue el envío del resumen final, el correo puede ya estar marcado; revisa la ejecución antes de reintentar.`}}];",
    },
    type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0],
    id: '20000000-0000-4000-8000-000000000002', name: 'Build Error Summary',
  },
  {
    parameters: {
      operation: 'send', sendTo: '={{ $env.NOTIFICATION_EMAIL }}', subject: '={{ $json.notificationSubject }}', message: '={{ $json.notificationBody }}', options: { appendAttribution: false },
    },
    type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [440, 0],
    id: '20000000-0000-4000-8000-000000000003', name: 'Gmail - Send Error Summary', credentials: gmailCredentials,
  },
];
const errorWorkflow = {
  id: 'classroomError2026',
  name: 'Classroom to GitHub - Error Handler', nodes: errorNodes, pinData: {}, active: false,
  connections: {
    'Error Trigger': { main: [[{ node: 'Build Error Summary', type: 'main', index: 0 }]] },
    'Build Error Summary': { main: [[{ node: 'Gmail - Send Error Summary', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'America/Mexico_City' },
  versionId: '20000000-0000-4000-8000-000000000004', meta: { templateCredsSetupCompleted: false }, tags: [],
};

fs.writeFileSync(path.join(root, 'workflows', 'classroom-to-github.json'), `${JSON.stringify(workflow, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'workflows', 'classroom-error-handler.json'), `${JSON.stringify(errorWorkflow, null, 2)}\n`);
