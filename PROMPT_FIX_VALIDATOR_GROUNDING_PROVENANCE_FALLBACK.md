# Prompt maestro — Corregir bugs críticos de validación, grounding, provenance y fallback LLM

Actúa como un **Senior Automation Engineer / Backend Engineer especializado en n8n, Gemini API, OpenRouter, validación JSON, JSON Schema, provenance, grounding, sistemas idempotentes y máquinas de estados tolerantes a fallos**.

Debes **auditar, corregir y validar el workflow existente**.

## Objetivo principal

Corregir los bugs críticos actuales de la capa LLM y validación sin reconstruir el workflow desde cero.

Actualmente el flujo puede terminar en `FAIL_CLOSED` aunque Gemini produzca una respuesta estructuralmente correcta, porque el validator está marcando como no respaldadas afirmaciones que sí tienen `provenance`.

También existe una clasificación incorrecta de errores y se están desperdiciando llamadas a los fallbacks de OpenRouter cuando el problema real está en el validator.

La arquitectura deseada debe seguir siendo:

```text
Gemini Primary
    │
    ├── respuesta válida → CONTINUE
    │
    ├── PARSE/SCHEMA real → Gemini Repair
    │
    └── TRANSPORT/PROVIDER error → Qwen
                                      │
                                      ├── válido → CONTINUE
                                      └── error → GLM
                                                   │
                                                   ├── válido → CONTINUE
                                                   └── error → FAIL CLOSED
```

Pero la definición de "válido" debe corregirse.

El workflow debe permanecer en:

```text
mode = dry-run
mutationsPerformed = false
```

hasta terminar todas las pruebas.

NO habilites producción.

---

# 1. NO reconstruyas el workflow

Antes de modificar nada:

1. inspecciona todos los nodos del flujo LLM;
2. identifica dónde se construye el prompt;
3. identifica dónde se parsea el JSON;
4. identifica dónde se valida el schema;
5. identifica dónde se valida grounding/provenance;
6. identifica dónde se decide Gemini Repair;
7. identifica dónde se ejecutan Qwen y GLM;
8. identifica dónde se construye `failureReason`;
9. identifica dónde se ejecuta `Fail Closed - Invalid Plan`.

Modifica únicamente lo necesario.

No tocar innecesariamente:

- Google Classroom;
- Google Drive;
- GitHub;
- selección de actividad;
- asignación de integrantes;
- Gap Analysis;
- topological sort;
- creación de Issues;
- labels;
- lógica académica.

---

# 2. Problema crítico actual

El workflow está produciendo resultados equivalentes a:

```text
Gemini
HTTP 200 ✅
JSON parseable ✅
Schema válido ✅
Provenance presente ✅
Grounding validator ❌
↓
Gemini Repair
↓
OpenRouter/Qwen
↓
OpenRouter/GLM
↓
FAIL CLOSED
```

Esto es incorrecto cuando el problema es que el validator no sabe resolver correctamente el provenance ya generado.

Ejemplos reales del output de Gemini:

```json
{
  "claim": "PASO 2. DEFINIR EN docs/requirements.md ...",
  "source": "classroom",
  "evidence": "classroom.description"
}
```

y también:

```json
{
  "claim": "El curso usa Next.js y una trayectoria PWA...",
  "source": "classroom",
  "evidence": "classroom.description"
}
```

y:

```json
{
  "claim": "Ejecuten: npm run verify ... Genera reports/verification.json.",
  "source": "classroom",
  "evidence": "classroom.description"
}
```

Sin embargo el validator posteriormente marca como:

```text
claim sin respaldo verificable
detalle técnico sin provenance
```

cuando las referencias sí están declaradas.

Debes corregir esa inconsistencia.

---

# 3. Separar claramente las capas de validación

Implementar estados separados.

No usar un único:

```text
validationStatus = invalid
```

para todo.

Quiero como mínimo:

```text
transportStatus
providerStatus
parseStatus
schemaStatus
groundingStatus
semanticStatus
dependencyStatus
finalPlanStatus
```

Ejemplo exitoso:

```json
{
  "transportStatus": "ok",
  "providerStatus": "ok",
  "parseStatus": "valid",
  "schemaStatus": "valid",
  "groundingStatus": "valid",
  "semanticStatus": "valid",
  "dependencyStatus": "valid",
  "finalPlanStatus": "accepted"
}
```

