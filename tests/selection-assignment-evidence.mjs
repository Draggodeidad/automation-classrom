import fs from 'node:fs';
import assert from 'node:assert/strict';
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const schema = JSON.parse(fs.readFileSync('schemas/issue-plan.schema.json'));
const workflow = JSON.parse(fs.readFileSync('workflows/classroom-to-github.json'));
const names = new Map(workflow.nodes.map(n => [n.name, n]));
async function run(file, json, state = {}, env = {}) {
  const code = fs.readFileSync(file, 'utf8');
  const result = await new AsyncFunction('$json', '$getWorkflowStaticData', '$env', code)(json, () => state, env);
  return result[0].json;
}
const selector = 'src/classroom/parse-coursework.js';
const cw = (id, week, creationTime = '2026-09-01T00:00:00Z') => ({id, courseId:'course-test', title:`Semana ${week}`, state:'PUBLISHED', creationTime, updateTime:creationTime});
const historical = [cw('history-c',3),cw('history-a',1),cw('history-b',2)];
const request = { course:'PWA', courseId:'course-test', triggerKind:'manual', automationMode:'dry-run', selectionStartedAt:'2026-09-20T00:00:00Z' };
const select = (rows, state, extra = {}) => run(selector, {...request, classroomResponse:{courseWork:rows}, ...extra}, state);
const examples = {};
let count = 0;
const test = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`); };
let registry;
await test('A historical bootstrap stores IDs, not week thresholds', async () => {
  const result = await select(historical, {}, {bootstrapHistorical:true});
  registry = result.proposedRegistry;
  assert.equal(Object.keys(registry.entries).length,3);
  assert.ok(Object.values(registry.entries).every(e=>e.state==='ignored_historical'));
  assert.equal(result.registryPersisted,false);
});
const state = {classroomRegistry:{'course-test':registry}};
await test('B no pending skips LLM and mutations', async () => {
  examples.noPending = await select(historical,state);
  assert.equal(examples.noPending.executionResult,'no_pending_coursework');
  assert.equal(examples.noPending.mutationsPerformed,false);
  assert.equal(examples.noPending.historicalCourseworkCount,3);
  assert.deepEqual(workflow.connections['CourseWork Found Initial?'].main[1].map(e=>e.node),['Build No Activity Summary']);
  assert.equal(workflow.connections['Build No Activity Summary'],undefined);
});
await test('C new ID selected deterministically, processed skipped', async () => {
  const rows = [cw('new-z',5,'2026-09-21T00:00:00Z'),...historical,cw('new-a',4,'2026-09-21T00:00:00Z')];
  examples.newCoursework = await select(rows,state);
  assert.equal(examples.newCoursework.courseWorkId,'new-a');
  assert.equal(examples.newCoursework.courseWorkState,'pending');
  assert.equal((await select([...rows].reverse(),state)).courseWorkId,'new-a');
  const doneState = structuredClone(state);
  doneState.classroomRegistry['course-test'].entries['new-a']={courseWorkId:'new-a',state:'processed'};
  assert.equal((await select(rows,doneState)).courseWorkId,'new-z');
});
await test('D updateTime cannot resurrect historical ID', async () => {
  const edited = historical.map(c=>({...c,updateTime:'2026-10-01T00:00:00Z'}));
  assert.equal((await select(edited,state)).executionResult,'no_pending_coursework');
});
await test('E explicit manual dry-run override is read-only and never scheduled', async () => {
  const before = JSON.stringify(state);
  const result = await select(historical,state,{manualCourseWorkOverride:'history-a'});
  assert.equal(result.selectionMode,'manual_test_override');
  assert.equal(result.historicalStatus,'ignored_historical');
  assert.equal(JSON.stringify(state),before);
  await assert.rejects(select(historical,state,{triggerKind:'schedule',manualCourseWorkOverride:'history-a'}),/OVERRIDE_FORBIDDEN/);
  await assert.rejects(select(historical,state,{automationMode:'live',manualCourseWorkOverride:'history-a'}),/OVERRIDE_FORBIDDEN/);
  assert.equal((await select(historical,{})).executionResult,'historical_bootstrap_required');
  await assert.rejects(select(historical,state,{bootstrapHistorical:true}),/BOOTSTRAP_ALREADY_EXISTS/);
  await assert.rejects(run(selector,{...request,classroomResponse:{courseWork:historical,nextPageToken:'more'}},{}),/INCOMPLETE_SNAPSHOT/);
});
const criteria = ['Problema y contexto','Límites del sistema','Dos escenarios de usuario','RF','RNF medibles'];
const contents = { 'docs/requirements.md':{sha:'actual-blob-sha', truncated:false,
  content:'El problema y contexto corresponden al registro de solicitudes. Los límites del sistema excluyen pagos. Los dos escenarios de usuario describen registro y consulta. Los RF detallan el registro obligatorio. Los RNF medibles exigen respuesta menor a 200 ms.'} };
const catalog = {'classroom.description':{source:'classroom',content:`Se requiere: ${criteria.join('; ')}.`},
 'repository.path:docs/requirements.md':{source:'repository',content:contents['docs/requirements.md'].content},
 'workflow.setup-policy':{source:'workflowConfiguration',content:'Draggodeidad prepara el starter y el baseline cuando existe material inicial que requiere integración.'},
 'workflow.delivery-policy':{source:'workflowConfiguration',content:'Draggodeidad consolida la evidencia y realiza la entrega final en Google Classroom.'}};
const item = (key,difficulty='easy',category='implementation') => ({key,title:`Completar ${key}`,type:'feature',priority:'medium',category,difficulty,
 estimatedWeight:{easy:1,medium:2,hard:3}[difficulty],risk:difficulty==='easy'?'low':'medium',requiresCoding:category==='implementation',requiresRepositoryKnowledge:false,
 requirementKind:'sourceRequirement',dependsOn:[],provenance:[{claim:'Problema y contexto',source:'classroom',evidence:'classroom.description'}],
 gapAnalysis:{status:'missing',summary:'Falta cobertura',evidence:['classroom.description']},sections:{historiaUsuario:'Como integrante quiero completar el requisito para cumplir la actividad.',contexto:'La actividad requiere trabajo pendiente.',
 objetivoTecnico:['Trabajo pendiente'],alcance:[],fueraDeAlcance:[],archivosEsperados:[],pasosSugeridos:['Completar lo pendiente'],
 criteriosAceptacion:['Criterio solicitado cubierto','Resultado verificable'],pruebas:['Verificar el resultado'],dependencias:[],evidenciaIndividual:['Registrar resultado'],definitionOfDone:['Verificado']}});
const base = { ...request, week:4,weekPadded:'04',courseWorkId:'new-a',schema,groundingCatalog:catalog,starter:{found:false},repoContext:{labels:[]} };
const doc = {...item('requirements','medium','documentation'),gapAnalysis:{status:'complete',summary:'Existe archivo',evidence:['repository.path:docs/requirements.md']}};
doc.sections.criteriosAceptacion=criteria;
doc.sections.archivosEsperados=['docs/requirements.md'];
const review = n => ({reviewedBy:'fixture-reviewer',requirementsChecked:criteria.slice(0,n).map(requirement=>({requirement,satisfied:true,path:'docs/requirements.md',blobSha:'actual-blob-sha',
 excerpt:contents['docs/requirements.md'].content,sourceEvidence:'classroom.description',sourceQuote:requirement}))});
const gap = (issues,n,repositoryContents=contents) => run('src/ai/apply-gap-analysis.js',{...base,plan:{issues},repositoryContents,coverageReview:{requirements:review(n)}});
await test('F partial produces only unmet requirements',async()=>{
 const r=await gap([doc],2); const i=r.plan.issues[0];
 assert.equal(i.gapAnalysis.status,'partial'); assert.deepEqual(i.sections.alcance,criteria.slice(2));
 assert.deepEqual(i.sections.pasosSugeridos,criteria.slice(2)); examples.partial=i;
});
await test('G complete requires every requirement checked against current content',async()=>{
 const r=await gap([doc],5);assert.equal(r.plan.issues.length,0);
 assert.equal(r.gapAnalysis.excludedCompletedWork[0].requirementsChecked.length,5);
 const stale=structuredClone(contents);stale['docs/requirements.md'].sha='changed';
 assert.equal((await gap([doc],5,stale)).plan.issues[0].gapAnalysis.status,'partial');
 const pathOnly=await gap([doc],0,{});assert.equal(pathOnly.plan.issues[0].gapAnalysis.status,'missing');
 assert.equal(pathOnly.gapAnalysis.warnings[0].code,'WARNING_UNVERIFIED_COMPLETION');
});
await test('H absent file yields missing work',async()=>{
 const r=await gap([doc],5,{});assert.equal(r.plan.issues[0].gapAnalysis.status,'missing');
});
const assign = issues => run('src/planning/plan-toposort.js',{...base,plan:{issues}});
await test('I no hard, two medium and two easy includes Julian medium',async()=>{
 const r=await assign([item('medium-a','medium'),item('medium-b','medium'),item('easy-a'),item('easy-b')]);
 assert.ok(r.plan.issues.some(i=>i.assignee==='JulianDele'&&i.difficulty==='medium'));
 examples.mediumAssignment=r.plan.issues.map(({key,assignee,difficulty})=>({key,assignee,difficulty}));
});
await test('J three easy functional tasks also include Julian',async()=>{
 const r=await assign([item('easy-a'),item('easy-b'),item('easy-c')]);
 assert.equal(r.teamCoverage.JulianDele.functionalIssues,1);
 assert.equal(new Set(r.plan.issues.map(i=>i.assignee)).size,3);
 examples.easyAssignment=r.plan.issues.map(({key,assignee,difficulty})=>({key,assignee,difficulty}));
});
await test('K one safe general task may belong to Osbaldo',async()=>{
 const r=await assign([item('simple-doc','easy','documentation')]);
 assert.equal(r.plan.issues.length,1);assert.equal(r.plan.issues[0].assignee,'osbaldoXxC');
 assert.ok(r.assignmentWarnings.some(w=>w.member==='JulianDele'&&w.code==='INFO_NO_COMPATIBLE_WORK'));
});
let personalPlan;
await test('L one evidence responsibility per person, shared file allowed',async()=>{
 const shared={...item('individual','easy','evidence'),title:'Documentar evidencia individual'};
 shared.sections.archivosEsperados=['evidence/individual.md'];
 let data={...base,groundingCatalog:{...catalog,'classroom.personal':{source:'classroom',content:'Cada integrante debe completar evidencia individual de su contribución.'}},
 plan:{issues:[item('feature-a','medium'),item('feature-b','medium'),shared]}};
 data=await run('src/ai/enforce-foundation.js',data);
 data=await run('src/planning/expand-personal-requirements.js',data);
 data=await run('src/planning/plan-toposort.js',data);
 data=await run('src/ai/build-bodies.js',data);
 personalPlan=await run('src/planning/validate-final-assignment.js',data);
 const personal=personalPlan.plan.issues.filter(i=>i.personalRequirement);
 assert.equal(personal.length,3);
 assert.deepEqual(personal.map(i=>i.key).sort(),['evidence-draggodeidad','evidence-juliandele','evidence-osbaldoxxc']);
 for(const i of personal){assert.equal(i.assignee,i.personalOwner);assert.equal(i.delegable,false);assert.equal(i.functionalWeight,0);
 assert.ok(i.body.includes(`Como integrante ${i.personalOwner}`));assert.ok(i.dependsOn.every(key=>personalPlan.plan.issues.find(t=>t.key===key).assignee===i.personalOwner));}
 assert.equal(personalPlan.teamCoverage.Draggodeidad.operationalWeight,1);
 examples.personalEvidence=personal.map(({key,assignee,delegable,dependsOn})=>({key,assignee,delegable,dependsOn}));
});
await test('M personal ownership cannot be reassigned',async()=>{
 const bad=structuredClone(personalPlan);bad.plan.issues.find(i=>i.key==='evidence-juliandele').assignee='osbaldoXxC';
 await assert.rejects(run('src/planning/validate-final-assignment.js',bad),/PLAN_INVALID/);
 await assert.rejects(run('src/planning/plan-toposort.js',bad),/PLAN_INVALID/);
});
await test('N absence or negation of personal requirement creates no evidence tasks',async()=>{
 for(const text of ['Entrega grupal','No se requiere evidencia individual.']){
 const r=await run('src/planning/expand-personal-requirements.js',{...base,groundingCatalog:{'classroom.description':{source:'classroom',content:text}},plan:{issues:[item('real-work')]}});
 assert.equal(r.plan.issues.length,1);assert.equal(r.personalRequirementsRequired,false);}
});
await test('O excluded complete dependencies have evidence and no phantom keys',async()=>{
 const dependent={...item('dependent'),dependsOn:['requirements']};
 const r=await gap([doc,dependent],5);assert.deepEqual(r.plan.issues[0].dependsOn,[]);
 assert.equal(r.plan.issues[0].satisfiedDependencies[0].resolution,'already_satisfied');
 assert.equal(r.plan.issues[0].satisfiedDependencies[0].requirementsChecked.length,5);
});
await test('P unknown dependencies and cycles reject PLAN_INVALID',async()=>{
 await assert.rejects(assign([{...item('broken'),dependsOn:['ghost']}]),/PLAN_INVALID/);
 await assert.rejects(assign([{...item('aa'),dependsOn:['bb']},{...item('bb'),dependsOn:['aa']}]),/PLAN_INVALID/);
});
await test('Q compatible real unassigned work gives Julian coverage',async()=>{
 const r=await assign([item('real-a'),item('real-b'),item('real-c')]);
 assert.ok(r.teamCoverage.JulianDele.functionalIssues>0);assert.equal(r.plan.issues.length,3);
 const rebalance=await assign([item('doc-a','easy','documentation'),item('doc-b','easy','documentation'),item('doc-c','easy','documentation')]);
 assert.ok(rebalance.assignmentWarnings.some(w=>w.code==='WARNING_ASSIGNMENT_IMBALANCE'&&w.resolution==='rebalanced'));
 assert.equal(rebalance.plan.issues.length,3);
});
await test('R incompatible or exhausted work produces explanation without invention',async()=>{
 const r=await assign([]);assert.equal(r.plan.issues.length,0);
 assert.ok(r.assignmentWarnings.some(w=>w.member==='JulianDele'&&w.code==='INFO_NO_COMPATIBLE_WORK'));
});
// Integration uses actual exported Code nodes, parser and grounding validator unchanged.
await test('Integration exported pipeline from provider JSON to final preview',async()=>{
 const input={...base,rawModelText:JSON.stringify({issues:[item('new-feature','medium')]}),parseStatus:'valid',schemaStatus:'valid'};
 let data=input;
 for(const name of ['Parse Structured Plan','Apply Gap Analysis','Enforce Operational Issues','Normalize Titles & Keys & Dependencies','Build GitHub Issue Bodies','Validate Final Plan']){
 data=(await new AsyncFunction('$json',names.get(name).parameters.jsCode)(data))[0].json;
 }
 assert.equal(data.valid,true,JSON.stringify(data.validationErrors));
 for(const name of ['Expand Personal Requirements','Plan and Topological Sort','Build Assigned Issue Bodies','Validate Final Assignment','Exact Dry-Run Preview']){
 data=(await new AsyncFunction('$json',names.get(name).parameters.jsCode)(data))[0].json;
 }
 assert.equal(data.mode,'dry-run');assert.equal(data.mutationsPerformed,false);assert.equal(data.finalAssignmentStatus,'valid');
 assert.ok(data.issuesThatWouldBeCreated.some(i=>i.assignee==='JulianDele'));
});
fs.writeFileSync('docs/SELECTION-ASSIGNMENT-EXAMPLES.json',JSON.stringify(examples,null,2)+'\n');
console.log(`OK ${count} selection/gap/assignment/evidence tests`);
await test('Personal completion remains per member and required rubric fields survive expansion', async () => {
 const sourceText='Cada integrante debe completar evidencia individual:\n- Registrar su decisión.\n- Indicar su uso de IA.';
 const ctx={...base,groundingCatalog:{...catalog,'classroom.personal':{source:'classroom',content:sourceText}},
 repositoryContents:contents,plan:{issues:[item('only-work')]}};
 let prepared=await run('src/ai/enforce-foundation.js',ctx);
 prepared=await run('src/planning/expand-personal-requirements.js',prepared);
 const criteria=prepared.personalExpansion.sourceRequirements.map(r=>r.text);
 assert.equal(criteria.length,3);
 ctx.coverageReview={'evidence-juliandele':{reviewedBy:'reviewer',requirementsChecked:criteria.map(requirement=>({requirement,satisfied:true,
 personalOwner:'JulianDele',path:'docs/requirements.md',blobSha:'actual-blob-sha',excerpt:contents['docs/requirements.md'].content}))}};
 let result=await run('src/ai/enforce-foundation.js',ctx);
 result=await run('src/planning/expand-personal-requirements.js',result);
 assert.equal(result.plan.issues.filter(i=>i.personalRequirement).length,2);
 result=await run('src/planning/plan-toposort.js',result);
 result=await run('src/planning/validate-final-assignment.js',result);
 assert.ok(result.teamCoverage.JulianDele.personalEvidence);
 assert.equal(result.completePersonalEvidence[0].member,'JulianDele');
});
await test('Processed registry requires existing complete GitHub set, overrides preserve history', async () => {
 const st=structuredClone(state);
 const context={...base,triggerKind:'schedule',completeExisting:true,existingAutomationIssues:[{number:1}],selectionMode:'pending_registry'};
 const result=await run('src/registry/observe-existing.js',context,st);
 assert.equal(result.courseWorkState,'processed');assert.equal(st.classroomRegistry['course-test'].entries['new-a'].state,'processed');
 const before=JSON.stringify(st);
 await run('src/registry/observe-existing.js',{...context,selectionMode:'manual_test_override',courseWorkId:'history-a'},st);
 assert.equal(JSON.stringify(st),before);
});
await test('Bootstrap snapshot survives preparation for import, AI configuration and unrelated nodes preserved',async()=>{
 const {execFileSync}=await import('node:child_process');const os=await import('node:os');const path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-registry-test-'));
 try {
 const original=structuredClone(workflow);original.id='existing-test-id';original.nodes.push({id:'custom-error',name:'Custom Error',type:'n8n-nodes-base.noOp',parameters:{}});
 const originalPath=path.join(dir,'original.json'), snapshotPath=path.join(dir,'snapshot.json'), outputPath=path.join(dir,'prepared.json');
 fs.writeFileSync(originalPath,JSON.stringify([original]));fs.writeFileSync(snapshotPath,JSON.stringify(await select(historical,{}, {bootstrapHistorical:true})));
 execFileSync(process.execPath,['tools/prepare-install.mjs',originalPath,outputPath,snapshotPath]);
 const prepared=JSON.parse(fs.readFileSync(outputPath))[0];assert.equal(prepared.active,false);assert.equal(prepared.id,original.id);
 assert.equal(Object.keys(prepared.staticData.global.classroomRegistry['course-test'].entries).length,3);
 assert.ok(prepared.nodes.some(n=>n.name==='Custom Error'));
 for(const name of ['Gemini - Plan','LLM Request','Validate Final Plan','Parse Structured Plan']) assert.deepEqual(prepared.nodes.find(n=>n.name===name).parameters,original.nodes.find(n=>n.name===name).parameters);
 fs.writeFileSync(originalPath,JSON.stringify([prepared]));
 assert.throws(()=>execFileSync(process.execPath,['tools/prepare-install.mjs',originalPath,outputPath,snapshotPath],{stdio:'pipe'}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
console.log(`OK ${count} total selection/gap/assignment/evidence checks`);
