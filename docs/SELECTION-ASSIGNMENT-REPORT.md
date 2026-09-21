# Fix de selección, bootstrap, reparto y evidencia individual

Aplicado al código fuente, al JSON importable y al workflow n8n existente `bq8dzXRRSYkueHsn`, sin crear un workflow de producción. Estado final verificado por exportación: `active=false`, `activeVersionId=null`, modo forzado `dry-run`, previews con `mutationsPerformed=false`.

La exportación instalada contiene 133 nodos: se conservaron las referencias de credenciales y la rama de errores que ya estaba embebida en la instancia. Los parámetros de los nodos protegidos de IA son iguales a los anteriores. No se modificaron proveedores, fallback, Repair, parser, schema, validator/grounding, fail closed ni prompts de proveedor.

## Resultados reales

| Consulta | Históricos registrados | Pendientes | Resultado | LLM / Issues |
|---|---:|---:|---|---|
| PWA | 3, correspondientes a W01–W03 | 0 | `no_pending_coursework` | 0 / 0 |
| DMI | 6: W01–W03 y tres quizzes | 0 | `no_pending_coursework` | 0 / 0 |
| Override manual PWA W01 | Conserva estado histórico | No altera pendientes | `manual_test_override`; lectura de 20 archivos | 0 / 0 |

DMI se verificó con `pageSize=2`: tres páginas, seis actividades. El override fue un diagnóstico de lectura detenido después de `Build Context & Dedup`; no es una ejecución real del plan LLM. El workflow completo se restauró después, con override vacío. Las pruebas de planes usan fixtures y los nodos exportados.

Snapshots de cutover: PWA `2026-09-21T01:45:25.912Z`; DMI `2026-09-21T01:46:58.071Z` (20 de septiembre en Ciudad de México). Ver [verificación real y snapshots](SELECTION-LIVE-VERIFICATION.json).

## Respuestas a los 26 puntos solicitados

1. **Causa de W01.** El `Manual Request` instalado tenía `week: 1`. El selector además usaba una ventana de 36 horas basada en el máximo de creation/update/scheduled time y elegía por updateTime descendente. No existía bootstrap histórico. Una edición reciente podía volver elegible un trabajo viejo.

2. **Nodos responsables.** `Manual Request`, `Prepare Classroom Request`, `Parse Initial CourseWork`/`Parse Retry CourseWork`; para los otros problemas: `Apply Gap Analysis`, `Normalize Titles & Keys & Dependencies` y `Plan and Topological Sort`. Ambos triggers ahora convergen antes del selector. Los antiguos nodos de espera/retry están fuera de la ruta normal sin pendientes.

3. **Bootstrap.** Una operación manual explícita consulta todas las páginas publicadas por curso y genera `proposedRegistry`. Cada ID observado queda `ignored_historical` con razón `present_before_automation_cutover`. La importación explícita guarda el snapshot; no hay comparación `week <= 3` ni IDs de actividades incrustados en el algoritmo. Se rechaza repetir bootstrap sobre un curso registrado.

4. **Persistencia.** `staticData.global.classroomRegistry[courseId].entries[courseWorkId]`, en la base SQLite de n8n del volumen `classroom_automation_n8n_data`. El curso es el namespace; `courseWorkId` es la identidad de la actividad. `tools/prepare-install.mjs` conserva estado, ID del workflow, credenciales y nodos ajenos al fix. Backup local: `.local/workflow-before-selection-fix.json`, excluido de Git.

5. **Estados.** `ignored_historical` excluye permanentemente los IDs del snapshot; un ID publicado, aplicable y no registrado se considera `pending`; `processed` exige un conjunto GitHub existente y completo. `failed` es reintentable; `processing`, `skipped` y `superseded` se excluyen. Los últimos estados son compatibles con el registry, pero no se inicia procesamiento productivo ni se marca un preview como processed. Las escrituras de observación sólo corresponden a Schedule; los manuales no persisten cambios.

6. **Sin nueva actividad.** Fin inmediato con `no_pending_coursework`, cero Issues y sin LLM, notificación ni fallback hacia una semana histórica. Sin registry se devuelve `historical_bootstrap_required`, también sin planificar.