---

# 4. Nueva taxonomía de errores

Implementar al menos:

```text
TRANSPORT_ERROR
PROVIDER_ERROR
PARSE_ERROR
SCHEMA_ERROR
GROUNDING_ERROR
PROVENANCE_ERROR
SEMANTIC_ERROR
DEPENDENCY_ERROR
VALIDATOR_INTERNAL_ERROR
```

## TRANSPORT_ERROR

Ejemplos:

```text
timeout
network error
HTTP 429
HTTP 5xx
```

## PROVIDER_ERROR

Ejemplos:

```text
HTTP 401
authentication error
provider returned error
unsupported parameter
```

## PARSE_ERROR

La respuesta no puede convertirse a JSON.

## SCHEMA_ERROR

JSON parseable pero incumple el schema estructural.

## GROUNDING_ERROR

El claim o detalle técnico no está realmente respaldado por una fuente válida.

## PROVENANCE_ERROR

El modelo declara provenance, pero la referencia:

```text
classroom.description
repository.path:...
starter.file:...
```

no puede resolverse correctamente.

## VALIDATOR_INTERNAL_ERROR

El validator declara que algo no tiene provenance cuando sí existe una entrada resoluble y suficiente.

Este caso NO debe activar fallbacks LLM automáticamente.

---

# 5. Corregir clasificación actual

Ahora mismo pueden ocurrir casos así:

```text
schemaStatus = valid
errorType = SCHEMA_ERROR
```

Eso es incorrecto.

Regla obligatoria:

```text
si schemaStatus == valid
→ nunca usar SCHEMA_ERROR
```

Si el fallo ocurre en grounding:

```text
errorType = GROUNDING_ERROR
```

Si el problema es que una referencia no se pudo resolver:

```text
errorType = PROVENANCE_ERROR
```

Si el validator entra en contradicción con la evidencia:

```text
errorType = VALIDATOR_INTERNAL_ERROR
```

---

# 6. Evidence Registry central

Crear o corregir un registry normalizado de fuentes.

Debe existir una estructura equivalente a:

```json
{
  "classroom.description": {
    "sourceType": "classroom",
    "content": "..."
  },
  "repository.path:package.json": {
    "sourceType": "repository",
    "content": "..."
  },
  "repository.path:docs/requirements.md": {
    "sourceType": "repository",
    "content": "..."
  },
  "starter.file:individual.md": {
    "sourceType": "starter",
    "content": "..."
  }
}
```

No depender de strings ambiguos sin resolución.

Toda referencia declarada en:

```text
issue.provenance[].evidence
```

debe intentar resolverse contra este registry.

---

# 7. Resolver correctamente classroom.description

Si el modelo genera:

```json
{
  "source": "classroom",
  "evidence": "classroom.description"
}
```

el validator debe:

1. encontrar exactamente `classroom.description`;
2. obtener el texto real de la actividad;
3. verificar si la evidencia respalda razonablemente el claim;
4. marcarlo como grounded si corresponde.

No debe marcar automáticamente:

```text
claim sin respaldo verificable
```

simplemente porque el claim no coincide carácter por carácter con el texto original.

Permitir equivalencia semántica razonable.

---

# 8. Resolver repository.path:*

Ejemplo:

```json
{
  "claim": "package.json",
  "source": "repository",
  "evidence": "repository.path:package.json"
}
```

Debe poder resolverse contra el snapshot/contexto del repo.

Si el archivo existe:

```text
repository.path:package.json
```

es una fuente válida.

También:

```text
repository.path:docs/requirements.md
repository.path:docs/decision-record.md
repository.path:public-tests/check.sh
```

---

# 9. Resolver starter.file:*

Ejemplo:

```text
starter.file:individual.md
```

Debe apuntar al archivo real extraído/analizado del starter.

No usar una referencia simbólica sin contenido asociado.

---

# 10. Provenance a nivel Issue debe respaldar usos repetidos

Este cambio es CRÍTICO.

Actualmente parece que el validator exige provenance independiente para cada aparición de un detalle técnico en:

```text
sections.contexto
sections.objetivoTecnico[]
sections.alcance[]
sections.pasosSugeridos[]
sections.criteriosAceptacion[]
sections.pruebas[]
sections.evidenciaIndividual[]
sections.definitionOfDone[]
```

