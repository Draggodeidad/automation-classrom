import assert from 'node:assert/strict';
import { runLlmOrchestrationTests } from './llm-orchestration.mjs';
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
assert.deepEqual(schema.properties.issues.items.required, [
  'key', 'title', 'type', 'priority', 'category', 'difficulty', 'estimatedWeight',
  'risk', 'requiresCoding', 'requiresRepositoryKnowledge', 'dependsOn',
  'requirementKind', 'gapAnalysis', 'provenance', 'sections',
]);
assert.deepEqual(schema.properties.issues.items.properties.sections.required, [
  'historiaUsuario', 'contexto', 'objetivoTecnico', 'alcance', 'fueraDeAlcance',
  'archivosEsperados', 'pasosSugeridos', 'criteriosAceptacion', 'pruebas',
  'dependencias', 'evidenciaIndividual', 'definitionOfDone',
]);
assert.equal(schema.properties.issues.minItems, 1);
assert.equal(schema.properties.issues.maxItems, 8);
assert.equal(schema.properties.issues.items.additionalProperties, false);

const names = workflow.nodes.map((node) => node.name);
const nodeNames = new Set(names);
for (const required of [
  'Schedule PWA Monday 09:10', 'Schedule DMI Tuesday 09:10', 'Manual Trigger', 'Manual Request',
  'Classroom - List CourseWork Initial', 'Wait 30 Minutes Once', 'Classroom - List CourseWork Retry',
  'Inspect Materials', 'Drive - Starter Metadata', 'Drive - Download Starter ZIP',
  'Validate ZIP Security', 'Extract Starter ZIP', 'Inspect Starter', 'GitHub - Search CourseWork ID',
  'Needs Manual Review?', 'Parse Structured Plan', 'Apply Gap Analysis', 'Enforce Operational Issues',
  'Normalize Titles & Keys & Dependencies', 'Build GitHub Issue Bodies', 'Validate Final Plan',
  'LLM Request', 'Gemini - Plan', 'Gemini Repair Required?', 'Gemini - Repair Once',
  'Prepare OpenRouter Fallback', 'OpenRouter - Chat Completion', 'Fail Closed - Invalid Plan',
  'Validator Internal?', 'Fail Validator - Invalid Plan',
  'Plan and Topological Sort', 'Exact Dry-Run Preview',
  'Loop Issues Sequentially', 'Verify Complete Set',
]) assert.ok(nodeNames.has(required), `Falta nodo ${required}`);
for (const removed of [
  'Validate Plan', 'Validate Repaired Plan', 'Repaired Plan Valid?',
  'AI Provider Gemini?', 'Normalize Repair Response', 'OpenRouter Fallback Available?',
  'LLM Retry Attempt Left?', 'Retry with Gemini?',
]) {
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
for (const forbidden of [
  'ghp_', 'github_pat_', 'AIzaSy', 'sk-ant-', 'sk-proj-',
  'Automation/Classroom/Processed', 'classroom-message-id:', 'Gmail - Search Candidates',
  ['olla', 'ma'].join(''), ['localhost:', '11434'].join(''),
  ['/api/', 'generate'].join(''), ['/api/', 'chat'].join(''),
  ['openrouter', '/free'].join(''),
]) {
  assert.equal(serialized.includes(forbidden), false, `Contenido obsoleto o secreto: ${forbidden}`);
}
for (const required of ['classroom-course-id:', 'classroom-coursework-id:', 'classroom-update-time:', 'plan-keys:', 'alt=media', 'capabilities(canDownload)']) {
  assert.ok(serialized.includes(required), `Falta ${required}`);
}
const geminiNode = workflow.nodes.find((node) => node.name === 'Gemini - Plan');
const openRouterNode = workflow.nodes.find((node) => node.name === 'OpenRouter - Chat Completion');
assert.equal(geminiNode.credentials.httpHeaderAuth.name, 'Gemini API Key');
assert.equal(openRouterNode.credentials.httpHeaderAuth.name, 'OpenRouter API Key');
assert.equal(openRouterNode.parameters.url, 'https://openrouter.ai/api/v1/chat/completions');
assert.equal(geminiNode.parameters.options.response.response.neverError, true);
assert.equal(openRouterNode.parameters.options.response.response.neverError, true);
assert.equal(geminiNode.onError, 'continueRegularOutput');
assert.equal(openRouterNode.onError, 'continueRegularOutput');
assert.equal(openRouterNode.parameters.jsonBody, '={{ $json.llmPayload }}');
assert.equal(serialized.includes('Bearer sk-'), false);
assert.deepEqual(workflow.connections['Plan Valid?'].main[1].map((edge) => edge.node), ['Validator Internal?']);
assert.deepEqual(workflow.connections['OpenRouter - Chat Completion'].main[0].map((edge) => edge.node), ['Normalize AI Response - Qwen']);
assert.equal(workflow.connections['Fail Closed - Invalid Plan'], undefined);
assert.equal(workflow.connections['Fail Validator - Invalid Plan'], undefined);
assert.deepEqual(workflow.connections['Validator Internal?'].main[0].map((edge) => edge.node), ['Fail Validator - Invalid Plan']);
assert.deepEqual(workflow.connections['Validator Internal?'].main[1].map((edge) => edge.node), ['Gemini Repair Required?']);

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
  '## Historia de Usuario', '## Contexto', '## Objetivo técnico', '## Alcance',
  '## Fuera de alcance', '## Archivos esperados', '## Pasos sugeridos',
  '## Criterios de aceptación', '## Pruebas', '## Dependencias',
  '## Evidencia individual', '## Definition of Done',
];
const groundingCatalog = {
  'classroom.description': { source: 'classroom', content: 'Implementar persistencia offline, pruebas y documentación. Ejecuten npm run verify; genera reports/verification.json como evidencia. El curso usa Next.js y una trayectoria PWA.' },
  'starter.archive': { source: 'starter', content: 'PWA-w01-kit-estudiante.zip' },
  'repository.readme': { source: 'repository', content: 'El proyecto define npm test como verificación.' },
  'repository.path:docs/requirements.md': { source: 'repository', content: 'docs/requirements.md' },
  'starter.file:individual.md': { source: 'starter', content: 'individual.md' },
  'workflow.setup-policy': { source: 'workflowConfiguration', content: 'Draggodeidad prepara el starter y el baseline cuando existe material inicial que requiere integración.' },
  'workflow.delivery-policy': { source: 'workflowConfiguration', content: 'Draggodeidad consolida la evidencia y realiza la entrega final en Google Classroom.' },
};
const llmContext = {
  schema,
  course: 'PWA', week: 1, weekPadded: '01', repository: 'Draggodeidad/pwa-utt',
  assignmentTitle: 'Semana 01', dueAt: null, courseId: 'course-pwa', courseWorkId: 'cw-pwa-01',
  updateTime: '2026-09-15T14:00:00Z', resumeKeys: [], userPrompt: '{}',
  starter: { found: true, name: 'PWA-w01-kit-estudiante.zip' }, groundingCatalog,
  repoContext: { labels: [] },
};
const sectionsFor = (label, overrides = {}) => ({
  historiaUsuario: `Como integrante quiero ${label} para completar la actividad.`,
  contexto: 'Classroom solicita persistencia offline.',
  objetivoTecnico: [`Completar ${label}`], alcance: ['Trabajo pendiente respaldado'],
  fueraDeAlcance: ['Detalles no respaldados'], archivosEsperados: [],
  pasosSugeridos: ['Revisar la evidencia disponible', `Completar ${label}`],
  criteriosAceptacion: ['El requisito solicitado queda cubierto', 'El resultado puede validarse'],
  pruebas: ['Ejecutar las verificaciones definidas actualmente por el proyecto'],
  dependencias: [], evidenciaIndividual: ['Registrar evidencia del resultado'],
  definitionOfDone: ['Criterios cumplidos', 'Evidencia disponible'], ...overrides,
});
const issueFor = (key, difficulty, category = 'implementation', overrides = {}) => ({
  key, title: `Resolver ${key}`, type: category === 'testing' ? 'test' : category === 'documentation' ? 'docs' : 'feature',
  priority: difficulty === 'hard' ? 'high' : difficulty === 'medium' ? 'medium' : 'low',
  category, difficulty, estimatedWeight: { easy: 1, medium: 2, hard: 3 }[difficulty],
  risk: difficulty === 'easy' ? 'low' : difficulty === 'medium' ? 'medium' : 'high',
  requiresCoding: category === 'implementation' || category === 'testing',
  requiresRepositoryKnowledge: difficulty !== 'easy', dependsOn: [], requirementKind: 'sourceRequirement',
  gapAnalysis: { status: 'missing', summary: `${key} todavía falta`, evidence: ['classroom.description'] },
  provenance: [{ claim: 'persistencia offline', source: 'classroom', evidence: 'classroom.description' }],
  sections: sectionsFor(key), ...overrides,
});
async function runPipeline(issueList, contextJson = llmContext) {
  const rawModelText = typeof issueList === 'string' ? issueList : JSON.stringify({ issues: issueList });
  return runValidatedContext({ ...contextJson, rawModelText });
}
async function runValidatedContext(contextJson) {
  let out;
  [out] = await runCode('src/ai/parse-structured-plan.js', { json: contextJson });
  [out] = await runCode('src/ai/apply-gap-analysis.js', { json: out.json });
  [out] = await runCode('src/ai/enforce-foundation.js', { json: out.json });
  [out] = await runCode('src/ai/normalize-plan.js', { json: out.json });
  [out] = await runCode('src/ai/build-bodies.js', { json: out.json });
  [out] = await runCode('src/ai/validate-plan.js', { json: out.json });
  return out;
}
async function assign(issueList, contextJson = llmContext) {
  const validated = await runPipeline(issueList, contextJson);
  assert.equal(validated.json.valid, true, (validated.json.validationErrors || []).map((error) => error.code).join(','));
  const [assigned] = await runCode('src/planning/plan-toposort.js', { json: validated.json });
  return assigned.json;
}
const codes = (value) => (value.json.validationErrors || []).map((error) => error.code);

