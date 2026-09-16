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

async function runCode(relative, { json = {}, env = {}, binary = {}, buffers = {}, nodes = {} } = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8').replace('__ISSUE_PLAN_SCHEMA__', JSON.stringify(schema));
  const fn = new AsyncFunction('$json', '$env', '$input', '$binary', '$', '$getWorkflowStaticData', 'Buffer', 'structuredClone', source);
  const input = { first: () => ({ json, binary }), all: () => [{ json, binary }] };
  const getNode = (name) => ({ item: { json: nodes[name] || {} } });
  const staticData = {};
  const context = { helpers: { getBinaryDataBuffer: async (_index, field) => buffers[field] } };
  return fn.call(context, json, env, input, binary, getNode, () => staticData, Buffer, structuredClone);
}

assert.equal(workflow.name, 'Classroom API to GitHub Issues - DMI and PWA');
assert.equal(workflow.active, false);
assert.equal(errorWorkflow.nodes[0].type, 'n8n-nodes-base.errorTrigger');
assert.equal(schema.type, 'object');
assert.ok(schema.required.includes('source'));
assert.deepEqual(schema.properties.source.required, ['courseId', 'courseWorkId', 'updateTime', 'starterName']);

const names = workflow.nodes.map((node) => node.name);
const nodeNames = new Set(names);
for (const required of [
  'Schedule PWA Monday 09:10', 'Schedule DMI Tuesday 09:10', 'Manual Trigger', 'Manual Request',
  'Classroom - List CourseWork Initial', 'Wait 30 Minutes Once', 'Classroom - List CourseWork Retry',
  'Inspect Materials', 'Drive - Starter Metadata', 'Drive - Download Starter ZIP',
  'Validate ZIP Security', 'Extract Starter ZIP', 'Inspect Starter', 'GitHub - Search CourseWork ID',
  'Needs Manual Review?', 'Validate Plan', 'Plan and Topological Sort', 'Exact Dry-Run Preview',
  'Loop Issues Sequentially', 'Verify Complete Set',
]) assert.ok(nodeNames.has(required), `Falta nodo ${required}`);

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

const issueBody = [
  '## Historia de Usuario', 'Como integrante quiero implementar para entregar.',
  '## Contexto', 'Contexto técnico suficiente.', '## Objetivo técnico', 'Implementar código verificable.',
  '## Alcance', '- Código', '## Fuera de alcance', '- Despliegue', '## Archivos esperados', '- src/app.ts',
  '## Pasos sugeridos', '1. Implementar', '## Criterios de aceptación', '- [ ] Funciona', '- [ ] Se prueba',
  '## Pruebas', 'npm test', '## Dependencias', '- Ninguna.', '## Evidencia individual', 'PR con diff y tests.',
  '## Definition of Done', '- [ ] Implementación terminada.', '- [ ] Criterios cumplidos.', '- [ ] Tests pasando.', '- [ ] Evidencia disponible.', '- [ ] PR abierto.',
].join('\n\n');
const foundationTitle = '[PWA][W03] Integrar PWA-w03-kit-estudiante.zip y establecer baseline semanal';
const basePlan = {
  course: 'PWA', week: 3, repository: 'Draggodeidad/pwa-utt', assignmentTitle: 'Semana 03', deadline: null,
  source: { courseId: 'course-pwa', courseWorkId: 'cw-pwa-03', updateTime: '2026-09-15T14:00:00Z', starterName: 'PWA-w03-kit-estudiante.zip' },
  issues: [
    { key: 'foundation', title: foundationTitle, assignee: 'Draggodeidad', type: 'devops', priority: 'high', dependsOn: [], body: issueBody, expectedFiles: ['package.json'], acceptanceCriteria: ['a', 'b'], tests: ['npm test'], evidence: ['PR'] },
    { key: 'core', title: '[PWA][W03] Implementar núcleo', assignee: 'Draggodeidad', type: 'feature', priority: 'high', dependsOn: ['foundation'], body: issueBody, expectedFiles: ['src/app.ts'], acceptanceCriteria: ['a', 'b'], tests: ['npm test'], evidence: ['PR'] },
    { key: 'julian', title: '[PWA][W03] Pruebas offline', assignee: 'JulianDele', type: 'test', priority: 'medium', dependsOn: ['foundation'], body: issueBody, expectedFiles: ['tests/offline.spec.ts'], acceptanceCriteria: ['a', 'b'], tests: ['npm test'], evidence: ['PR'] },
    { key: 'osbaldo', title: '[PWA][W03] UI offline', assignee: 'osbaldoXxC', type: 'feature', priority: 'medium', dependsOn: ['foundation'], body: issueBody, expectedFiles: ['src/ui.ts'], acceptanceCriteria: ['a', 'b'], tests: ['npm test'], evidence: ['PR'] },
  ],
};
const validationInput = {
  course: 'PWA', week: 3, weekPadded: '03', repository: 'Draggodeidad/pwa-utt', courseId: 'course-pwa', courseWorkId: 'cw-pwa-03',
  updateTime: '2026-09-15T14:00:00Z', starter: { found: true, name: 'PWA-w03-kit-estudiante.zip' }, userPrompt: '{}', rawModelText: JSON.stringify(basePlan),
};
let [validation] = await runCode('src/ai/validate-plan.js', { json: validationInput });
assert.equal(validation.json.valid, true, validation.json.validationErrors?.join('; '));
const wrongFoundation = structuredClone(basePlan);
wrongFoundation.issues[0].title = '[PWA][W03] Baseline genérico';
[validation] = await runCode('src/ai/validate-plan.js', { json: { ...validationInput, rawModelText: JSON.stringify(wrongFoundation) } });
assert.equal(validation.json.valid, false);
assert.ok(validation.json.validationErrors.some((error) => error.includes('Foundation exacta')));

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