No quiero eso.

Si dentro de la misma Issue existe:

```json
{
  "claim": "Ejecuten npm run verify ... genera reports/verification.json",
  "source": "classroom",
  "evidence": "classroom.description"
}
```

y esa referencia fue verificada como válida, entonces usos equivalentes como:

```text
Ejecutar npm run verify
Documentar npm run verify
Verificar reports/verification.json
Registrar el resultado de npm run verify
```

pueden reutilizar ese provenance.

No exigir duplicar el mismo provenance 5 veces.

---

# 11. Matching semántico entre sections y provenance

Crear una función conceptual equivalente a:

```javascript
isSectionDetailGrounded(detail, issue.provenance, evidenceRegistry)
```

Debe considerar:

1. coincidencia exacta;
2. coincidencia normalizada;
3. inclusión de términos técnicos;
4. relación semántica clara entre claim y detalle;
5. fuente resoluble;
6. contenido real de la fuente.

Ejemplo:

Provenance:

```text
"Ejecuten npm run verify ... genera reports/verification.json"
```

Detalle:

```text
"Ejecutar npm run verify para generar reports/verification.json."
```

Debe considerarse respaldado.

---

# 12. No relajar grounding real

NO quiero que simplemente aceptes todo si existe cualquier provenance.

El validator debe seguir rechazando claims inventados.

Ejemplo:

Provenance:

```text
Classroom menciona npm run verify
```

Detalle:

```text
npm run deploy:prod --force
```

Debe fallar.

El reuse de provenance sólo aplica cuando el detalle es claramente equivalente o subconjunto del claim respaldado.

---

# 13. Evitar falsos positivos de "detalle técnico sin provenance"

Actualmente el validator puede marcar:

```text
Next.js
npm run verify
evidence/individual.md
reports/verification.json
docs/requirements.md
```

como huérfanos aunque la Issue sí contiene provenance.

Corregir el algoritmo para:

```text
detalle técnico detectado
↓
buscar provenance compatible dentro de la misma Issue
↓
resolver evidence
↓
validar respaldo
↓
si existe → grounded
↓
si no existe → error real
```

---

# 14. Introducir sourceId normalizado

Recomiendo agregar internamente:

```json
{
  "sourceId": "classroom.description"
}
```

además de:

```json
{
  "source": "classroom",
  "evidence": "classroom.description"
}
```

Ejemplo:

```json
{
  "claim": "Ejecuten npm run verify",
  "source": "classroom",
  "sourceId": "classroom.description",
  "evidence": "classroom.description"
}
```

Esto reduce ambigüedad.

No es obligatorio exponer `sourceId` en GitHub.

---

# 15. Separar schema de grounding

El pipeline debe ser exactamente:

```text
raw response
↓
JSON.parse
↓
Schema Validation
↓
Grounding Validation
↓
Semantic Validation
↓
Dependency Validation
↓
PLAN_ACCEPTED
```

No mezclar:

```text
SCHEMA_ERROR
```

con problemas de grounding.

---

# 16. Nueva definición de "Gemini pasó"

Gemini sólo se considera completamente exitoso cuando:

```text
HTTP/provider OK
+
parseStatus = valid
+
schemaStatus = valid
+
groundingStatus = valid
+
semanticStatus = valid
+
dependencyStatus = valid
```

Entonces:

```text
PLAN_ACCEPTED
```

y OpenRouter NO debe ejecutarse.

---

# 17. Gemini Repair sólo para errores realmente reparables por LLM

Usar Gemini Repair cuando:

```text
PARSE_ERROR
SCHEMA_ERROR
GROUNDING_ERROR real causado por el output
SEMANTIC_ERROR reparable
```

Ejemplo:

```text
criteriosAceptacion necesita mínimo 2 elementos
```

Puede requerir repair.

Pero NO usar Gemini Repair cuando exista:

```text
VALIDATOR_INTERNAL_ERROR
```

porque cambiar de output no corrige un bug interno del validator.

---

# 18. No gastar fallbacks por errores internos

Si ocurre:

```text
VALIDATOR_INTERNAL_ERROR
```

el workflow debe detenerse con algo equivalente a:

```text
FAIL_VALIDATOR
mutationsPerformed = false
```

NO ejecutar:

```text
Gemini Repair
Qwen
GLM
```

porque ningún modelo debe compensar un validator roto.

---

# 19. Qwen como fallback #1

Qwen sólo debe ejecutarse cuando:

```text
Gemini provider/transport error
```

o:

```text
Gemini + Repair realmente no pudieron producir un plan válido
```

No usar Qwen por un bug interno de provenance resolver.

Modelo:

```text
qwen/qwen3.8-27b:free
```

---

# 20. GLM como fallback #2

GLM sólo debe ejecutarse si Qwen falla.

Modelo:

```text
z-ai/glm-5.2:free
```

Mantener la configuración previamente corregida:

- NO enviar `response_format` si la serving lane no soporta grammar;
- usar prompt estricto;
- parsear localmente;
- validar localmente.

---

# 21. Manejo correcto de 429

Clasificar:

```text
HTTP 429
```

como:

```text
TRANSPORT_ERROR
```

o:

```text
PROVIDER_ERROR
```

pero nunca:

```text
SCHEMA_ERROR
```

Flujo:

```text
Qwen 429
→ GLM
```

Si GLM 429:

```text
→ FAIL CLOSED
```

---

# 22. Fail Closed sólo al final real

`FAIL_CLOSED` debe ocurrir únicamente cuando:

```text
Gemini no puede producir plan válido
+
Repair no resuelve cuando corresponde
+
Qwen falla
+
GLM falla
```

o cuando haya un error crítico no recuperable.

No usar `FAIL_CLOSED` por un falso negativo del validator.

---

# 23. Crear FAIL_VALIDATOR separado

Agregar, si la arquitectura lo permite, un estado:

```text
FAIL_VALIDATOR
```

para inconsistencias internas.

Ejemplo:

```json
{
  "executionResult": "fail_validator",
  "mutationsPerformed": false,
  "errorType": "VALIDATOR_INTERNAL_ERROR",
  "message": "El validator marcó un detalle como no grounded aunque existe provenance resoluble."
}
```

Esto permite diferenciar:

```text
LLM falló
```

de:

```text
validator falló
```

---

# 24. Detectar contradicciones internas automáticamente

Añadir checks.

Ejemplo:

```text
schemaStatus == valid
AND errorType == SCHEMA_ERROR
```

→ inconsistencia interna.

Otro:

```text
detail = "npm run verify"
provenance contiene claim con "npm run verify"
sourceId resoluble
pero validator dice "sin provenance"
```

→ `VALIDATOR_INTERNAL_ERROR`.

Otro:

```text
groundingStatus = invalid
pero validationErrors está vacío
```

→ error interno.

---

# 25. Normalización de texto para matching

Antes de comparar:

- lowercase;
- trim;
- colapsar whitespace;
- remover puntuación no significativa;
- normalizar acentos si es necesario;
- preservar comandos/rutas como tokens;
- preservar nombres técnicos.

Ejemplo:

```text
"npm run verify."
```

y:

```text
"npm run verify"
```

deben ser equivalentes.

---

# 26. Matching de comandos y rutas

Los comandos y paths deben compararse como entidades técnicas.

Ejemplos:

```text
npm run verify
reports/verification.json
docs/requirements.md
docs/decision-record.md
evidence/individual.md
Next.js
```

Si aparecen en un provenance válido de la misma Issue, los usos equivalentes deben considerarse grounded.

---

# 27. No inventar provenance automático

No quiero una solución como:

```text
si aparece un detalle técnico
→ crear automáticamente provenance ficticio
```

Eso está prohibido.

Sólo aceptar provenance respaldado por fuentes reales.

---

# 28. Preserve original sources

El resolver debe conservar el origen real:

```text
classroom
repository
starter
workflow
```

No convertir todo a:

```text
source = generated
```

---

# 29. Grounding report por Issue

En dry-run, agregar internamente algo equivalente a:

```json
{
  "groundingReport": {
    "status": "valid",
    "validatedClaims": 8,
    "validatedTechnicalDetails": 12,
    "unresolvedClaims": [],
    "unresolvedTechnicalDetails": []
  }
}
```

En caso de error:

