# Dry-runs de ejemplo

Mantén:

```env
AUTOMATION_MODE=dry-run
```

## PWA W03

Edita `Manual Request`:

```js
const request = { course: 'PWA', week: 3 };
```

La salida `Exact Dry-Run Preview` incluye, de forma abreviada:

```json
{
  "mode": "dry-run",
  "mutationsPerformed": false,
  "courseId": "<CLASSROOM_PWA_COURSE_ID>",
  "courseWorkId": "<id estable>",
  "course": "PWA",
  "week": 3,
  "repository": "Draggodeidad/pwa-utt",
  "starter": {
    "found": true,
    "name": "PWA-w03-kit-estudiante.zip"
  },
  "issuesThatWouldBeCreated": [
    {
      "key": "foundation",
      "title": "[PWA][W03] Preparar PWA-w03-kit-estudiante.zip y establecer baseline de trabajo",
      "assignee": "Draggodeidad",
      "category": "setup",
      "difficulty": "easy",
      "weight": 1,
      "functionalWeight": 0,
      "risk": "low",
      "dependsOn": [],
      "groundingStatus": "grounded"
    }
  ],
  "assignmentPolicy": {
    "strategy": "capability-aware-weighted-load",
    "operationalExcludedFromFunctionalBalance": true
  },
  "gapAnalysis": { "excludedCompletedWork": [] }
}
```

La preview completa incluye también provenance, requirementKind, capacidades requeridas, carga por integrante y la tarea final `classroom-delivery` asignada a `Draggodeidad`.

## DMI W03

```js
const request = { course: 'DMI', week: 3 };
```

Debe usar `CLASSROOM_DMI_COURSE_ID` y `Draggodeidad/campusops-dmi-team`. Si el CourseWork no tiene ZIP, `starter.found=false` y el plan se basa en descripción + GitHub sin inventar una Foundation de starter.

En ambos casos confirma que no se crean labels ni Issues y que Classroom/Drive sólo reciben operaciones GET.
