# Classroom API Migration

## Objetivo

Migrar la automatización existente de Gmail a Google Classroom API + Google Drive API, conservando la planificación estructurada, validación, idempotencia, ejecución dry-run/live y recuperación de fallos parciales.

## Estado actual

Migración iniciada en la rama dedicada. La implementación existente ya fue inventariada y se verificaron las APIs y scopes oficiales que condicionan el diseño.

## Completado

- [x] Crear la rama `feat/classroom-api-migration`.
- [x] Inspeccionar la implementación existente.
- [x] Identificar componentes reutilizables y acoplamientos a Gmail.
- [x] Verificar `courses.courseWork.list`, CourseWork, Drive downloads, scopes de Classroom/Drive y mecanismos n8n en documentación oficial vigente.

## En progreso

- [ ] Implementar ingesta determinista de CourseWork y análisis seguro del starter.

## Pendiente

- [ ] Sustituir la deduplicación por `courseId + courseWorkId + issue-key`.
- [ ] Adaptar schema, prompt y validaciones al contexto Classroom/Drive/GitHub.
- [ ] Reconstruir el workflow importable con schedules semanales, un único retry y Manual Trigger.
- [ ] Actualizar configuración, setup, scheduling, pruebas y README.
- [ ] Ejecutar build, tests y dry-runs de ejemplo PWA/DMI W03.

## Decisiones tomadas

- Se conservan Docker Compose, n8n Community, GitHub context, Gemini/Ollama, JSON Schema, orden topológico, dry-run/live, recuperación parcial y error workflow.
- Se reemplazan `src/gmail/parse-route.js`, búsquedas por message ID, marcado de Gmail y polling horario.
- Gmail queda únicamente como notificación opcional controlada por `NOTIFICATIONS_ENABLED`.
- `classroom.coursework.me.readonly` es suficiente para listar CourseWork del usuario; `classroom.courses.readonly` se usa sólo en setup para descubrir IDs.
- Los adjuntos del profesor no quedan autorizados automáticamente mediante `drive.file`; para acceso desatendido se documenta `drive.readonly`, scope restringido. No se solicita escritura.
- Los ZIP se procesan como binario temporal de ejecución con límites, rechazo de rutas inseguras y limpieza/pruning de datos de ejecución.

## Archivos modificados

- `docs/CLASSROOM_API_MIGRATION.md`

## Arquitectura actual

La rama aún conserva el workflow Gmail original. La siguiente fase añadirá módulos Classroom/Drive independientes y luego conectará esos módulos al pipeline GitHub/LLM reutilizado.

## Próximo paso exacto

Crear y probar los módulos `parse-coursework`, `inspect-materials`, `validate-zip` e `inspect-starter` antes de modificar el generador del workflow.

## Validación ejecutada

- comando: `git status --short --branch`
- resultado: rama `feat/classroom-api-migration`, sin cambios previos del usuario.
- comando: inspección de `src/`, `tools/build-workflows.mjs`, schema, prompt, tests y documentación.
- resultado: acoplamientos a Gmail identificados; módulos reutilizables confirmados.

## Problemas conocidos

- n8n no ejecuta módulos npm arbitrarios dentro del Code node por defecto; la inspección ZIP debe usar nodos nativos de compresión/extracción y validar el inventario antes de leer contenido.
- `drive.readonly` es un scope restringido y puede requerir verificación/assessment si la aplicación se publica o transmite/almacena datos restringidos; para uso personal en modo Testing se documentarán sus límites.

## Último commit estable

`pendiente`
