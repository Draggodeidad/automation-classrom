# Plan de pruebas y paso a producción

## Prueba automática de artefactos

Desde `automation/`:

```text
npm test
```

Valida JSON, sintaxis de Code Nodes, ausencia de patrones comunes de secretos, versión Docker, ausencia de PostgreSQL/Redis, router DMI/PWA, filtros de quiz/recordatorio/procesado/desconocido y un DAG paralelo sin ciclos.

## Preparación segura

1. Confirma `.env`: `AUTOMATION_MODE=dry-run`.
2. Importa ambos workflows y asigna credenciales.
3. Configura el error workflow en Settings.
4. Deja el workflow principal inactivo.
5. Localiza correos reales DMI Semana 03 y PWA Semana 03. No les agregues la label Processed.
6. Ejecuta `Manual Dry Run`.

El resultado debe terminar en `Exact Dry-Run Preview`, con `mutationsPerformed: false`, `missingLabelsThatWouldBeCreated` e `issuesThatWouldBeCreated` incluyendo cuerpo completo y metadata. GitHub y Gmail deben permanecer sin cambios.

## Comprobación conceptual — Semana 03

Los fixtures prueban el routing aun sin el contenido real de las actividades:

| Entrada | Repo esperado | Prefijo | Invariantes del plan |
|---|---|---|---|
| `DMI - 10B`, Semana 03 | `Draggodeidad/campusops-dmi-team` | `[DMI][W03]` | bootstrap D; implementación sustancial D; Julian/Osbaldo paralelos; integración final |
| `PWA - 10B`, Semana 03 | `Draggodeidad/pwa-utt` | `[PWA][W03]` | mismas reglas, contexto exclusivo de PWA |

Una distribución válida típica es:

```text
bootstrap (Draggodeidad)
├── implementación central (Draggodeidad)
├── bloque independiente A (JulianDele)
└── bloque independiente B (osbaldoXxC)
    └── pruebas/evidencia propias dentro de cada Issue

integración final (Draggodeidad)
depende de los tres bloques de implementación
```

El nombre concreto, archivos y criterios deben salir del correo real y del repositorio; los fixtures no inventan esos datos.

## Matriz mínima de nueve casos

### Caso 1 — Nueva actividad DMI

- Entrada: remitente Classroom, asunto `Nueva tarea: "Semana 03 — ..."`, cuerpo `DMI - 10B`.
- Esperado dry-run: repo `campusops-dmi-team`, cero mutaciones.
- Esperado live en sandbox: Issues sólo en ese repo y label Gmail al final.

### Caso 2 — Nueva actividad PWA

- Entrada equivalente con `PWA - 10B`.
- Esperado: sólo `pwa-utt`; nunca aparecen rutas/Issues de DMI.

### Caso 3 — Quiz

- Entrada: `Nueva tarea: "Quiz semanal 4..."` o quiz individual.
- Esperado: `Parse and Route` no produce items; cero llamadas de mutación.

### Caso 4 — Recordatorio

- Entrada: `Fecha de entrega mañana: "Semana 03..."`.
- Esperado: ignorado antes de GitHub.

### Caso 5 — Correo procesado

- Añade `Automation/Classroom/Processed` a una copia de prueba.
- Esperado: la consulta Gmail lo excluye; el parser también tiene defensa adicional.

### Caso 6 — Actividad existente en GitHub

- En un repo sandbox crea Issues con metadata del mismo message ID/course/week y `plan-keys` completo.
- Dry-run: `duplicateDetected: true`, cero mutaciones.
- Live: no crea Issues; sólo reconcilia la label Gmail si faltaba y envía resumen.

### Caso 7 — JSON inválido del LLM

- Temporalmente usa un endpoint/modelo de prueba que devuelva texto inválido, o fija la salida del nodo AI en una copia del workflow.
- Esperado: un solo reintento. Si vuelve a fallar, `Fail Closed - Invalid Plan`; cero Issues y correo sin Processed.

### Caso 8 — Fallo parcial GitHub

1. En un repo sandbox ejecuta live y fuerza un fallo después de 2 Issues (por ejemplo, revoca temporalmente el PAT justo después de ver la segunda creación).
2. Comprueba que el correo no tiene Processed.
3. Restaura el PAT y reejecuta.
4. Esperado: las dos `issue-key` existentes se registran; sólo se crean las faltantes; las dependencias muestran números reales; al final se verifica todo y se marca Gmail.

No cierres ni borres automáticamente las Issues parciales: son el registro de compensación.

### Caso 9 — Materia desconocida

- Entrada con nueva tarea Semana 03 pero sin `DMI - 10B` ni `PWA - 10B`.
- Esperado: ignorada; ningún repositorio se modifica.

## Pruebas adicionales obligatorias antes de live

- Cambia una dependencia para formar un ciclo en una salida simulada: debe fallar antes de GitHub.
- Quita la implementación sustancial de Draggodeidad: debe fallar en `Plan and Topological Sort`.
- Haz que Julian dependa de una Issue de Osbaldo: debe fallar.
- Verifica que las tres cuentas sean asignables; GitHub puede omitir assignees si faltan permisos.
- Inspecciona que ninguna Issue contenga secretos del correo o del repositorio.
- Verifica que `N8N_ENCRYPTION_KEY` no cambie entre reinicios; perderla impide descifrar credenciales.

## Pasar de dry-run a live

1. Guarda/exporta los previews de DMI Semana 03 y PWA Semana 03.
2. Revisa títulos, repo, assignees, dependencias, alcance, pruebas, evidencia y labels.
3. Corrige el prompt si hace falta y repite dry-run.
4. En `.env`, cambia exactamente:

   ```env
   AUTOMATION_MODE=live
   ```

5. Aplica el cambio: `docker compose up -d`.
6. Ejecuta manualmente una sola actividad controlada.
7. Confirma conjunto de Issues, referencias `#`, label Gmail y correo resumen.
8. Activa el workflow para el Schedule.

Para volver a modo seguro: cambia a `AUTOMATION_MODE=dry-run` y recrea el contenedor. No es necesario reimportar el workflow.

## Observabilidad

- Usa **Executions** de n8n; el Compose conserva 14 días o 500 ejecuciones.
- El error handler informa último nodo, mensaje y URL/ID de ejecución.
- No se añaden Grafana, Prometheus, Loki ni Elasticsearch.
- Un fallo antes de `Gmail - Mark Processed` es reintentable. Un fallo sólo en `Gmail - Send Success Summary` no requiere reintentar la actividad: la label ya evita duplicados.