// Caso base — setup y entrega son internos, pertenecen al owner y conservan los 12 encabezados.
let result = await runPipeline([issueFor('core', 'hard')]);
assert.equal(result.json.valid, true, codes(result).join(','));
const foundation = result.json.plan.issues[0];
const delivery = result.json.plan.issues.at(-1);
assert.equal(foundation.key, 'foundation');
assert.equal(foundation.assignee, 'Draggodeidad');
assert.equal(foundation.functionalWeight, 0);
assert.equal(foundation.requirementKind, 'internalWorkflowRequirement');
assert.equal(delivery.key, 'classroom-delivery');
assert.ok(delivery.dependsOn.includes('core'));
for (const issue of result.json.plan.issues) for (const heading of HEADINGS) {
  assert.equal(issue.body.split(heading).length - 1, 1, `${issue.key}: header ${heading}`);
}

// Caso 1 — 2 hard, 2 medium, 3 easy: hard/medium quedan principalmente en owner y Julian.
let assigned = await assign([
  issueFor('hard-a', 'hard'), issueFor('hard-b', 'hard'),
  issueFor('medium-a', 'medium'), issueFor('medium-b', 'medium'),
  issueFor('easy-a', 'easy', 'testing'), issueFor('easy-b', 'easy', 'documentation'), issueFor('easy-c', 'easy', 'validation', { requiresCoding: false }),
]);
const functional = assigned.plan.issues.filter((issue) => issue.requirementKind === 'sourceRequirement');
assert.ok(functional.filter((issue) => ['hard', 'medium'].includes(issue.difficulty)).every((issue) => ['Draggodeidad', 'JulianDele'].includes(issue.assignee)));
assert.ok(functional.filter((issue) => issue.difficulty === 'easy').some((issue) => issue.assignee === 'osbaldoXxC'), JSON.stringify(functional.map((issue) => ({ key: issue.key, difficulty: issue.difficulty, assignee: issue.assignee, risk: issue.risk, category: issue.category }))));

