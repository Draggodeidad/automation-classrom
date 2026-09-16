# Classroom API Migration

## Objetivo

Migrar la automatización existente de Gmail a Google Classroom API + Google Drive API, conservando la planificación estructurada, validación, idempotencia, ejecución dry-run/live y recuperación de fallos parciales.

## Estado actual

Implementación principal terminada y validada. El workflow ya usa Classroom/Drive, conserva el pipeline GitHub/LLM y se importa correctamente en n8n 2.39.5. Falta cerrar el commit de documentación final.

## Completado

- [x] Crear la rama `feat/classroom-api-migration`.
- [x] Inspeccionar la implementación existente.
- [x] Identificar componentes reutilizables y acoplamientos a Gmail.
- [x] Verificar `courses.courseWork.list`, CourseWork, Drive downloads, scopes de Classroom/Drive y mecanismos n8n en documentación oficial vigente.
- [x] Implementar ingesta, filtro semanal, dos rutas de schedule y retry único.
- [x] Implementar análisis de materials, metadata/download Drive y starter opcional.
- [x] Implementar validación ZIP y contexto priorizado del starter.
- [x] Migrar metadata/idempotencia a `courseId + courseWorkId + issue-key` y detectar `updateTime` nuevo.
- [x] Adaptar schema, prompt, Foundation, validaciones, dry-run/live y recuperación parcial.
- [x] Generar e importar ambos workflows con n8n 2.39.5.
- [x] Añadir pruebas de Classroom, Drive, ZIP, schedules, Foundation e idempotencia.

## En progreso

- [ ] Cerrar documentación y migration report.

## Pendiente

- [ ] Ejecutar dry-runs reales PWA/DMI W03 después de que el usuario configure Course IDs y credenciales OAuth/GitHub/IA.

## Decisiones tomadas

- Se conservan Docker Compose, n8n Community, GitHub context, Gemini/Ollama, JSON Schema, orden topológico, dry-run/live, recuperación parcial y error workflow.
- Se reemplazan `src/gmail/parse-route.js`, búsquedas por message ID, marcado de Gmail y polling horario.
- Gmail queda únicamente como notificación opcional controlada por `NOTIFICATIONS_ENABLED`.
- `classroom.coursework.me.readonly` es suficiente para listar CourseWork del usuario; `classroom.courses.readonly` se usa sólo en setup para descubrir IDs.
- Los adjuntos del profesor no quedan autorizados automáticamente mediante `drive.file`; para acceso desatendido se documenta `drive.readonly`, scope restringido. No se solicita escritura.
- Los ZIP se procesan como binario temporal de ejecución con límites, rechazo de rutas inseguras y limpieza/pruning de datos de ejecución.
- n8n 2.x requiere `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` para este workflow; sólo configuración no secreta vive en `$env` y los secretos permanecen en Credentials.

## Archivos modificados

- `.env.example`, `docker-compose.yml`
- `src/classroom/*`, `src/drive/*`
- `src/github/*`, `src/ai/*`, `src/planning/*`, `src/reporting/*`
- `schemas/issue-plan.schema.json`, `prompts/issue-planner.md`
- `tools/build-workflows.mjs`, `workflows/*.json`
- `tests/*`
- `README.md`, `docs/*`

## Arquitectura actual

`Schedule/Manual → Classroom API → filtro/retry → Drive metadata/download → ZIP seguro/contexto → GitHub context/idempotencia → Gemini/Ollama → schema/reglas/DAG → dry-run/live → GitHub Issues`. Gmail es salida opcional.

## Próximo paso exacto

Configurar credenciales e IDs con `docs/SETUP-CLASSROOM.md`, importar los workflows y ejecutar PWA W03 y DMI W03 en dry-run.

## Validación ejecutada

- comando: `git status --short --branch`
- resultado: rama `feat/classroom-api-migration`, sin cambios previos del usuario.
- comando: inspección de `src/`, `tools/build-workflows.mjs`, schema, prompt, tests y documentación.
- resultado: acoplamientos a Gmail identificados; módulos reutilizables confirmados.
- comando: `docker compose --env-file .env.example config --no-interpolate --quiet`
- resultado: Compose válido.
- comando: `npm run build && npm test && git diff --check`
- resultado: build y suite completos; sin errores de whitespace.
- comando: `n8n import:workflow` dentro de `docker.n8n.io/n8nio/n8n:2.39.5` para ambos JSON.
- resultado: `Successfully imported 1 workflow` en ambos casos.

## Problemas conocidos

- Los dry-runs reales no pueden ejecutarse sin Course IDs y credenciales del usuario; existen fixtures y previews documentadas.
- `drive.readonly` es un scope restringido y puede requerir verificación/assessment si la aplicación se publica o transmite/almacena datos restringidos; para uso personal en modo Testing se documentarán sus límites.

## Último commit estable

`9470742`