```json
{
  "groundingReport": {
    "status": "invalid",
    "unresolvedClaims": [
      {
        "text": "...",
        "reason": "No matching provenance"
      }
    ]
  }
}
```

---

# 30. Registrar por qué un detalle quedó grounded

Para debugging, permitir algo equivalente a:

```json
{
  "detail": "npm run verify",
  "matchedProvenance": "Ejecuten: npm run verify ...",
  "sourceId": "classroom.description",
  "matchType": "technical-token-match",
  "grounded": true
}
```

Esto debe existir en logs/dry-run, no necesariamente en GitHub.

---

# 31. No incluir secretos ni texto excesivo

No loggear:

- API keys;
- auth headers;
- secretos.

No es necesario duplicar todo `classroom.description` en cada error.

Usar `sourceId` y snippets cortos cuando sea suficiente.

---

# 32. Mejorar failureReason

Quiero estructuras claras.

Ejemplo grounding real:

```json
{
  "errorType": "GROUNDING_ERROR",
  "provider": "gemini",
  "model": "gemini-3.6-flash",
  "httpStatus": 200,
  "message": "1 detalle técnico no tiene evidencia verificable",
  "validationErrors": [
    {
      "issueKey": "x",
      "detail": "npm run deploy",
      "reason": "No matching provenance"
    }
  ]
}
```

Ejemplo validator interno:

```json
{
  "errorType": "VALIDATOR_INTERNAL_ERROR",
  "message": "Provenance resoluble ignorado por el validator",
  "details": [
    {
      "issueKey": "evidencia-verificacion-individual",
      "detail": "npm run verify",
      "matchedSourceId": "classroom.description"
    }
  ]
}
```

---

# 33. Corregir stateHistory

El historial debe reflejar correctamente:

```text
GEMINI_REQUEST
GEMINI_PARSE
GEMINI_SCHEMA_VALIDATE
GEMINI_GROUNDING_VALIDATE
PLAN_ACCEPTED
```

o:

```text
GEMINI_REQUEST
GEMINI_PARSE
GEMINI_SCHEMA_VALIDATE
GEMINI_GROUNDING_VALIDATE
GEMINI_REPAIR_REQUEST
...
```

o:

```text
...
VALIDATOR_INTERNAL_ERROR
FAIL_VALIDATOR
```

No mezclar eventos.

---

# 34. Tests críticos obligatorios

## Test A — Provenance reutilizable

Provenance:

```json
{
  "claim": "Ejecuten npm run verify y genera reports/verification.json",
  "evidence": "classroom.description"
}
```

Sections contienen:

```text
Ejecutar npm run verify
Verificar reports/verification.json
Documentar el resultado de npm run verify
```

Esperado:

```text
grounded = true
```

## Test B — Next.js respaldado

Provenance:

```text
"El curso usa Next.js y trayectoria PWA"
```

Section:

```text
Justificar el uso de Next.js
```

Esperado:

```text
grounded = true
```

## Test C — Path respaldado

Provenance:

```text
repository.path:docs/requirements.md
```

Section:

```text
Editar docs/requirements.md
```

Esperado:

```text
grounded = true
```

## Test D — Starter respaldado

Provenance:

```text
starter.file:individual.md
```

Esperado:

```text
grounded = true
```

si la referencia existe realmente.

## Test E — Claim realmente inventado

Provenance sólo menciona:

```text
npm run verify
```

Section introduce:

```text
npm run deploy:prod
```

Esperado:

```text
GROUNDING_ERROR
```

## Test F — Inconsistencia interna

Schema:

```text
schemaStatus = valid
```

pero código intenta:

```text
SCHEMA_ERROR
```

Esperado:

```text
VALIDATOR_INTERNAL_ERROR
```

## Test G — No fallback por bug interno

Forzar un caso donde la evidencia existe pero el matcher falla.

Esperado:

```text
FAIL_VALIDATOR
```

y NO:

```text
Qwen
GLM
```

## Test H — Gemini totalmente válido

Esperado:

```text
Gemini
→ parse valid
→ schema valid
→ grounding valid
→ semantic valid
→ dependency valid
→ CONTINUE
```

OpenRouter NO ejecutado.

## Test I — Gemini schema realmente inválido

Esperado:

```text
Gemini
→ SCHEMA_ERROR
→ Gemini Repair
```

