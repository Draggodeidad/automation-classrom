# Estado del proyecto

Proyecto de prueba para automatizar la lectura de actividades de Google Classroom y convertirlas en Issues de GitHub usando n8n.

Este archivo es intencionalmente simple porque el objetivo actual es probar el trabajo remoto desde ChatGPT en celular.

## Resumen

- Nombre: `classroom-github-automation`
- Tipo: automatizacion n8n self-hosted
- Entrada principal: Google Classroom
- Soporte de archivos: Google Drive para revisar starters ZIP
- Salida principal: GitHub Issues
- Modo recomendado actual: `dry-run`

## Componentes principales

- `workflows/`: workflows importables en n8n.
- `src/classroom/`: lectura y normalizacion de CourseWork.
- `src/drive/`: inspeccion y validacion segura de archivos ZIP.
- `src/github/`: contexto, labels, deduplicacion e Issues.
- `src/ai/`: validacion y normalizacion del plan generado.
- `src/planning/`: orden y preparacion de Issues.
- `src/reporting/`: resumenes de ejecucion.
- `docs/`: guias de configuracion y pruebas.
- `tests/`: validaciones automaticas del proyecto.

## Comandos utiles

```bash
npm run build
npm test
```

`npm run build` regenera los workflows desde el codigo fuente.

`npm test` valida que la estructura, reglas y artefactos principales sigan correctos.

## Estado actual

- El proyecto ya tiene README y documentacion de setup.
- Existen workflows para Classroom a GitHub y manejo de errores.
- Hay pruebas automatizadas con `tests/validate-artifacts.mjs`.
- La automatizacion esta pensada para correr primero en `dry-run`.
- Queda revisar credenciales reales en n8n antes de usar modo `live`.

## Pendientes simples

- Ejecutar `npm test` despues de cambios importantes.
- Importar o actualizar workflows en n8n cuando cambien los JSON.
- Confirmar credenciales de Classroom, Drive, GitHub y AI.
- Pasar a `live` solo cuando el dry-run genere el resultado esperado.

## Nota

Este `STATUS.md` fue agregado como prueba sencilla de edicion remota del proyecto desde ChatGPT.