// Caso 2 — sólo complejas: ninguna se asigna artificialmente a Osbaldo.
assigned = await assign([issueFor('hard-1', 'hard'), issueFor('hard-2', 'hard'), issueFor('hard-3', 'hard'), issueFor('hard-4', 'hard')]);
assert.ok(assigned.plan.issues.filter((issue) => issue.requirementKind === 'sourceRequirement').every((issue) => issue.assignee !== 'osbaldoXxC'));

// Caso 3 — muchas easy: Osbaldo recibe varias y el resto puede absorber carga para balancear.
assigned = await assign(Array.from({ length: 6 }, (_, index) => issueFor(`easy-${index + 1}`, 'easy', index % 2 ? 'documentation' : 'testing')));
assert.ok(assigned.plan.issues.filter((issue) => issue.assignee === 'osbaldoXxC').length >= 3);

// Caso 4 — setup + entrega no alteran la carga funcional; dos hard se reparten entre owner y Julian.
assigned = await assign([issueFor('hard-owner', 'hard'), issueFor('hard-julian', 'hard')]);
assert.equal(assigned.assignmentPolicy.loads.Draggodeidad.operational, 2);
assert.equal(assigned.assignmentPolicy.loads.Draggodeidad.functional, 3);
assert.equal(assigned.assignmentPolicy.loads.JulianDele.functional, 3);