## Test J — Gemini Repair válido

Esperado:

```text
Repair
→ valid
→ CONTINUE
```

OpenRouter NO ejecutado.

## Test K — Gemini Repair falla

Esperado:

```text
→ Qwen
```

## Test L — Qwen 429

Esperado:

```text
TRANSPORT_ERROR
→ GLM
```

## Test M — GLM válido

Esperado:

```text
GLM
→ parse
→ schema
→ grounding
→ CONTINUE
```

## Test N — Todos los modelos fallan

Esperado:

```text
FAIL_CLOSED
mutationsPerformed=false
```

---

# 35. Caso real que debes usar para validar

Usa como fixture un plan equivalente al actual donde existe:

```text
docs/requirements.md
docs/decision-record.md
evidence/individual.md
npm run verify
reports/verification.json
Next.js
```

y donde estos términos ya tienen provenance explícito.

El validator corregido debe reconocerlos correctamente.

---

# 36. No degradar seguridad

Aunque corrijamos falsos negativos, mantener:

```text
no inventar requisitos
no inventar comandos
no inventar versiones
no inventar paths
no inventar endpoints
no inventar criterios
```

Si un detalle no puede respaldarse realmente:

```text
GROUNDING_ERROR
```

---

# 37. Arquitectura final esperada

```text
                         GEMINI
                            │
                      Provider OK?
                   ┌────────┴────────┐
                  no                yes
                  │                  │
                  ▼                  ▼
                QWEN               PARSE
                                     │
                                 Schema
                                     │
                                 Grounding
                                     │
                                 Semantic
                                     │
                               Dependencies
                                     │
                       ┌─────────────┴─────────────┐
                     VALID                     INVALID
                       │                           │
                       ▼                           ▼
                   CONTINUE                clasificar error
                                                   │
                  ┌────────────────────────────────┼───────────────────────────────┐
                  │                                │                               │
            SCHEMA/PARSE                    GROUNDING REAL              VALIDATOR INTERNAL
                  │                                │                               │
                  ▼                                ▼                               ▼
            GEMINI REPAIR                   GEMINI REPAIR                  FAIL_VALIDATOR
                  │                                │
             si falla                           si falla
                  └──────────────┬─────────────────┘
                                 ▼
                                QWEN
                                 │
                            si falla
                                 ▼
                                GLM
                                 │
                            si falla
                                 ▼
                            FAIL CLOSED
```

---

# 38. Resultado esperado

No te limites a describir una solución.

Debes:

1. inspeccionar el workflow;
2. localizar la causa exacta de los falsos negativos;
3. modificar los nodos responsables;
4. corregir el evidence registry;
5. corregir el provenance resolver;
6. corregir el matcher de sections;
7. separar schema y grounding;
8. corregir `errorType`;
9. añadir `VALIDATOR_INTERNAL_ERROR`;
10. impedir fallbacks innecesarios;
11. añadir `FAIL_VALIDATOR` si es viable;
12. ejecutar Tests A-N;
13. mantener `dry-run`.

---

# 39. Informe final que debes entregarme

Al terminar reporta:

1. causa raíz;
2. nodos afectados;
3. lógica anterior;
4. lógica nueva;
5. estructura del evidence registry;
6. cómo resuelves `classroom.description`;
7. cómo resuelves `repository.path:*`;
8. cómo resuelves `starter.file:*`;
9. cómo reutilizas provenance dentro de la Issue;
10. cómo haces semantic matching;
11. cómo detectas un grounding realmente inválido;
12. cómo detectas un bug interno del validator;
13. cómo cambió `failureReason`;
14. cómo cambió `stateHistory`;
15. cuándo se ejecuta Gemini Repair;
16. cuándo se ejecuta Qwen;
17. cuándo se ejecuta GLM;
18. cuándo ocurre `FAIL_VALIDATOR`;
19. cuándo ocurre `FAIL_CLOSED`;
20. resultados de Tests A-N;
21. ejemplo de un plan Gemini aceptado sin tocar OpenRouter;
22. ejemplo de un grounding inválido real;
23. ejemplo de un validator internal error;
24. cualquier riesgo restante.

No habilites producción.

Mantén:

```text
mode = dry-run
mutationsPerformed = false
```

hasta que yo revise el resultado.
