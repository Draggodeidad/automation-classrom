# Testing

## Validación local reproducible

```bash
npm run build
npm test
```

La suite comprueba:

- JSON importable y sintaxis de todos los Code Nodes;
- cron PWA/DMI, zona horaria y un único Wait/retry;
- separación de rutas PWA/DMI;
- CourseWork normal, quiz y actividad sin ZIP;
- selección de ZIP y rechazo de dos ZIP ambiguos;
- `canDownload=false`;
- ZIP válido, corrupto, Zip Slip y compression bomb;
- metadata nueva y ausencia de message ID/Gmail Processed;
- Foundation exacta y detección de `updateTime` nuevo;
- ausencia de secretos y de PostgreSQL/Redis/Supabase/Kafka.

## Matriz de aceptación en n8n

### Scheduling

| Caso | Preparación | Resultado esperado |
|---|---|---|
| PWA lunes | CourseWork válido antes de 09:10 | 1 request; procesa PWA |
| PWA retrasada | no existe a 09:10; existe a 09:40 | 2 requests; procesa PWA |
| PWA ausente | no existe en ambas consultas | 2 requests; alerta/fin; no polling |
| DMI martes | equivalentes DMI | sólo consulta `CLASSROOM_DMI_COURSE_ID` |
| Trigger equivocado | inspeccionar URL/Execution Data | PWA nunca consulta DMI y viceversa |

### Classroom

- `Semana 03`, `[Semana 03]` y `Semana 3 — CI` producen `week=3`, `weekPadded=03`.
- Quiz, examen y recordatorio producen `found=false`.
- Una semana manual permite backfill aunque el CourseWork sea antiguo.
- Sin semana determinable se ignora/falla cerrado; nunca llega al LLM.
- Un CourseWork ya completo termina sin mutaciones.
- Un `updateTime` más nuevo termina como `coursework_updated` y no modifica GitHub.

### Drive y starter

- ZIP descargable: metadata → `alt=media` → validación → extracción → contexto normalizado.
- `canDownload=false`, 404, ZIP corrupto, symlink, path inseguro o límite excedido: error antes del LLM/GitHub.
- Archivo no ZIP: queda en `materialInventory`, no se descarga como starter.
- Sin ZIP: continúa con `starter.found=false`.
- Dos ZIP: selecciona sólo si uno puntúa inequívocamente por materia/semana/starter; empate material falla cerrado.
- Confirma que `relevantFiles` prioriza instrucciones, rúbrica, README, scripts, workflows y tests.

### Foundation

Con `PWA-w03-kit-estudiante.zip`, la preview debe incluir exactamente:

```text
[PWA][W03] Integrar PWA-w03-kit-estudiante.zip y establecer baseline semanal
```

asignada a `Draggodeidad`, sin dependencias. Debe existir además otra Issue `feature`, `test` o `devops` sustancial para Draggodeidad. Julian y Osbaldo no deben depender entre sí salvo una necesidad técnica real, que la validación actual rechaza por seguridad.

### Dry-run

1. Configura Classroom, Drive, GitHub y un proveedor IA.
2. Mantén `AUTOMATION_MODE=dry-run`.
3. Ejecuta Manual PWA W03 y DMI W03.
4. Revisa `Exact Dry-Run Preview`:
   - `mutationsPerformed=false`;
   - identidad CourseWork correcta;
   - starter e inventario coherentes;
   - metadata invisible nueva;
   - labels e Issues exactas que se crearían.
5. Comprueba que GitHub no cambió.

### Live y recuperación parcial

Usa primero un repositorio sandbox equivalente.

1. Cambia temporalmente el repositorio configurado al sandbox.
2. Ejecuta una actividad en `live` y detén la ejecución después de dos Issues.
3. Reintenta el mismo CourseWork.
4. Debe reconstruir números por `issue-key`, reusar las dos Issues y crear sólo las faltantes.
5. La verificación final exige assignee, labels, `plan-keys` y conjunto completo.

### CourseWork actualizado

1. Crea un conjunto con `classroom-update-time:T1`.
2. Simula el mismo `courseWorkId` con `updateTime=T2`, donde `T2>T1`.
3. Debe terminar en `Build Manual Review Alert`.
4. Ninguna Issue debe crearse o editarse.

## Seguridad manual

- Busca posibles secretos: `rg -n 'ghp_|github_pat_|AIzaSy|sk-' .`.
- Confirma que `.env` no está versionado.
- Revisa que ningún contenido enviado al LLM incluya `.env`, tokens o credenciales.
- Comprueba pruning de ejecuciones fallidas tras 24 horas.
- Verifica que las únicas operaciones Classroom/Drive sean GET.
- Mantén el workflow inactivo hasta completar la prueba sandbox.
