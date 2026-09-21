# Selección y horarios

- PWA: lunes 09:10; DMI: martes 09:10, America/Mexico_City.
- Workflow inactivo y modo forzado `dry-run` hasta revisión.
- Manual y ambos Schedule pasan por `Prepare Classroom Request` y el mismo selector.
- La API pagina `PUBLISHED` con `pageSize=100`. El orden recibido no decide la selección.
- Se ordenan candidatos por `scheduledTime || creationTime` ascendente, luego `courseWorkId` lexicográfico. Nunca por `updateTime`.
- Sin registry: `historical_bootstrap_required`, sin LLM. Con registry y sin pendientes: `no_pending_coursework`, sin espera ni notificación. Los antiguos nodos de retry quedan desconectados de la ruta normal.

## Manual

```js
const request = { course: 'DMI', manualCourseWorkOverride: null, bootstrapHistorical: false };
```

Para probar un histórico, indicar su ID obtenido de Classroom en `manualCourseWorkOverride`. Sólo se permite con trigger manual explícito y entorno dry-run. No modifica histórico ni marca processed. `week` fue retirado como selector; sigue siendo metadata del título.

## Bootstrap explícito

Antes de la primera activación, ejecutar manualmente cada curso con `bootstrapHistorical: true`. Se obtiene `proposedRegistry` con IDs existentes y `cutoverAt`; n8n no persiste static data de pruebas manuales automáticamente.

Exportar el workflow instalado y guardar cada salida del bootstrap en JSON. Preparar la importación preservando credenciales y estado:

```bash
node tools/prepare-install.mjs existing-export.json prepared-import.json bootstrap-pwa.json bootstrap-dmi.json
```

Importar `prepared-import.json` con n8n CLI/UI. El helper exige workflow inactivo y rechaza sobrescribir un cutover existente. Para actualizaciones posteriores, exportar el workflow actual y ejecutar el helper sin snapshots. Nunca reemplazar el registry instalado por un template vacío.

El estado persiste en `staticData.global.classroomRegistry[courseId].entries[courseWorkId]` del workflow, en la base SQLite de n8n dentro del volumen `classroom_automation_n8n_data`. Conservar ese volumen y respaldar la exportación del workflow.

Las ejecuciones manuales normales sólo calculan candidatos; los Schedule publicados pueden persistir observaciones `pending` y `processed` al terminar correctamente. `processed` exige un conjunto de Issues existente y verificado, nunca un dry-run. Esta entrega no publica los Schedule ni permite crear Issues.