7. **Override.** `manualCourseWorkOverride` acepta un ID existente y aplicable únicamente con trigger manual explícito y entorno `AUTOMATION_MODE=dry-run`. Schedule/live lo rechazan. El preview muestra `manual_test_override`, `courseWorkState` e `historicalStatus`. El estado histórico permanece igual; se comprobó por exportación posterior. La semana dejó de ser selector.

8. **Causa de Julian en cero.** El código anterior ya admitía medium para Julian; no era una prohibición absoluta. El problema reproducible era que easy elegía exclusivamente a Osbaldo mientras su carga fuese menor o igual a la mínima de los otros más dos. Con poco trabajo fácil, Julian podía quedar fuera. No había expansión personal ni comprobación final de cobertura.

9. **Matriz.** Hard: Draggodeidad/Julian; medium: preferencia Julian/Draggodeidad y Osbaldo sólo con riesgo bajo y categoría compatible; easy técnica/funcional: participan los tres según capacidad y carga, con prioridad inicial Julian; easy testing/docs/validación sencilla: preferencia Osbaldo. Se evitan auth, seguridad, arquitectura, persistencia compleja y otros riesgos para Osbaldo.

10. **Balance.** Pesos easy=1, medium=2, hard=3. Selección por carga funcional y, para hard, carga técnica. Desempates deterministas. Una revisión final mueve una tarea real compatible desde quien tiene varias hacia quien queda en cero; nunca añade una tarea por equidad.

11. **Pesos separados.** Cada Issue expone `functionalWeight`, `technicalWeight`, `operationalWeight` y `personalRequirementWeight`. Foundation y delivery pertenecen al owner y no pesan funcionalmente. La evidencia personal tampoco infla el balance funcional.

12. **EXISTS ≠ COMPLETE.** Se agregó lectura del contenido real del repositorio, fijada al árbol consultado. El estado propuesto por el LLM no prueba cumplimiento. `complete` exige revisión de cobertura por requisito vinculada a fuente, excerpt y SHA actual; una ruta o título solos nunca bastan. El mecanismo conservador y su dependencia de revisión explícita están descritos en [COVERAGE-REVIEWS.md](COVERAGE-REVIEWS.md).

13. **Partial.** Hay cobertura de algunos requisitos o contenido existente todavía por verificar. Con cobertura parcial verificada, objetivos, alcance, pasos, aceptación, pruebas y DoD se reducen a lo no satisfecho. El trabajo ya cubierto se registra fuera del alcance. Un SHA cambiado invalida la revisión anterior. `not_applicable` exige revisión y razón explícita.

14. **Expansión personal.** Se buscan exigencias explícitas en Classroom/starter/rúbrica cargada, incluidas listas siguientes a la frase personal. Se generan responsabilidades para cada integrante; los campos se copian de la fuente, sin inventar commits, decisiones, pruebas o uso de IA que no se pidan. Sin requisito explícito —o con negación— no se generan tres tareas.

15. **No delegable.** `personalRequirement=true`, `delegable=false`, `personalOwner` y key estable `evidence-<login>`; el asignador y `Validate Final Assignment` rechazan reasignación a otra persona. La categoría final es `individual-evidence`.

16. **Responsabilidad propia.** HU: «Como integrante X, quiero documentar MI contribución…». Los tres pueden editar un archivo compartido, pero cada Issue pertenece a su persona. Las revisiones de cobertura también son por integrante; evidencia de Julian no satisface evidencia de otro. Si una persona ya tiene cobertura completa verificada, se registra en `completePersonalEvidence` y no se inventa trabajo adicional.

17. **Dependencias.** Las tareas excluidas por complete se retiran de `dependsOn` y se guardan en `satisfiedDependencies` con `already_satisfied` y sus pruebas. La normalización ya no borra silenciosamente referencias desconocidas. Se rechazan keys inexistentes, duplicados y ciclos. Evidencia espera las contribuciones de su propietario o el baseline necesario; delivery espera trabajo requerido y evidencia personal pendiente.

18. **Team Coverage.** El preview muestra Issues funcionales, evidencia personal, operaciones y todos los pesos por integrante. Cuando hay varias tareas compatibles en otra persona, se rebalancea sin dejar a ese donante en cero; cuando no hay trabajo disponible, se explica el cero.