// Caso 5 — un comando inventado sin provenance falla cerrado.
const invented = issueFor('invented-command', 'easy', 'testing', {
  sections: sectionsFor('invented-command', { pruebas: ['Ejecutar npm run verify'] }),
});
result = await runPipeline([invented]);
assert.equal(result.json.valid, false);
assert.ok(codes(result).includes('UNGROUNDED_TECHNICAL_DETAIL'), codes(result).join(','));

// Un comando respaldado por repositorio sí se acepta.
const groundedCommand = issueFor('grounded-command', 'easy', 'testing', {
  provenance: [
    { claim: 'persistencia offline', source: 'classroom', evidence: 'classroom.description' },
    { claim: 'npm test', source: 'repository', evidence: 'repository.readme' },
  ],
  sections: sectionsFor('grounded-command', { pruebas: ['Ejecutar npm test'] }),
});
result = await runPipeline([groundedCommand]);
assert.equal(result.json.valid, true, codes(result).join(','));

// Test A — provenance reutilizable dentro de la misma Issue (sin duplicar por sección).
result = await runPipeline([issueFor('reusable-verify', 'easy', 'validation', {
  requiresCoding: false,
  provenance: [{ claim: 'Ejecuten npm run verify y genera reports/verification.json', source: 'classroom', evidence: 'classroom.description' }],
  sections: sectionsFor('reusable-verify', {
    pasosSugeridos: ['Ejecutar npm run verify', 'Verificar reports/verification.json', 'Documentar el resultado de npm run verify'],
    pruebas: ['Ejecutar npm run verify'],
    criteriosAceptacion: ['npm run verify genera reports/verification.json', 'La evidencia queda registrada'],
  }),
})]);
assert.equal(result.json.valid, true, codes(result).join(','));
assert.equal(result.json.groundingReport.status, 'valid');

// Test B — tecnología respaldada por equivalencia semántica (no carácter por carácter).
result = await runPipeline([issueFor('nextjs-backed', 'easy', 'documentation', {
  provenance: [{ claim: 'El curso usa Next.js y una trayectoria PWA', source: 'classroom', evidence: 'classroom.description' }],
  sections: sectionsFor('nextjs-backed', { objetivoTecnico: ['Justificar el uso de Next.js'] }),
})]);
assert.equal(result.json.valid, true, codes(result).join(','));

// Test C — ruta respaldada por repository.path:*.
result = await runPipeline([issueFor('path-backed', 'easy', 'documentation', {
  provenance: [{ claim: 'Definir los requisitos en docs/requirements.md', source: 'repository', evidence: 'repository.path:docs/requirements.md' }],
  sections: sectionsFor('path-backed', { pasosSugeridos: ['Editar docs/requirements.md'] }),
})]);
assert.equal(result.json.valid, true, codes(result).join(','));

// Test D — starter.file:* respaldado cuando la referencia existe.
result = await runPipeline([issueFor('starter-backed', 'easy', 'evidence', {
  requiresCoding: false,
  provenance: [{ claim: 'Registrar la evidencia en individual.md', source: 'starter', evidence: 'starter.file:individual.md' }],
  sections: sectionsFor('starter-backed', { evidenciaIndividual: ['Completar individual.md'] }),
})]);
assert.equal(result.json.valid, true, codes(result).join(','));

