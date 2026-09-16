# Migration Report

## Cambios

```text
Gmail input                      → eliminado
Classroom API                    → fuente principal
Drive API                        → metadata y descarga del starter real
Gmail message ID                 → courseId + courseWorkId
Polling horario lun–mié          → lunes/martes 09:10 + un retry 09:40
Descripción aislada              → CourseWork + starter + GitHub
Gmail Processed label            → metadata reconstruible en GitHub
```

## Conservado

- Docker Compose y n8n Community self-hosted.
- Gemini/Ollama y structured output.
- JSON Schema, reparación única y fail closed.
- Contexto GitHub, labels, dry-run/live, DAG y creación secuencial.
- Reanudación de conjuntos parciales y error workflow.
- Equipo y regla de implementación técnica sustancial.

## Reemplazado

- Parser/router Gmail por parser determinista de CourseWork.
- Idempotencia `classroom-message-id` por `classroom-course-id`, `classroom-coursework-id`, `classroom-update-time` e `issue-key`.
- Schedule horario por dos rutas semanales independientes.
- Suposición de starter por inspección segura del ZIP real.

## Eliminado

- Búsqueda de mensajes, filtros por remitente/asunto y label `Automation/Classroom/Processed`.
- Polling repetido durante varios días.
- Gmail como requisito operativo.

## Decisiones de seguridad

- Classroom y Drive son sólo lectura.
- `drive.readonly` es restringido, pero `drive.file` no cubre de forma fiable adjuntos del profesor en un flujo desatendido.
- No se guardan tokens en `.env` ni ZIP en Git.
- La instancia permite `$env` a Code Nodes porque n8n 2.x lo bloquea por defecto; sólo usuarios de confianza deben editar workflows y los secretos permanecen en Credentials.
- Se valida el ZIP antes de extracción y se limita el contexto enviado al LLM.
- Un CourseWork actualizado no altera Issues existentes automáticamente.
