import assert from 'node:assert/strict';
import fs from 'node:fs';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function runLlmOrchestrationTests({ workflow, schema, llmContext, issueFor }) {
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
  const env = { AUTOMATION_MODE: 'live' }; // The review lock must override even a live environment.
  const context = {
    ...llmContext, schema, geminiSchema: schema, systemPrompt: 'Preserva las fuentes originales.',
    userPrompt: JSON.stringify({ groundingCatalog: llmContext.groundingCatalog }), automationMode: 'live',
  };
  const validPlan = { issues: [issueFor('offline-sync', 'hard'), issueFor('offline-tests', 'easy', 'testing', { dependsOn: ['offline-sync'] })] };
  const invalidPlan = structuredClone(validPlan);
  invalidPlan.issues[1].sections.criteriosAceptacion = ['El requisito solicitado queda cubierto'];
  const json = (value) => typeof value === 'string' ? value : JSON.stringify(value);
  const gemini = (value, finishReason = 'STOP') => ({ statusCode: 200, body: { candidates: [{ content: { parts: [{ text: json(value) }] }, finishReason }] } });
  const router = (value) => ({ statusCode: 200, body: { choices: [{ message: { content: json(value) }, finish_reason: 'stop' }] } });
  const httpError = (status) => ({ statusCode: status, body: { error: { message: 'Provider rejected request' } } });
  const expression = (source, data) => new Function('$json', '$env', `return (${source.slice(3, -2).trim()});`)(data, env);

  // Execute the generated workflow's actual code, expressions and edges; only HTTP is stubbed.
  async function run(responses) {
    let name = 'LLM Request';
    let data = structuredClone(context);
    const visited = [];
    const outputs = {};
    const requests = [];
    while (name) {
      assert.ok(!visited.includes(name), `Ciclo inesperado: ${name}`);
      visited.push(name);
      assert.ok(visited.length < 100);
      const node = nodes.get(name);
      assert.ok(node, name);
      let port = 0;
      if (node.type === 'n8n-nodes-base.httpRequest') {
        assert.ok(['Gemini - Plan', 'Gemini - Repair Once', 'OpenRouter - Chat Completion', 'OpenRouter - GLM'].includes(name), `HTTP no autorizado: ${name}`);
        assert.equal(node.retryOnFail, false);
        assert.equal(node.onError, 'continueRegularOutput');
        assert.equal(node.parameters.options.response.response.neverError, true);
        assert.equal(node.parameters.options.response.response.fullResponse, true);
        const stage = data.llmAttempt.stage;
        const payload = expression(node.parameters.jsonBody, data);
        requests.push({ stage, payload: structuredClone(payload) });
        assert.ok(Object.hasOwn(responses, stage), `LLM adicional no esperado: ${stage}`);
        data = structuredClone(responses[stage]);
      } else if (node.type === 'n8n-nodes-base.code') {
        const fn = new AsyncFunction('$json', '$env', '$', node.parameters.jsCode);
        try {
          const result = await fn(data, env, (ref) => {
            assert.ok(outputs[ref], `Contexto de intento ausente: ${ref}`);
            return { item: { json: structuredClone(outputs[ref]) } };
          });
          assert.equal(result.length, 1);
          data = result[0].json;
        } catch (error) {
          if (name !== 'Fail Closed - Invalid Plan' && name !== 'Fail Validator - Invalid Plan') throw error;
          const marker = name === 'Fail Closed - Invalid Plan' ? 'FAIL_CLOSED: ' : 'FAIL_VALIDATOR: ';
          assert.ok(error.message.startsWith(marker), `Prefijo inesperado: ${error.message.slice(0, 60)}`);
          const failure = JSON.parse(error.message.slice(marker.length));
          assert.equal(failure.mode, 'dry-run');
          assert.equal(failure.mutationsPerformed, false);
          return { data, failure, visited, requests, outputs, responses };
        }
      } else if (node.type === 'n8n-nodes-base.if') {
        const condition = node.parameters.conditions.conditions[0];
        const value = expression(condition.leftValue, data);
        const matched = condition.operator.type === 'boolean' ? value === true : value === condition.rightValue;
        port = matched ? 0 : 1;
      } else throw new Error(`Nodo no esperado: ${name}`);
      outputs[name] = structuredClone(data);
      const edges = workflow.connections[name]?.main?.[port] || [];
      if (name === 'Exact Dry-Run Preview') {
        assert.equal(data.mode, 'dry-run');
        assert.equal(data.mutationsPerformed, false);
        assert.equal(edges.length, 0);
        return { data, visited, requests, outputs, responses };
      }
      assert.equal(edges.length, 1, `Ruta incompleta o paralela: ${name}`);
      name = edges[0].node;
    }
    throw new Error('Falta resultado terminal');
  }
  const chain = (result) => result.requests.map((entry) => entry.stage);
  const obs = (result) => result.data.aiObservability;
  const examples = {};
  const runtimeCases = {};
  const record = (id, result) => {
    runtimeCases[id] = { context, responses: result.responses, expectedChain: chain(result), failClosed: Boolean(result.failure) };
    examples[id] = {
      mode: 'dry-run', mutationsPerformed: false,
      stateHistory: result.data.stateHistory,
      execution: result.data.aiExecution,
      attempts: obs(result),
      ...(result.failure ? { failure: result.failure } : { plan: result.data.issuesThatWouldBeCreated }),
    };
    console.log(`PASS ${id}: ${chain(result).join(' → ')} → ${result.failure ? 'FAIL_CLOSED' : 'CONTINUE (dry-run)'}`);
  };
  const a = await run({ gemini: gemini(validPlan) });
  assert.deepEqual(chain(a), ['gemini']);
  assert.equal(obs(a)[0].parseStatus, 'valid');
  assert.equal(obs(a)[0].schemaStatus, 'valid');
  assert.equal(a.data.aiExecution.fallbackUsed, false);
  record('A', a);

  const b = await run({ gemini: gemini(invalidPlan), gemini_repair: gemini(validPlan) });
  assert.deepEqual(chain(b), ['gemini', 'gemini_repair']);
  assert.equal(obs(b)[0].errorType, 'SCHEMA_ERROR');
  assert.deepEqual(obs(b)[0].failureReason.validationErrors, ['$.issues[1].sections.criteriosAceptacion: mínimo 2 elementos']);
  assert.equal(b.data.aiExecution.repairUsed, true);
  assert.equal(b.data.aiExecution.fallbackUsed, false);
  const repairPayload = b.requests[1].payload;
  assert.equal(repairPayload.contents[0].parts[0].text, context.userPrompt);
  assert.equal(repairPayload.contents[1].parts[0].text, JSON.stringify(invalidPlan));
  assert.ok(repairPayload.contents[2].parts[0].text.includes('$.issues[1].sections.criteriosAceptacion: mínimo 2 elementos'));
  assert.ok(repairPayload.systemInstruction.parts[0].text.includes(JSON.stringify(schema)));
  assert.deepEqual(repairPayload.generationConfig.responseJsonSchema, schema);
  record('B', b);

  const normalizable = structuredClone(validPlan);
  normalizable.issues[0].key = 'offline_sync';
  normalizable.issues[1].dependsOn = ['offline_sync'];
  const c = await run({ gemini: gemini(normalizable) });
  assert.deepEqual(chain(c), ['gemini']);
  assert.equal(obs(c)[0].identifierNormalizations.length, 2);
  assert.equal(c.data.issuesThatWouldBeCreated.some((issue) => issue.key === 'offline-sync'), true);
  assert.ok(c.data.issuesThatWouldBeCreated.find((issue) => issue.key === 'offline-tests').dependsOn.includes('offline-sync'));
  assert.deepEqual(c.outputs['Parse Structured Plan'].normalizedResponse.parsed.issues.map((issue) => issue.sections), normalizable.issues.map((issue) => issue.sections));
  record('C', c);

  const d = await run({ gemini: gemini(invalidPlan), gemini_repair: gemini(invalidPlan), qwen: router(validPlan) });
  assert.deepEqual(chain(d), ['gemini', 'gemini_repair', 'qwen']);
  assert.equal(d.data.aiExecution.resolvedModel, 'qwen/qwen3.8-27b:free');
  assert.equal(d.data.aiExecution.repairUsed, true);
  record('D', d);

  const e = await run({ gemini: httpError(429), qwen: router(validPlan) });
  assert.deepEqual(chain(e), ['gemini', 'qwen']);
  assert.equal(obs(e)[0].errorType, 'TRANSPORT_ERROR');
  assert.equal(obs(e)[0].schemaStatus, 'not_attempted');
  assert.equal(e.data.aiExecution.repairUsed, false);
  record('E', e);

  const f = await run({ gemini: httpError(401), qwen: router(validPlan) });
  assert.deepEqual(chain(f), ['gemini', 'qwen']);
  const qwenPayload = f.requests[1].payload;
  assert.equal(qwenPayload.response_format.type, 'json_schema');
  assert.equal(qwenPayload.provider.require_parameters, true);
  assert.equal(obs(f)[1].validationStatus, 'valid');
  record('F', f);

  const g = await run({ gemini: httpError(503), qwen: httpError(429), glm: router(validPlan) });
  assert.deepEqual(chain(g), ['gemini', 'qwen', 'glm']);
  assert.equal(obs(g)[1].errorType, 'TRANSPORT_ERROR');
  assert.equal(obs(g)[1].failureReason.message, 'Provider rate limit');
  assert.equal(obs(g)[1].failureReason.validationErrors, undefined);
  record('G', g);

  const h = await run({ gemini: httpError(503), qwen: httpError(400), glm: router('```json\n' + JSON.stringify(validPlan) + '\n```') });
  const glmPayload = h.requests[2].payload;
  for (const key of ['response_format', 'json_schema', 'json_object', 'tool_choice', 'tools']) assert.equal(Object.hasOwn(glmPayload, key), false);
  assert.deepEqual(glmPayload.messages, h.requests[1].payload.messages);
  assert.equal(glmPayload.model, 'z-ai/glm-5.2:free');
  assert.equal(obs(h)[2].parseStatus, 'valid');
  assert.equal(obs(h)[2].schemaStatus, 'valid');
  record('H', h);

  // Regression for the submitted payload; this is not a claim about a live provider lane.
  assert.equal('response_format' in glmPayload || 'tool_choice' in glmPayload, false, 'grammar_not_supported trigger');
  assert.match(glmPayload.messages[0].content, /Return ONLY valid JSON/);
  assert.ok(glmPayload.messages[0].content.includes(JSON.stringify(schema)));
  console.log('PASS I: GLM payload omite parámetros que activan grammar (regresión local)');

  const j = await run({ gemini: httpError(401), qwen: httpError(429), glm: router('invalid JSON') });
  assert.deepEqual(chain(j), ['gemini', 'qwen', 'glm']);
  assert.equal(j.failure.executionResult, 'fail_closed');
  assert.deepEqual(j.failure.attempts.map((entry) => entry.errorType), ['PROVIDER_ERROR', 'TRANSPORT_ERROR', 'PARSE_ERROR']);
  assert.equal(j.visited.includes('Plan and Topological Sort'), false);
  record('J', j);

  // Additional boundary cases, all executed through the generated graph.
  for (const response of [
    { error: { code: 'ETIMEDOUT', message: 'Request timed out' } },
    { error: 'ECONNRESET network error' }, httpError(500), httpError(408),
  ]) {
    const result = await run({ gemini: response, qwen: router(validPlan) });
    assert.deepEqual(chain(result), ['gemini', 'qwen']);
    assert.equal(obs(result)[0].errorType, 'TRANSPORT_ERROR');
  }
  const parseRepair = await run({ gemini: gemini('{bad'), gemini_repair: gemini(validPlan) });
  assert.deepEqual(chain(parseRepair), ['gemini', 'gemini_repair']);
  for (const response of [router('{bad'), router(invalidPlan), httpError(500), { error: 'timeout' }]) {
    const result = await run({ gemini: httpError(401), qwen: response, glm: router(validPlan) });
    assert.deepEqual(chain(result), ['gemini', 'qwen', 'glm']);
  }
  const four = await run({ gemini: gemini(invalidPlan), gemini_repair: gemini('{bad'), qwen: httpError(429), glm: router('{bad') });
  assert.equal(four.failure.attemptCount, 4);
  assert.deepEqual(chain(four), ['gemini', 'gemini_repair', 'qwen', 'glm']);
  const collision = structuredClone(validPlan);
  collision.issues[1].key = 'offline_sync';
  const collisionResult = await run({ gemini: gemini(collision), gemini_repair: gemini(validPlan) });
  assert.equal(obs(collisionResult)[0].errorType, 'SCHEMA_ERROR');
  assert.equal(obs(collisionResult)[0].identifierNormalizations.length, 0);
  const duplicate = structuredClone(validPlan);
  duplicate.issues[1].key = duplicate.issues[0].key;
  assert.equal(obs(await run({ gemini: gemini(duplicate), gemini_repair: gemini(validPlan) }))[0].errorType, 'SCHEMA_ERROR');
  for (const raw of ['null', '[]', '', 'Some prose ' + JSON.stringify(validPlan)]) {
    const result = await run({ gemini: gemini(raw), gemini_repair: gemini(validPlan) });
    assert.deepEqual(chain(result), ['gemini', 'gemini_repair']);
  }
  const provider200 = await run({ gemini: { ...gemini(validPlan), body: { ...gemini(validPlan).body, error: { message: 'Provider returned error' } } }, qwen: router(validPlan) });
  assert.equal(obs(provider200)[0].errorType, 'PROVIDER_ERROR');
  assert.equal(obs(await run({ gemini: gemini(validPlan, 'MAX_TOKENS'), gemini_repair: gemini(validPlan) }))[0].errorType, 'PARSE_ERROR');
  const glmInvalidSchema = await run({ gemini: httpError(401), qwen: httpError(429), glm: router(invalidPlan) });
  assert.equal(glmInvalidSchema.failure.failureReason.errorType, 'SCHEMA_ERROR');
  assert.equal(glmInvalidSchema.failure.failureReason.validationErrors.length, 1);
  const businessInvalid = structuredClone(validPlan);
  businessInvalid.issues[0].sections.pruebas = ['Ejecutar npm run invented'];
  const businessResult = await run({ gemini: gemini(businessInvalid), gemini_repair: gemini(validPlan) });
  assert.equal(obs(businessResult)[0].schemaStatus, 'valid');
  assert.equal(obs(businessResult)[0].errorType, 'GROUNDING_ERROR');
  assert.equal(obs(businessResult)[0].groundingStatus, 'invalid');
  assert.match(obs(businessResult)[0].failureReason.message, /sin provenance/);
  assert.ok(obs(businessResult)[0].failureReason.groundingErrors.length >= 1);
  assert.deepEqual(chain(businessResult), ['gemini', 'gemini_repair']);

  // Test G — provenance resoluble con matcher correcto: Gemini válido sin quemar fallbacks.
  const reusable = structuredClone(validPlan);
  const provenanceReusable = [{ claim: 'Ejecuten npm run verify y genera reports/verification.json', source: 'classroom', evidence: 'classroom.description' }];
  reusable.issues[0].provenance = provenanceReusable;
  reusable.issues[0].sections.pruebas = ['Ejecutar npm run verify'];
  reusable.issues[0].sections.criteriosAceptacion = ['npm run verify genera reports/verification.json', 'La evidencia queda registrada'];
  reusable.issues[1].provenance = provenanceReusable;
  const reuseResult = await run({ gemini: gemini(reusable) });
  assert.deepEqual(chain(reuseResult), ['gemini']);
  assert.equal(obs(reuseResult)[0].errorType, 'VALID');
  assert.equal(obs(reuseResult)[0].groundingStatus, 'valid');
  assert.equal(obs(reuseResult)[0].groundingReport.status, 'valid');
  assert.equal(reuseResult.data.aiExecution.fallbackUsed, false);
  record('G2', reuseResult);
  const repairTransport = await run({ gemini: gemini(invalidPlan), gemini_repair: httpError(429), qwen: router(validPlan) });
  assert.deepEqual(chain(repairTransport), ['gemini', 'gemini_repair', 'qwen']);
  const guard = new AsyncFunction('$json', nodes.get('Prepare Gemini Repair').parameters.jsCode);
  await assert.rejects(() => guard(d.outputs['Validate Final Plan - Repair']), /AI_STATE_INVALID/);
  const fallbackGuard = new AsyncFunction('$json', nodes.get('Prepare OpenRouter Fallback').parameters.jsCode);
  await assert.rejects(() => fallbackGuard(b.outputs['Validate Final Plan']), /AI_FALLBACK_EXHAUSTED/);
  const secretFailure = await run({ gemini: httpError(401), qwen: httpError(429), glm: { statusCode: 400, body: { error: { message: 'Bearer dummy-sensitive-token', details: { api_key: 'secret', nested: { token: 'secret' } } } } } });
  assert.equal(JSON.stringify(secretFailure.failure).includes('dummy-sensitive-token'), false);
  console.log('PASS adicionales: parse repair, colisiones, fallos de transporte, schema GLM, grounding, límite de 4 llamadas y redacción');
  if (process.env.LLM_TEST_FIXTURES_PATH) fs.writeFileSync(process.env.LLM_TEST_FIXTURES_PATH, JSON.stringify(runtimeCases));
  if (process.env.WRITE_LLM_EXAMPLES) fs.writeFileSync(new URL('../docs/LLM-ORCHESTRATION-EXAMPLES.json', import.meta.url), JSON.stringify(Object.fromEntries(['A', 'B', 'E', 'G', 'J'].map((id) => [id, examples[id]])), null, 2) + '\n');
}