// Test E — claim realmente inventado se rechaza como GROUNDING_ERROR.
result = await runPipeline([issueFor('invented-command', 'easy', 'testing', {
  sections: sectionsFor('invented-command', { pruebas: ['Ejecutar npm run deploy:prod'] }),
})]);
assert.equal(result.json.valid, false);
assert.equal(result.json.errorType, 'GROUNDING_ERROR');
assert.ok(codes(result).includes('UNGROUNDED_TECHNICAL_DETAIL'), codes(result).join(','));

// Test F — inconsistencia interna detectada: schemaStatus=valid con SCHEMA_ERROR → FAIL_VALIDATOR.
const [internalResult] = await runCode('src/ai/validate-plan.js', {
  json: { ...llmContext, parseStatus: 'valid', schemaStatus: 'valid', errorType: 'SCHEMA_ERROR', plan: { issues: [issueFor('core', 'hard')] } },
});
assert.equal(internalResult.json.errorType, 'VALIDATOR_INTERNAL_ERROR');
assert.equal(internalResult.json.nextState, 'FAIL_VALIDATOR');
assert.equal(internalResult.json.mutationsPerformed, false);
assert.equal(internalResult.json.finalPlanStatus, 'rejected');

// Caso 6 — Gap Analysis elimina trabajo ya completo y limpia sus dependencias.
const complete = issueFor('already-done', 'medium', 'implementation', {
  gapAnalysis: { status: 'complete', summary: 'El repositorio ya contiene esta capacidad', evidence: ['repository.readme'] },
});
const pending = issueFor('still-pending', 'easy', 'validation', { requiresCoding: false, dependsOn: ['already-done'] });
result = await runPipeline([complete, pending]);
assert.equal(result.json.valid, true, codes(result).join(','));
assert.equal(result.json.plan.issues.some((issue) => issue.key === 'already-done'), false);
assert.deepEqual(result.json.plan.issues.find((issue) => issue.key === 'still-pending').dependsOn, ['foundation']);
assert.equal(result.json.gapAnalysis.excludedCompletedWork[0].key, 'already-done');

// Dependencias inválidas y ciclos continúan fallando antes de GitHub.
result = await runPipeline([issueFor('bad-dependency', 'easy', 'validation', { requiresCoding: false, dependsOn: ['missing-key'] })]);
assert.ok(codes(result).includes('INVALID_DEPENDENCY'));
const cyclic = [issueFor('cycle-a', 'medium', 'implementation', { dependsOn: ['cycle-b'] }), issueFor('cycle-b', 'medium', 'implementation', { dependsOn: ['cycle-a'] })];
result = await runPipeline(cyclic);
assert.ok(codes(result).includes('DEPENDENCY_CYCLE'));

// Preview expone asignación, clasificación, carga, dependencias, grounding y provenance sin mutaciones.
assigned = await assign([issueFor('preview-work', 'easy', 'validation', { requiresCoding: false })]);
const [preview] = await runCode('src/reporting/dry-run-summary.js', { json: assigned });
assert.equal(preview.json.mode, 'dry-run');
assert.equal(preview.json.mutationsPerformed, false);
for (const field of ['assignee', 'difficulty', 'weight', 'category', 'dependsOn', 'groundingStatus', 'provenance']) {
  assert.ok(field in preview.json.issuesThatWouldBeCreated[0], `preview sin ${field}`);
}

await runLlmOrchestrationTests({ workflow, schema, llmContext, issueFor });

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
const geminiSchemaText = JSON.stringify(updatedContext.json.geminiSchema);
for (const unsupportedConstraint of ['pattern', 'uniqueItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems']) {
  assert.equal(geminiSchemaText.includes(`"${unsupportedConstraint}"`), false, `Gemini schema conserva ${unsupportedConstraint}`);
}
assert.ok(geminiSchemaText.includes('additionalProperties'));
assert.ok(JSON.stringify(updatedContext.json.schema).includes('pattern'));

const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
for (const value of ['GENERIC_TIMEZONE', 'TZ:', 'CLASSROOM_PWA_COURSE_ID', 'CLASSROOM_DMI_COURSE_ID', 'N8N_DEFAULT_BINARY_DATA_MODE', 'N8N_BLOCK_ENV_ACCESS_IN_NODE']) assert.ok(compose.includes(value));
assert.equal(/postgres|redis|supabase|kafka/i.test(compose), false);

console.log('OK: workflow, Gemini→Repair→Qwen→GLM, casos A-J, dry-run, secretos y Compose validados.');