19. **Warnings.** `WARNING_ASSIGNMENT_IMBALANCE` documenta rebalanceo; `INFO_NO_COMPATIBLE_WORK` explica ausencia de trabajo disponible compatible; `WARNING_UNVERIFIED_COMPLETION` impide aceptar un complete sin prueba. `PLAN_INVALID` rechaza plan estructural o responsabilidad inválida. También se rechazan snapshots incompletos y resets de bootstrap.

20. **Tests A–R.** Los 18 pasan, más integración con parser/validator y nodos exportados, evidencia personal ya satisfecha, observación de processed e importación persistente: **22 checks** en la suite nueva. También pasa la suite anterior de orquestación IA, grounding, ZIP, cron y seguridad de artefactos. No son tests de llamadas reales a los proveedores.

21. **Ejemplo sin pendiente, real PWA.**

```json
{"mode":"dry-run","executionResult":"no_pending_coursework","mutationsPerformed":false,"historicalCourseworkCount":3,"pendingCourseworkCount":0}
```

22. **Ejemplo nueva actividad, fixture.** Un ID `new-a` que no pertenece al snapshot se selecciona `pending`, aunque la API devuelva primero `new-z`. A igualdad de fecha gana el ID lexicográficamente menor. No se presupone su número de semana. Ver `newCoursework` en [ejemplos reproducibles](SELECTION-ASSIGNMENT-EXAMPLES.json).

23. **Ejemplo medium, fixture.** Cero hard, dos medium y dos easy: Julian recibe una medium. El reparto completo está en `mediumAssignment` del JSON de ejemplos.

24. **Ejemplo easy sin hard, fixture.** Tres easy funcionales compatibles: una para Julian, una para Draggodeidad y una para Osbaldo; `easyAssignment` contiene keys y assignees exactos. Con una sola documentación sencilla, Osbaldo puede recibirla y los demás quedan en cero con explicación.

25. **Tres evidencias, fixture.** `evidence-draggodeidad → Draggodeidad`; `evidence-juliandele → JulianDele`; `evidence-osbaldoxxc → osbaldoXxC`. Todas tienen `delegable=false`, carga funcional cero y dependencias específicas. Ver `personalEvidence` en el JSON de ejemplos.

26. **Límites restantes.** La cobertura semántica requiere revisión explícita del operador; no se incluyó un nuevo evaluador LLM ni se modificó el contrato protegido del proveedor. Sin revisión, contenido correcto puede continuar como partial por verificar. Se leen hasta 20 archivos relevantes de 100 KB; los no cargados no sirven para complete. Las fuentes externas no extraídas —por ejemplo una rúbrica en PDF sin contenido textual cargado— no permiten inferir requisitos personales. Bootstrap cubre lo publicado y visible para la cuenta; un borrador invisible que aparezca después será nuevo. La metadata semanal sigue requiriendo un título reconocible. Static data no es un bloqueo distribuido para ejecuciones productivas concurrentes. La producción continúa deshabilitada, incluidos los Schedule; los tests de asignación y futuro coursework son fixtures. No se afirma que exista W04 ni que se haya ejecutado planificación real con ella.

## Archivos y uso

- Fuentes: `src/classroom/`, `src/ai/apply-gap-analysis.js`, `src/github/*contents*`, `src/planning/`, `src/registry/` y reporting.
- Workflow importable: `workflows/classroom-to-github.json`.
- Instalación que preserva estado: `tools/prepare-install.mjs`.
- Ejecución local: `npm run build` y `npm test`.
- [Bootstrap y scheduling](SCHEDULING.md), [formato de cobertura](COVERAGE-REVIEWS.md), [datos reales de verificación](SELECTION-LIVE-VERIFICATION.json), [ejemplos A–R](SELECTION-ASSIGNMENT-EXAMPLES.json).

Referencias consultadas: [Classroom courseWork.list](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/list), que admite orderBy por updateTime/dueDate —el orden de creación se aplica localmente—; y [static data de n8n](https://github.com/n8n-io/n8n-docs/blob/main/docs/build/code-in-n8n/cookbook/built-in-methods-and-variables-examples/getworkflowstaticdata.md), que no persiste cambios de pruebas manuales. También se inspeccionó la implementación instalada de HTTP Request/CLI para paginación e importación.
