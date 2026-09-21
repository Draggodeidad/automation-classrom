# Cobertura de contenido y trabajo residual

El JSON y los prompts del proveedor permanecen iguales. Sus estados `complete` son propuestas, no pruebas. `Apply Gap Analysis` reconstruye el estado fuera del modelo antes de excluir trabajo.

Se consultan como máximo 20 archivos de texto relevantes de hasta 100 KB cada uno en el árbol actual de GitHub. Se priorizan rutas presentes en las fuentes y archivos de requisitos/evidencia. El contenido para cobertura conserva SHA y texto completo; el contexto del LLM está limitado a 5 KB por archivo. Un árbol truncado falla cerrado. Archivos no cargados no pueden justificar complete.

## Revisión verificable

Para probar cobertura semántica sin modificar el validator/grounding ni aceptar que un archivo existe como prueba, se usa una revisión explícita mantenida por el operador. Está fuera de la respuesta LLM:

```text
staticData.global.classroomRegistry[courseId].entries[courseWorkId].coverageReview[issueKey]
```

Ejemplo de formato, con valores ilustrativos que deben sustituirse por evidencia real:

```json
{
  "reviewedBy": "persona que verificó el requisito",
  "requirementsChecked": [
    {
      "requirement": "RNF medibles",
      "satisfied": true,
      "sourceEvidence": "classroom.description",
      "sourceQuote": "RNF medibles",
      "path": "docs/requirements.md",
      "blobSha": "SHA exacto del blob revisado",
      "excerpt": "Texto real del archivo que demuestra la cobertura del requisito."
    }
  ]
}
```

El operador revisa el significado del contenido, no sólo palabras clave. Para código, debe verificar comportamiento/pruebas antes de registrar cobertura; el workflow no ejecuta código no confiable del repositorio. Importar esta revisión requiere exportar el workflow existente, añadirla al entry correspondiente y reimportar conservando el resto del estado y `active=false`.

Cada elemento de `alcance` y `criteriosAceptacion` del plan debe tener una revisión exacta. El sistema contrasta que exista fuente Classroom/starter, que contenga `sourceQuote`, que el archivo actual tenga el SHA revisado y contenga el excerpt, y que el excerpt no sea TODO/TBD/placeholder/pendiente. Un cambio de blob invalida la revisión. No se confía en campos de cobertura añadidos por el modelo.

- `missing`: ninguna cobertura verificada ni contenido cargado en las rutas esperadas.
- `partial`: alguna cobertura verificada, o contenido actual que todavía necesita revisión. Con cobertura parcial, sólo los requisitos no satisfechos aparecen en objetivos, alcance, pasos, pruebas y aceptación de la tarea residual.
- `complete`: todos los requisitos tienen revisión válida contra contenido actual; se excluye y conserva `requirementsChecked`.
- `not_applicable`: sólo mediante revisión explícita con `notApplicable: true`, `reviewedBy` y `reason`. No se infiere por falta de archivos. La dependencia se resuelve con razón de no aplicabilidad.

**Límite deliberado:** no hay evaluación semántica automática de cumplimiento. Sin revisión, un archivo existente queda `partial` por verificar, aunque ya sea correcto; nunca se elimina trabajo sólo porque el LLM diga complete. Si se quiere automatizar este paso, hacen falta verificadores específicos por requisito o ampliar el contrato de planificación en una tarea separada.

## Evidencia por persona

Las revisiones personales usan `evidence-draggodeidad`, `evidence-juliandele` y `evidence-osbaldoxxc`, y cada check exige `personalOwner` con el integrante exacto, además de requisito, SHA y excerpt. Una responsabilidad personal ya cubierta se registra en `completePersonalEvidence`; no crea Issue y la entrega la muestra como satisfecha. La revisión debe evaluar únicamente la sección/aportación de ese integrante.
