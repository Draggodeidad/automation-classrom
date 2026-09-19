import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const workflow = readJson('workflows/classroom-to-github.json');
const errorWorkflow = readJson('workflows/classroom-error-handler.json');
const schema = readJson('schemas/issue-plan.schema.json');
const fixtures = readJson('tests/fixtures/coursework.json');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runCode(relative, { json = {}, env = {}, binary = {}, buffers = {}, nodes = {}, runIndex } = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replace('__ISSUE_PLAN_SCHEMA__', JSON.stringify(schema));
  const fn = new AsyncFunction('$json', '$env', '$input', '$binary', '$', '$getWorkflowStaticData', 'Buffer', 'structuredClone', '$runIndex', source);
  const input = { first: () => ({ json, binary }), all: () => [{ json, binary }] };
  const getNode = (name) => ({ item: { json: nodes[name] || {} } });
  const staticData = {};
  const context = { helpers: { getBinaryDataBuffer: async (_index, field) => buffers[field] } };
  return fn.call(context, json, env, input, binary, getNode, () => staticData, Buffer, structuredClone, runIndex);
}

assert.equal(workflow.name, 'Classroom API to GitHub Issues - DMI and PWA');
assert.equal(workflow.active, false);
assert.equal(errorWorkflow.nodes[0].type, 'n8n-nodes-base.errorTrigger');
assert.equal(schema.type, 'object');
assert.ok(schema.required.includes('issues'));
assert.deepEqual(schema.properties.issues.items.required, ['key', 'title', 'assignee', 'type', 'priority', 'dependsOn', 'sections']);
assert.deepEqual(schema.properties.issues.items.properties.sections.required, [
  'historiaUsuario', 'contexto', 'objetivoTecnico', 'alcance', 'fueraDeAlcance',
  'archivosEsperados', 'pasosSugeridos', 'criteriosAceptacion', 'pruebas',
  'dependencias', 'evidenciaIndividual', 'definitionOfDone',
]);
assert.equal(schema.properties.issues.minItems, 3);
assert.equal(schema.properties.issues.maxItems, 6);
assert.equal(schema.properties.issues.items.additionalProperties, false);

const names = workflow.nodes.map((node) => node.name);
const nodeNames = new Set(names);
for (const required of [
  'Schedule PWA Monday 09:10', 'Schedule DMI Tuesday 09:10', 'Manual Trigger', 'Manual Request',
  'Classroom - List CourseWork Initial', 'Wait 30 Minutes Once', 'Classroom - List CourseWork Retry',
  'Inspect Materials', 'Drive - Starter Metadata', 'Drive - Download Starter ZIP',
  'Validate ZIP Security', 'Extract Starter ZIP', 'Inspect Starter', 'GitHub - Search CourseWork ID',
  'Needs Manual Review?', 'Parse Structured Plan', 'Enforce Foundation',
  'Normalize Titles & Keys & Dependencies', 'Build GitHub Issue Bodies', 'Validate Final Plan',
  'LLM Retry Attempt Left?', 'Plan and Topological Sort', 'Exact Dry-Run Preview',
  'Loop Issues Sequentially', 'Verify Complete Set',
]) assert.ok(nodeNames.has(required), `Falta nodo ${required}`);
for (const removed of ['Validate Plan', 'Validate Repaired Plan', 'Repaired Plan Valid?']) {
  assert.equal(nodeNames.has(removed), false, `Nodo obsoleto presente: ${removed}`);
}

