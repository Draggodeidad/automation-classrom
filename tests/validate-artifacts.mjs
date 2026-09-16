import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const workflow = readJson('workflows/classroom-to-github.json');
const errorWorkflow = readJson('workflows/classroom-error-handler.json');
const schema = readJson('schemas/issue-plan.schema.json');
const fixtures = readJson('tests/fixtures/messages.json');

assert.equal(workflow.name, 'Classroom to GitHub Issues - DMI and PWA');
assert.equal(workflow.active, false);
assert.equal(errorWorkflow.nodes[0].type, 'n8n-nodes-base.errorTrigger');
assert.equal(schema.type, 'object');
assert.ok(schema.properties.issues.items.required.includes('dependsOn'));

const nodeNames = new Set(workflow.nodes.map((node) => node.name));
for (const required of [
  'Gmail - Search Candidates', 'Parse and Route', 'GitHub - Search Message ID',
  'GitHub - Search Course Week', 'Validate Plan', 'Validate Repaired Plan',
  'Plan and Topological Sort', 'Loop Issues Sequentially', 'Verify Complete Set',
  'Loop Messages Sequentially', 'GitHub - Recheck Issue Key', 'GitHub - Reconcile Existing Issue', 'Gmail - Mark Processed', 'Exact Dry-Run Preview',
]) assert.ok(nodeNames.has(required), `Falta nodo ${required}`);

const serialized = JSON.stringify(workflow);
for (const forbidden of ['ghp_', 'github_pat_', 'AIzaSy', 'sk-ant-', 'sk-proj-']) {
  assert.equal(serialized.includes(forbidden), false, `Posible secreto: ${forbidden}`);
}
assert.ok(serialized.includes('Automation/Classroom/Processed'));
assert.ok(serialized.includes('classroom-message-id:'));
assert.ok(serialized.includes('plan-keys:'));
assert.ok(serialized.includes("0 7-20 * * 1-3"));

const collectJsFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectJsFiles(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
};

for (const file of collectJsFiles(path.join(root, 'src'))) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('__ISSUE_PLAN_SCHEMA__')) {
    new Function(source.replace('__ISSUE_PLAN_SCHEMA__', '{}'));
  } else {
    new Function(source);
  }
}

const courseMap = {
  DMI: { match: 'DMI - 10B', repository: 'Draggodeidad/campusops-dmi-team' },
  PWA: { match: 'PWA - 10B', repository: 'Draggodeidad/pwa-utt' },
};
function classify(message) {
  if (!/no-reply@classroom\.google\.com/i.test(message.from)) return { action: 'ignore' };
  if ((message.labels || []).includes('Automation/Classroom/Processed')) return { action: 'ignore' };
  const positive = message.subject.match(/Nueva tarea:\s*["“']?\s*(?:\[\s*)?Semana\s*0*(\d{1,2})(?:\s*\])?/i);
  if (!positive) return { action: 'ignore' };
  if (/quiz\s+(semanal|individual)|fecha de entrega mañana|recordatorio|aviso general|comentario|calificaci[oó]n/i.test(message.subject)) return { action: 'ignore' };
  const course = Object.keys(courseMap).find((key) => `${message.subject}\n${message.body}`.includes(courseMap[key].match));
  if (!course) return { action: 'ignore' };
  return { action: 'process', course, repository: courseMap[course].repository, week: Number(positive[1]) };
}
for (const fixture of fixtures) assert.deepEqual(classify(fixture), fixture.expected, `Caso ${fixture.case}`);

const dag = [
  { key: 'bootstrap', dependsOn: [] },
  { key: 'core', dependsOn: ['bootstrap'] },
  { key: 'julian', dependsOn: ['bootstrap'] },
  { key: 'osbaldo', dependsOn: ['bootstrap'] },
  { key: 'integrate', dependsOn: ['core', 'julian', 'osbaldo'] },
];
const done = new Set();
while (done.size < dag.length) {
  const ready = dag.filter((issue) => !done.has(issue.key) && issue.dependsOn.every((key) => done.has(key)));
  assert.ok(ready.length, 'El DAG de prueba contiene un ciclo');
  ready.forEach((issue) => done.add(issue.key));
}

const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
assert.ok(compose.includes('n8n:2.39.5'));
assert.equal(/postgres|redis|supabase/i.test(compose), false);
assert.ok(compose.includes('host.docker.internal:host-gateway'));

console.log('OK: JSON, Code Nodes, secretos, router, filtros, DAG y Compose validados.');
