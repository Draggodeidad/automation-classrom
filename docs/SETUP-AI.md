# Configuración de IA

Gemini es siempre el primario. Cada intento pasa por extracción, `JSON.parse`, el schema local original y las reglas de negocio existentes.

```text
Gemini válido → preview
Gemini PARSE_ERROR / SCHEMA_ERROR → un Gemini Repair → preview si válido
Gemini TRANSPORT_ERROR / PROVIDER_ERROR, o Repair inválido → Qwen
Qwen inválido / error → GLM
GLM inválido / error → FAIL_CLOSED
```

## Configuración y credenciales

```env
AI_PRIMARY_PROVIDER=gemini
GEMINI_MODEL=gemini-3.6-flash
OPENROUTER_PRIMARY_MODEL=qwen/qwen3.8-27b:free
OPENROUTER_FALLBACK_MODEL=z-ai/glm-5.2:free
AI_TEMPERATURE=0.1
AUTOMATION_MODE=dry-run
```

Los modelos OpenRouter permanecen fijados a los IDs solicitados. Su disponibilidad depende del catálogo y las lanes del proveedor; un modelo inexistente o no disponible se clasifica como error y activa la siguiente transición.

En n8n, configura Credentials de tipo Header Auth:

- `Gemini API Key`: header `x-goog-api-key`. Asignar a `Gemini - Plan` y `Gemini - Repair Once`.
- `OpenRouter API Key`: header `Authorization`, valor `Bearer <clave>`. Asignar a `OpenRouter - Chat Completion` y `OpenRouter - GLM`.

Las claves permanecen en Credentials cifradas. Los archivos importables sólo contienen referencias por nombre; selecciona las credenciales existentes al importar.

## Payloads y validación

`LLM Request` produce una única fuente para system prompt, user prompt, contexto y schema completo. `build-llm-payload.js` implementa los adapters:

- Gemini conserva `responseMimeType` y la proyección compatible `responseJsonSchema`. El schema completo también va en el prompt y se valida localmente. No se añade temperatura a Gemini.
- Qwen usa `response_format=json_schema` y `provider.require_parameters=true` para seleccionar una lane que admita los parámetros. Si no existe, pasa a GLM sin retries.
- GLM envía el mismo prompt canónico y el schema como texto. Omite `response_format`, `json_schema`, `json_object`, `tools` y `tool_choice` como parámetros API. El parser elimina únicamente un bloque Markdown exterior completo, aplica `JSON.parse` y valida localmente. No extrae arbitrariamente fragmentos JSON de una respuesta con prosa.

OpenRouter documenta que el soporte de structured outputs depende del endpoint, no sólo del modelo: [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs). Se mantiene el validator local como autoridad final.

## Repair y límites

Repair recibe fuentes originales, schema original completo, respuesta anterior y todos los errores exactos. Solicita conservar contenido correcto y no inventar requisitos, archivos, comandos, versiones, rutas, endpoints ni criterios. Máximo una llamada de repair, sólo después de un fallo reparable de Gemini inicial.

La normalización determinista ocurre antes del schema: trim, minúsculas y `_` → `-` en keys, con actualización de las referencias exactas en `dependsOn`. Sólo se aplica si todas las keys resultantes son válidas y no hay duplicados ni colisiones. No se completa contenido semántico.

Los cuatro requests HTTP tienen `retryOnFail=false`, timeout de 120 segundos, respuesta HTTP completa y continuación controlada ante errores. OpenRouter recibe `allow_fallbacks=false`; las transiciones las controla el workflow. Hay como máximo cuatro llamadas: Gemini, Repair opcional, Qwen y GLM. El grafo LLM es acíclico.

## Estados y cierre seguro

- `TRANSPORT_ERROR`: 408/429/5xx, timeout, red o ausencia de status HTTP.
- `PROVIDER_ERROR`: otros HTTP no exitosos, autenticación, parámetros rechazados, bloqueo o error explícito del proveedor, incluso con HTTP 200.
- `PARSE_ERROR`: JSON no parseable, vacío o respuesta truncada.
- `SCHEMA_ERROR`: JSON parseable que incumple el schema o las reglas de negocio/grounding existentes. `schemaStatus` distingue schema de las reglas posteriores.
- `VALID`: parse, schema y reglas de negocio correctos.

`failureReason` es un objeto con tipo, proveedor, modelo, status y mensaje. Incluye `validationErrors` sólo cuando corresponde. Los intentos conservan orden, stage, normalizaciones, duración, `repairUsed` y `fallbackUsed` en `aiObservability`; `stateHistory` muestra las transiciones.

`Fail Closed - Invalid Plan` lanza un error terminal con el historial completo y `mutationsPerformed=false`. Nunca devuelve el último plan inválido. La preview también expone el historial.

**Bloqueo de revisión:** `LLM Request` y la validación fuerzan `mode=dry-run` y `automationMode=dry-run`, incluso si el entorno dice `live`. Este cambio no habilita producción. El workflow importable está inactivo. Retirar este bloqueo requiere una revisión posterior explícita.

## Pruebas

Ejecuta `npm run build` y `npm test`. Los casos A–J recorren los nodos, expresiones y conexiones reales del JSON generado, sustituyendo sólo las respuestas HTTP. No consumen cuota de proveedores.

Consulta [LLM-ORCHESTRATION-REPORT.md](LLM-ORCHESTRATION-REPORT.md) y [los cinco ejemplos completos](LLM-ORCHESTRATION-EXAMPLES.json). La prueba I comprueba la ausencia de parámetros de grammar en el request GLM; no certifica por sí sola el comportamiento de una lane remota.