const scheduleNodes = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.scheduleTrigger');
assert.equal(scheduleNodes.length, 2);
assert.equal(scheduleNodes.find((node) => node.name.includes('PWA')).parameters.rule.interval[0].expression, '10 9 * * 1');
assert.equal(scheduleNodes.find((node) => node.name.includes('DMI')).parameters.rule.interval[0].expression, '10 9 * * 2');
assert.equal(workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.wait').length, 1);
assert.equal(workflow.nodes.filter((node) => node.name.startsWith('Classroom - List CourseWork')).length, 2);
assert.equal(workflow.nodes.find((node) => node.name === 'Wait 30 Minutes Once').parameters.amount, 30);
assert.equal(workflow.settings.timezone, 'America/Mexico_City');
assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
assert.ok(workflow.nodes.find((node) => node.name === 'Route PWA').parameters.jsCode.includes("course: 'PWA'"));
assert.ok(workflow.nodes.find((node) => node.name === 'Route DMI').parameters.jsCode.includes("course: 'DMI'"));

const serialized = JSON.stringify(workflow);
for (const forbidden of ['ghp_', 'github_pat_', 'AIzaSy', 'sk-ant-', 'sk-proj-', 'Automation/Classroom/Processed', 'classroom-message-id:', 'Gmail - Search Candidates']) {
  assert.equal(serialized.includes(forbidden), false, `Contenido obsoleto o secreto: ${forbidden}`);
}
for (const required of ['classroom-course-id:', 'classroom-coursework-id:', 'classroom-update-time:', 'plan-keys:', 'alt=media', 'capabilities(canDownload)']) {
  assert.ok(serialized.includes(required), `Falta ${required}`);
}

const collectJsFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return collectJsFiles(full);
  return entry.name.endsWith('.js') ? [full] : [];
});
for (const file of collectJsFiles(path.join(root, 'src'))) {
  const source = fs.readFileSync(file, 'utf8').replace('__ISSUE_PLAN_SCHEMA__', '{}');
  new AsyncFunction('$json', '$env', '$input', '$binary', '$', '$getWorkflowStaticData', 'Buffer', 'structuredClone', source);
}

for (const fixture of fixtures) {
  const [result] = await runCode('src/classroom/parse-coursework.js', {
    json: {
      course: 'PWA', courseId: 'course-pwa', repository: 'Draggodeidad/pwa-utt', requestedWeek: 3,
      attempt: 1, classroomResponse: { body: { courseWork: [fixture.courseWork] } },
    },
  });
  assert.equal(result.json.found, fixture.expected === 'process', fixture.case);
  if (result.json.found) assert.equal(result.json.weekPadded, '03');
}

const baseActivity = { course: 'PWA', week: 3, weekPadded: '03', materials: [] };
let [materialsResult] = await runCode('src/classroom/inspect-materials.js', { json: baseActivity });
assert.equal(materialsResult.json.starterFound, false, 'CourseWork sin ZIP debe continuar');
const zipMaterial = (id, title) => ({ driveFile: { driveFile: { id, title } } });
[materialsResult] = await runCode('src/classroom/inspect-materials.js', {
  json: { ...baseActivity, materials: [zipMaterial('zip-1', 'PWA-w03-kit-estudiante.zip'), zipMaterial('pdf-1', 'rubrica.pdf')] },
});
assert.equal(materialsResult.json.starterDriveFileId, 'zip-1');
await assert.rejects(() => runCode('src/classroom/inspect-materials.js', {
  json: { ...baseActivity, materials: [zipMaterial('zip-1', 'starter-a.zip'), zipMaterial('zip-2', 'starter-b.zip')] },
}), /múltiples ZIP ambiguos/);

await assert.rejects(() => runCode('src/drive/validate-file.js', {
  json: { starterName: 'starter.zip', driveMetadata: { body: { id: 'x', name: 'starter.zip', size: '100', capabilities: { canDownload: false } } } },
  env: { MAX_ZIP_SIZE_MB: '25' },
}), /no permite descargar/);

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.flags || 0, 8);
    central.writeUInt32LE(entry.compressedSize ?? 10, 20);
    central.writeUInt32LE(entry.uncompressedSize ?? 10, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.externalAttributes || 0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, value) => sum + value.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}
const zipEnv = { MAX_ZIP_SIZE_MB: '25', MAX_EXTRACTED_SIZE_MB: '100', MAX_ZIP_FILES: '500', MAX_SINGLE_FILE_MB: '10' };
const validZip = makeZip([{ name: 'README.md', compressedSize: 10, uncompressedSize: 100 }]);
const [validZipResult] = await runCode('src/drive/validate-zip.js', {
  json: { starterName: 'starter.zip' }, env: zipEnv, binary: { data: { fileName: 'starter.zip' } }, buffers: { data: validZip },
});
assert.equal(validZipResult.json.zipValidation.fileCount, 1);
await assert.rejects(() => runCode('src/drive/validate-zip.js', {
  json: {}, env: zipEnv, binary: { data: {} }, buffers: { data: makeZip([{ name: '../evil.txt' }]) },
}), /ZIP Slip/);
await assert.rejects(() => runCode('src/drive/validate-zip.js', {
  json: {}, env: zipEnv, binary: { data: {} }, buffers: { data: makeZip([{ name: 'huge.bin', compressedSize: 1, uncompressedSize: 1000000 }]) },
}), /compression bomb/);
await assert.rejects(() => runCode('src/drive/validate-zip.js', {
  json: {}, env: zipEnv, binary: { data: {} }, buffers: { data: Buffer.from('not-a-zip') },
}), /ZIP corrupto/);

