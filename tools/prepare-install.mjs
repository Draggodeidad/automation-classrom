// Prepare an inactive n8n import, preserving identity, credential references and registry.
// node tools/prepare-install.mjs existing-export.json output.json [bootstrap-result.json ...]
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const [existingPath, outputPath, ...snapshots] = process.argv.slice(2);
if (!existingPath || !outputPath) throw new Error('Usage: node tools/prepare-install.mjs existing-export.json output.json [bootstrap-result.json ...]');
const exported = JSON.parse(fs.readFileSync(existingPath));
const originals = Array.isArray(exported) ? exported : [exported];
const original = originals.find(w => w.name === 'Classroom API to GitHub Issues - DMI and PWA');
if (!original || original.active) throw new Error('An existing inactive workflow is required; do not disable production implicitly.');
const workflow = JSON.parse(fs.readFileSync(new URL('../workflows/classroom-to-github.json', import.meta.url)));
const existingNodes = new Map(original.nodes.map(node => [node.name,node]));
const githubCredentials = original.nodes.find(node=>node.credentials?.githubApi)?.credentials;
for (const node of workflow.nodes) {
  const old = existingNodes.get(node.name);
  if (old) node.id=old.id;
  if (old?.credentials) node.credentials=old.credentials;
  else if (node.credentials?.githubApi && githubCredentials) node.credentials=githubCredentials;
  if (/^(Gemini|Qwen|GLM|OpenRouter|Prepare Gemini|Prepare OpenRouter|Prepare GLM|Normalize AI Response|Parse Structured Plan|Validate Final Plan|Fail Closed|Fail Validator|LLM Request)/.test(node.name) && old) {
    if (!isDeepStrictEqual(node.parameters, old.parameters)) throw new Error(`Protected AI node changed: ${node.name}`);
  }
}
// Keep unrelated installed nodes (for example an embedded Error Trigger branch).
const generatedNames = new Set(workflow.nodes.map(node => node.name));
for (const node of original.nodes) if (!generatedNames.has(node.name)) {
  workflow.nodes.push(node);
  if (original.connections[node.name]) workflow.connections[node.name] = original.connections[node.name];
}
workflow.id=original.id;
workflow.name=original.name;
workflow.settings={...original.settings,...workflow.settings};
workflow.active=false;
workflow.staticData=structuredClone(original.staticData || {});
workflow.staticData.global ||= {};
workflow.staticData.global.classroomRegistry ||= {};
for (const file of snapshots) {
  const preview=JSON.parse(fs.readFileSync(file));
  const registry=preview.proposedRegistry;
  if (preview.selectionMode!=='historical_bootstrap_preview' || preview.mutationsPerformed!==false ||
    !registry?.courseId || registry.version!==1 || !Number.isFinite(Date.parse(registry.cutoverAt))) throw new Error('Invalid bootstrap preview');
  if (workflow.staticData.global.classroomRegistry[registry.courseId]) throw new Error('Bootstrap already exists: refusing to move cutover');
  const ids=Object.keys(registry.entries);
  if (ids.length!==preview.historicalCourseworkCount || ids.some(id=>registry.entries[id].courseWorkId!==id || registry.entries[id].state!=='ignored_historical')) throw new Error('Invalid historical snapshot');
  workflow.staticData.global.classroomRegistry[registry.courseId]=registry;
}
fs.writeFileSync(outputPath,JSON.stringify([workflow],null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({id:workflow.id,active:workflow.active,nodes:workflow.nodes.length,
  registries:Object.values(workflow.staticData.global.classroomRegistry).map(r=>({courseId:r.courseId,cutoverAt:r.cutoverAt,historicalCount:Object.values(r.entries).filter(e=>e.state==='ignored_historical').length}))}));
