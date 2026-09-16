# Configuración de IA

## Opción A — Gemini Free Tier (default)

El workflow usa `gemini-2.5-flash`, modelo estable con structured outputs y capa gratuita vigente al 15-09-2026. No vincules billing si quieres evitar cualquier posibilidad de cargo; el proyecto permanecerá en Free Tier y las solicitudes excedentes fallarán en vez de facturarse.

### Crear la key

1. Abre [Google AI Studio](https://aistudio.google.com/).
2. Dashboard → **Projects**. Crea/importa un proyecto.
3. **API Keys → Create API key**.
4. En septiembre de 2026 las claves nuevas de AI Studio son authorization keys vinculadas a service account; no reutilices una standard key antigua. Consulta la [guía oficial de keys](https://ai.google.dev/gemini-api/docs/api-key).
5. Copia la key.

### Guardar en n8n

1. n8n → **Credentials → Create Credential → Header Auth**.
2. Name de la credencial: `Gemini API Key`.
3. Header Name: `x-goog-api-key`.
4. Header Value: la key de AI Studio.
5. Guarda y selecciónala en `Gemini - Plan` y `Gemini - Repair Once`.
6. En `.env` conserva:

   ```env
   AI_PROVIDER=gemini
   GEMINI_MODEL=gemini-2.5-flash
   ```

La solicitud usa `responseMimeType: application/json` y `responseJsonSchema`. Referencias: [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [modelo](https://ai.google.dev/gemini-api/docs/models/gemini), [pricing](https://ai.google.dev/gemini-api/docs/pricing).

### Privacidad

La tabla oficial indica que el contenido de Free Tier puede utilizarse para mejorar productos. El workflow limita el contexto, pero el correo, README, rutas y resúmenes de Issues salen a Google. Si esto no es aceptable, usa Ollama.

## Opción B — Ollama local

### Instalar y descargar modelo

1. Instala Ollama siguiendo [la guía oficial de Linux](https://docs.ollama.com/linux).
2. Descarga el modelo recomendado:

   `ollama pull qwen2.5-coder:7b`

   La imagen cuantizada ocupa aproximadamente 4.7 GB y tiene ventana de 32K según la [biblioteca oficial](https://ollama.com/library/qwen2.5-coder). Para hardware más fuerte, `qwen2.5-coder:14b` suele producir planes/JSON mejores.
3. Prueba: `ollama run qwen2.5-coder:7b`.

### Exponer Ollama sólo al host Docker

Ollama en Linux escucha en `127.0.0.1` por defecto, que no es accesible desde otro contenedor. Crea un override:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

Después recarga y reinicia el servicio:

```text
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

El `docker-compose.yml` ya contiene:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Configura `.env`:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=qwen2.5-coder:7b
```

Referencia oficial para n8n/Linux: [integración Ollama+n8n](https://docs.ollama.com/integrations/n8n). No abras el puerto 11434 en el router ni a Internet; Ollama local no autentica por defecto.

### Validar conexión

Desde el host:

`curl http://localhost:11434/api/tags`

Desde el contenedor n8n:

`docker compose exec n8n wget -qO- http://host.docker.internal:11434/api/tags`

## Cambio de proveedor

1. Edita sólo `AI_PROVIDER` en `.env` (`gemini` u `ollama`).
2. Opcionalmente cambia el modelo asociado.
3. Reinicia n8n: `docker compose up -d`.
4. Ejecuta Manual Dry Run de nuevo.

No es necesario reconstruir/importar el workflow. Un valor distinto de `gemini` se dirige a Ollama; usa exactamente `gemini` u `ollama` para evitar errores de configuración.