const HEADINGS = [
  '## Historia de Usuario',
  '## Contexto',
  '## Objetivo técnico',
  '## Alcance',
  '## Fuera de alcance',
  '## Archivos esperados',
  '## Pasos sugeridos',
  '## Criterios de aceptación',
  '## Pruebas',
  '## Dependencias',
  '## Evidencia individual',
  '## Definition of Done',
];
const llmContext = {
  course: 'PWA', week: 1, weekPadded: '01', repository: 'Draggodeidad/pwa-utt',
  assignmentTitle: 'Semana 01', dueAt: null, courseId: 'course-pwa', courseWorkId: 'cw-pwa-01',
  updateTime: '2026-09-15T14:00:00Z', aiProvider: 'ollama', resumeKeys: [], userPrompt: '{}',
  starter: { found: true, name: 'PWA-w01-kit-estudiante.zip' },
};
const sectionsFor = (key, label) => ({
  historiaUsuario: `Como integrante quiero ${label} para entregar la semana.`,
  contexto: `La actividad requiere ${label}.`,
  objetivoTecnico: [`Implementar ${label}`],
  alcance: ['Código'],
  fueraDeAlcance: ['Despliegue'],
  archivosEsperados: [`src/${key}.ts`],
  pasosSugeridos: ['Revisar la actividad', `Implementar ${label}`],
  criteriosAceptacion: ['Funciona', 'Se prueba'],
  pruebas: ['npm test'],
  dependencias: ['Requiere baseline'],
  evidenciaIndividual: ['PR con diff y tests'],
  definitionOfDone: ['Implementación terminada', 'Criterios cumplidos', 'PR abierto'],
});
const validIssues = [
  { key: 'foundation', title: 'Integrar starter y establecer baseline', assignee: 'Draggodeidad', type: 'devops', priority: 'high', dependsOn: [], sections: sectionsFor('foundation', 'baseline') },
  { key: 'core', title: 'Implementar núcleo', assignee: 'Draggodeidad', type: 'feature', priority: 'high', dependsOn: ['foundation'], sections: sectionsFor('core', 'el núcleo') },
  { key: 'tests', title: 'Pruebas offline', assignee: 'JulianDele', type: 'test', priority: 'medium', dependsOn: ['foundation'], sections: sectionsFor('tests', 'pruebas offline') },
  { key: 'ui', title: 'UI offline', assignee: 'osbaldoXxC', type: 'feature', priority: 'medium', dependsOn: ['foundation'], sections: sectionsFor('ui', 'la UI offline') },
];
async function runPipeline(rawModelText, contextJson) {
  let out;
  [out] = await runCode('src/ai/parse-structured-plan.js', { json: { ...contextJson, rawModelText } });
  [out] = await runCode('src/ai/enforce-foundation.js', { json: out.json });
  [out] = await runCode('src/ai/normalize-plan.js', { json: out.json });
  [out] = await runCode('src/ai/build-bodies.js', { json: out.json });
  [out] = await runCode('src/ai/validate-plan.js', { json: out.json });
  return out;
}
const codes = (result) => (result.json.validationErrors || []).map((error) => error.code);

// Caso A — plan válido con starter: Foundation forzada + 12 headers en cada body.
let result = await runPipeline(JSON.stringify({ issues: validIssues }), llmContext);
assert.equal(result.json.valid, true, codes(result).join(','));
const foundation = result.json.plan.issues[0];
assert.equal(foundation.key, 'foundation');
assert.equal(foundation.assignee, 'Draggodeidad');
assert.deepEqual(foundation.dependsOn, []);
assert.equal(foundation.title, '[PWA][W01] Integrar PWA-w01-kit-estudiante.zip y establecer baseline semanal');
for (const issue of result.json.plan.issues) {
  for (const heading of HEADINGS) {
    assert.equal(issue.body.split(heading).length - 1, 1, `${issue.key}: header "${heading}" debe aparecer 1 vez`);
  }
}

