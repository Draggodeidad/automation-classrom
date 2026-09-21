# Reporte de asignación, grounding y Gap Analysis

## Resultado

El workflow existente se modificó sin cambiar sus integraciones de entrada/salida ni su identidad idempotente. Permanece inactivo y el modo recomendado continúa siendo `dry-run`; la preview declara `mutationsPerformed=false`.

## Nodos modificados

- `Build Context & Dedup`: crea `groundingCatalog` con evidencia identificable de Classroom, starter, repositorio y configuración interna; separa keys funcionales de keys operacionales al reanudar.
- `Parse Structured Plan`: conserva el contrato estructurado, ahora sin permitir que el LLM elija assignee.
- `Apply Gap Analysis` (nuevo): excluye unidades con `gapAnalysis.status=complete` y elimina dependencias ya satisfechas.
- `Enforce Operational Issues`: crea setup cuando hay starter y siempre crea la entrega final; ambas pertenecen al owner y se marcan como `internalWorkflowRequirement`.
- `Normalize Titles & Keys & Dependencies`: sigue normalizando prefijos, keys y dependencias.
- `Build GitHub Issue Bodies`: mantiene los doce encabezados existentes.
- `Validate Final Plan`: valida clasificación, pesos, Gap Analysis, provenance, detalles técnicos, DAG y tareas operacionales antes de cualquier mutación.
- `Plan and Topological Sort`: ordena el DAG y después asigna responsables mediante carga ponderada y capacidades.
- `Exact Dry-Run Preview`: expone assignee, category, difficulty, weight, riesgo, capacidades, dependencias, grounding, provenance, carga y trabajo excluido.

## Causa del reparto anterior

El LLM elegía directamente `assignee`. El validador comprobaba presencia de trabajo para cada integrante y exigía una implementación sustancial para Draggodeidad, pero no calculaba dificultad ni carga. Por eso podía aproximarse a un reparto por cantidad, forzar trabajo a un perfil no adecuado y contar setup como si fuera carga funcional.

## Clasificación y asignación nuevas

Cada requisito académico incluye:

```text
category
difficulty: easy | medium | hard
estimatedWeight: 1 | 2 | 3
risk: low | medium | high
requiresCoding
requiresRepositoryKnowledge
dependsOn
```

Después de validar el grounding y ordenar topológicamente:

- `hard`: sólo Draggodeidad o JulianDele; gana la menor carga técnica y después la menor carga funcional.
- `medium`: se prefiere JulianDele/Draggodeidad. Osbaldo sólo es elegible si la tarea es segura, de riesgo bajo y su carga justifica incluirlo.
- `easy`: se prioriza osbaldoXxC si la naturaleza es segura; cuando su carga supera el margen configurado, se balancea con los demás.

La carga funcional es la suma de `estimatedWeight` de requisitos académicos. La carga técnica suma el peso de trabajo con código, conocimiento del repositorio o categorías de implementación/integración/infraestructura. Setup y entrega tienen `functionalWeight=0` y carga operacional separada.

## Tratamiento del owner y protección de Osbaldo

Draggodeidad recibe siempre `classroom-delivery` y recibe `foundation` cuando hay starter. Esas obligaciones no reducen su elegibilidad para trabajo complejo.

osbaldoXxC nunca es elegible para `hard`, riesgo distinto de `low`, infraestructura/integración, implementación que requiera conocimiento del repositorio ni trabajo técnico cuyo contenido indique arquitectura, autenticación, seguridad, persistencia, sincronización, concurrencia o backend crítico. Sí puede recibir pruebas, documentación, evidencia, validación, UI y cambios simples seguros.

## Grounding y provenance

`groundingCatalog` usa IDs estables, por ejemplo:

```json
{
  "repository.readme": {
    "source": "repository",
    "content": "..."
  },
  "starter.file:package.json": {
    "source": "starter",
    "content": "package.json\n..."
  },
  "workflow.delivery-policy": {
    "source": "workflowConfiguration",
    "content": "Draggodeidad consolida la evidencia..."
  }
}
```

Una afirmación se conserva así:

```json
{
  "claim": "npm test",
  "source": "repository",
  "evidence": "repository.readme"
}
```

El validator exige que el ID exista, que su tipo de fuente coincida y que su contenido respalde el claim. El respaldo no exige coincidencia carácter por carácter: permite contención, coincidencia por token técnico (comando, ruta, URL, versión) y solapamiento semántico conservador entre claim y fuente. Además detecta comandos, URLs, versiones y rutas/archivos concretos en las secciones, y reutiliza un mismo provenance para usos equivalentes del detalle dentro de la misma Issue (por ejemplo, "Ejecutar npm run verify" y "Documentar npm run verify" se respaldan con una sola entrada). Un detalle sin provenance válido devuelve `UNGROUNDED_TECHNICAL_DETAIL`; el único retry del LLM debe eliminarlo, generalizarlo o respaldarlo sin inventar fuentes. Si persiste, el workflow falla cerrado antes de GitHub.

Los errores se clasifican por capa: `TRANSPORT_ERROR`, `PROVIDER_ERROR`, `PARSE_ERROR`, `SCHEMA_ERROR`, `GROUNDING_ERROR`, `PROVENANCE_ERROR`, `SEMANTIC_ERROR`, `DEPENDENCY_ERROR` y `VALIDATOR_INTERNAL_ERROR`. `schemaStatus=valid` nunca produce `SCHEMA_ERROR`. Cuando el validator entra en contradicción (p. ej. schema válido con `SCHEMA_ERROR`, o provenance resoluble ignorado), el flujo termina en `FAIL_VALIDATOR` sin ejecutar Gemini Repair, Qwen ni GLM, porque ningún modelo debe compensar un validator roto. Cada intento expone `groundingReport`, `groundingStatus`, `semanticStatus`, `dependencyStatus` y `finalPlanStatus`.

## Gap Analysis

El LLM compara Classroom + starter + señales visibles del repositorio y marca cada unidad como `missing`, `partial` o `complete`. `Apply Gap Analysis` elimina las unidades `complete`, registra la razón y evidencia en `excludedCompletedWork`, y considera satisfechas sus dependencias. El plan final sólo admite `missing` o `partial`.

## Casos automatizados

| Caso | Resultado |
|---|---|
| 2 hard, 2 medium, 3 easy | hard/medium quedan en Draggodeidad/Julian; Osbaldo recibe trabajo easy seguro |
| Sólo tareas hard | ninguna se asigna a Osbaldo |
| Muchas easy | Osbaldo recibe varias; el excedente se balancea |
| Owner con setup + entrega | ambas pesan 0 funcionalmente; dos hard se reparten 3/3 entre owner y Julian |
| Comando inventado | rechazado con `UNGROUNDED_TECHNICAL_DETAIL` |
| Trabajo ya implementado | se excluye y no produce Issue |

La suite también cubre comando respaldado, dependencias inválidas, ciclos, preview, retry único, ZIP seguro, idempotencia y ausencia de secretos. Resultado local: `npm run build` y `npm test` pasan.

## Ejemplo completo de dry-run

Ejemplo abreviado únicamente en `body`, que normalmente contiene los doce encabezados y metadata idempotente completa:

```json
{
  "mode": "dry-run",
  "mutationsPerformed": false,
  "courseId": "<CLASSROOM_PWA_COURSE_ID>",
  "courseWorkId": "cw-pwa-01",
  "updateTime": "2026-09-15T14:00:00Z",
  "starter": { "found": true, "name": "PWA-w01-kit-estudiante.zip", "fileCount": 12 },
  "course": "PWA",
  "week": 1,
  "repository": "Draggodeidad/pwa-utt",
  "assignmentTitle": "Semana 01",
  "deadline": null,
  "assignmentPolicy": {
    "strategy": "capability-aware-weighted-load",
    "difficultyWeights": { "easy": 1, "medium": 2, "hard": 3 },
    "operationalExcludedFromFunctionalBalance": true,
    "loads": {
      "Draggodeidad": { "functional": 3, "technical": 3, "operational": 2, "issueCount": 3 },
      "JulianDele": { "functional": 0, "technical": 0, "operational": 0, "issueCount": 0 },
      "osbaldoXxC": { "functional": 0, "technical": 0, "operational": 0, "issueCount": 0 }
    }
  },
  "gapAnalysis": { "excludedCompletedWork": [] },
  "issuesThatWouldBeCreated": [
    {
      "order": 1,
      "key": "foundation",
      "title": "[PWA][W01] Preparar PWA-w01-kit-estudiante.zip y establecer baseline de trabajo",
      "assignee": "Draggodeidad",
      "category": "setup",
      "difficulty": "easy",
      "weight": 1,
      "functionalWeight": 0,
      "operationalWeight": 1,
      "risk": "low",
      "requiresCoding": false,
      "requiresRepositoryKnowledge": true,
      "requirementKind": "internalWorkflowRequirement",
      "labels": ["PWA", "week-01", "type:devops", "priority:high"],
      "dependsOn": [],
      "groundingStatus": "grounded",
      "provenance": [
        { "claim": "PWA-w01-kit-estudiante.zip", "source": "starter", "evidence": "starter.archive" }
      ],
      "body": "<doce encabezados y metadata idempotente>"
    },
    {
      "order": 2,
      "key": "offline-core",
      "title": "[PWA][W01] Implementar comportamiento offline requerido",
      "assignee": "Draggodeidad",
      "category": "implementation",
      "difficulty": "hard",
      "weight": 3,
      "functionalWeight": 3,
      "operationalWeight": 0,
      "risk": "high",
      "requiresCoding": true,
      "requiresRepositoryKnowledge": true,
      "requirementKind": "sourceRequirement",
      "labels": ["PWA", "week-01", "type:feature", "priority:high"],
      "dependsOn": ["foundation"],
      "groundingStatus": "grounded",
      "provenance": [
        { "claim": "comportamiento offline", "source": "classroom", "evidence": "classroom.description" }
      ],
      "body": "<doce encabezados y metadata idempotente>"
    },
    {
      "order": 3,
      "key": "classroom-delivery",
      "title": "[PWA][W01] Consolidar evidencia y preparar entrega en Classroom",
      "assignee": "Draggodeidad",
      "category": "delivery",
      "difficulty": "easy",
      "weight": 1,
      "functionalWeight": 0,
      "operationalWeight": 1,
      "risk": "low",
      "requiresCoding": false,
      "requiresRepositoryKnowledge": false,
      "requirementKind": "internalWorkflowRequirement",
      "labels": ["PWA", "week-01", "type:evidence", "priority:high"],
      "dependsOn": ["foundation", "offline-core"],
      "groundingStatus": "grounded",
      "provenance": [
        { "claim": "Draggodeidad consolida la evidencia y realiza la entrega final en Google Classroom", "source": "workflowConfiguration", "evidence": "workflow.delivery-policy" }
      ],
      "body": "<doce encabezados y metadata idempotente>"
    }
  ],
  "missingLabelsThatWouldBeCreated": ["PWA", "week-01", "type:devops", "type:feature", "type:evidence", "priority:high"],
  "note": "No se crearon Issues ni labels; Classroom y Drive se consultaron en modo de sólo lectura."
}
```

## Limitaciones

- El Gap Analysis sólo puede usar lo que el workflow obtiene: árbol de rutas, README, Issues/PRs recientes y contenido seleccionado del starter. No inspecciona automáticamente el contenido de cada archivo del repositorio; ante evidencia insuficiente debe conservar `missing/partial` o fallar, no asumir que algo está completo.
- La detección de detalles concretos usa patrones deterministas para comandos, URLs, versiones y rutas comunes. El catálogo y la validación semántica del proveedor siguen siendo necesarios para frases técnicas que no coincidan con esos patrones.
- La clasificación inicial depende del LLM, aunque el workflow valida enums, coherencia difficulty↔weight y aplica la asignación de forma determinista.
- El workflow sigue inactivo y no se probó contra credenciales reales; antes de `live` debe importarse y validarse la preview con una actividad real y, después, con un repositorio sandbox.