// Caso B — LLM devuelve prefijo incorrecto: se normaliza al prefijo correcto.
const bIssues = validIssues.map((issue) => issue.key === 'core' ? { ...issue, title: '[PWA][W99] Implementar núcleo' } : issue);
result = await runPipeline(JSON.stringify({ issues: bIssues }), llmContext);
assert.equal(result.json.valid, true, codes(result).join(','));
assert.equal(result.json.plan.issues.find((issue) => issue.key === 'core').title, '[PWA][W01] Implementar núcleo');

// Caso C — dependencia inexistente: detectada antes de topological sort.
const cIssues = validIssues.map((issue) => issue.key === 'core' ? { ...issue, dependsOn: ['service-worker'] } : issue);
result = await runPipeline(JSON.stringify({ issues: cIssues }), llmContext);
assert.equal(result.json.valid, false);
assert.ok(codes(result).includes('INVALID_DEPENDENCY'), codes(result).join(','));
assert.equal(result.json.retryable, true);
assert.ok(result.json.normalization.droppedDependencies.some((d) => d.reason === 'INVALID_DEPENDENCY'));

// Caso D — self dependency: detectada.
const dIssues = validIssues.map((issue) => issue.key === 'core' ? { ...issue, dependsOn: ['core'] } : issue);
result = await runPipeline(JSON.stringify({ issues: dIssues }), llmContext);
assert.equal(result.json.valid, false);
assert.ok(codes(result).includes('SELF_DEPENDENCY'), codes(result).join(','));
assert.ok(result.json.normalization.droppedDependencies.some((d) => d.reason === 'SELF_DEPENDENCY'));

// Caso E — LLM omite contenido de una sección: los 12 headers siguen presentes con "No aplica.".
const eIssues = validIssues.map((issue) => issue.key === 'ui' ? { ...issue, sections: { ...issue.sections, alcance: [] } } : issue);
[result] = await runCode('src/ai/parse-structured-plan.js', { json: { ...llmContext, rawModelText: JSON.stringify({ issues: eIssues }) } });
[result] = await runCode('src/ai/enforce-foundation.js', { json: result.json });
[result] = await runCode('src/ai/normalize-plan.js', { json: result.json });
[result] = await runCode('src/ai/build-bodies.js', { json: result.json });
const uiBody = result.json.plan.issues.find((issue) => issue.key === 'ui').body;
assert.ok(uiBody.includes('## Alcance'));
assert.ok(uiBody.includes('- No aplica.'));
for (const heading of HEADINGS) assert.equal(uiBody.split(heading).length - 1, 1);

// Caso F — headers usan exactamente ## y nunca #.
assert.ok(!uiBody.includes('\n# Historia de Usuario'));
assert.ok(uiBody.includes('## Historia de Usuario'));

// Caso G — basura fuera del schema: rechazado (LLM_SCHEMA_INVALID).
result = await runPipeline('esto no es json', llmContext);
assert.equal(result.json.valid, false);
assert.ok(codes(result).includes('LLM_SCHEMA_INVALID'), codes(result).join(','));

// Caso H — ciclo: detectado antes de GitHub (validator) y rechazado por toposort.
const hIssues = [
  { key: 'core', title: 'Implementar núcleo', assignee: 'Draggodeidad', type: 'feature', priority: 'high', dependsOn: ['tests'], sections: sectionsFor('core', 'el núcleo') },
  { key: 'tests', title: 'Pruebas offline', assignee: 'JulianDele', type: 'test', priority: 'medium', dependsOn: ['core'], sections: sectionsFor('tests', 'pruebas offline') },
  { key: 'ui', title: 'UI offline', assignee: 'osbaldoXxC', type: 'feature', priority: 'medium', dependsOn: ['foundation'], sections: sectionsFor('ui', 'la UI offline') },
];
result = await runPipeline(JSON.stringify({ issues: hIssues }), llmContext);
assert.equal(result.json.valid, false);
assert.ok(codes(result).includes('DEPENDENCY_CYCLE'), codes(result).join(','));
await assert.rejects(() => runCode('src/planning/plan-toposort.js', { json: {
  course: 'PWA', weekPadded: '01', repoContext: { labels: [] }, starter: { found: false },
  plan: { issues: [
    { key: 'a', assignee: 'Draggodeidad', type: 'feature', priority: 'high', dependsOn: ['b'], expectedFiles: ['a.ts'], title: 'Implementar a', body: 'implementa código y lógica' },
    { key: 'b', assignee: 'JulianDele', type: 'test', priority: 'medium', dependsOn: ['a'], expectedFiles: ['b.spec.ts'], title: 'Probar b', body: 'tests' },
    { key: 'c', assignee: 'osbaldoXxC', type: 'feature', priority: 'low', dependsOn: [], expectedFiles: ['c.ts'], title: 'UI c', body: 'ui' },
  ] },
} }), /circulares/);

// Caso I — Draggodeidad sin implementación técnica sustancial: retryable.
const iIssues = [
  validIssues[0],
  { key: 'docs', title: 'Documentar requisitos', assignee: 'Draggodeidad', type: 'docs', priority: 'medium', dependsOn: ['foundation'], sections: sectionsFor('docs', 'documentación') },
  validIssues[2],
  validIssues[3],
];
result = await runPipeline(JSON.stringify({ issues: iIssues }), llmContext);
assert.equal(result.json.valid, false);
assert.ok(codes(result).includes('MISSING_SUBSTANTIAL'), codes(result).join(','));
assert.equal(result.json.retryable, true);
await assert.rejects(() => runCode('src/planning/plan-toposort.js', { json: result.json }), /no tiene implementación técnica sustancial/);

// Caso J — el contador de retries no se reinicia en el circuito de reparación.
const [firstParse] = await runCode('src/ai/parse-structured-plan.js', { json: { ...llmContext, rawModelText: '{"issues":[]}' }, runIndex: 0 });
assert.equal(firstParse.json.llmAttempt, 1);
const [repairParse] = await runCode('src/ai/parse-structured-plan.js', { json: { ...llmContext, rawModelText: '{"issues":[]}' }, runIndex: 1 });
assert.equal(repairParse.json.llmAttempt, 2);
const gateAllowsRetry = Number(repairParse.json.llmAttempt || 0) < 2 && Boolean(repairParse.json.retryable);
assert.equal(gateAllowsRetry, false, 'El gate debe detener el circuito tras un reintento');

const metadataBody = (key, updateTime, planKeys = 'foundation,core') => `<!-- classroom-course-id:course-pwa -->\n<!-- classroom-coursework-id:cw-pwa-03 -->\n<!-- classroom-update-time:${updateTime} -->\n<!-- course:PWA -->\n<!-- week:03 -->\n<!-- issue-key:${key} -->\n<!-- plan-keys:${planKeys} -->`;
const sourceContext = {
  course: 'PWA', week: 3, weekPadded: '03', courseId: 'course-pwa', courseWorkId: 'cw-pwa-03', updateTime: '2026-09-15T14:00:00Z',
  repository: 'Draggodeidad/pwa-utt', assignmentTitle: 'Semana 03', description: '', dueAt: null, starter: { found: false, files: [], relevantFiles: [] },
};
const oldIssue = { number: 1, state: 'open', title: 'old', body: metadataBody('foundation', '2026-09-14T14:00:00Z'), labels: [], assignees: [] };
const contextNodes = {
  'Activity Context': sourceContext,
  'GitHub - Repository': { body: { default_branch: 'main', topics: [] } },
  'GitHub - Recent Issues': { body: [oldIssue] },
  'GitHub - Search CourseWork ID': { body: { items: [oldIssue] } },
  'GitHub - Search Course Week': { body: { items: [oldIssue] } },
  'GitHub - Open Pull Requests': { body: [] }, 'GitHub - Labels': { body: [] },
  'GitHub - Tree': { body: { tree: [] } }, 'GitHub - README': { body: { content: '' } },
};
const [updatedContext] = await runCode('src/github/build-context.js', { nodes: contextNodes });
assert.equal(updatedContext.json.courseworkUpdated, true);
assert.equal(updatedContext.json.completeExisting, false);

const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
for (const value of ['GENERIC_TIMEZONE', 'TZ:', 'CLASSROOM_PWA_COURSE_ID', 'CLASSROOM_DMI_COURSE_ID', 'N8N_DEFAULT_BINARY_DATA_MODE', 'N8N_BLOCK_ENV_ACCESS_IN_NODE']) assert.ok(compose.includes(value));
assert.equal(/postgres|redis|supabase|kafka/i.test(compose), false);

console.log('OK: workflow, schedules, Classroom, Drive, ZIP, metadata, secretos y Compose validados.');
