# Setup de Google Drive y starters

## Scope mínimo real

El workflow descarga ZIP adjuntos por el profesor en Classroom. `drive.file` sólo concede acceso por archivo a contenido creado/abierto por la app o compartido con la app mediante un selector compatible. Un adjunto de Classroom no queda seleccionado automáticamente por esta aplicación.

Por ello el modo desatendido usa:

```text
https://www.googleapis.com/auth/drive.readonly
```

No se solicita `drive`, ni ningún permiso de escritura. `drive.metadata.readonly` tampoco sirve porque prohíbe descargar contenido.

`drive.readonly` está clasificado por Google como **restricted scope**. Para uso personal limita la app a la cuenta configurada y mantenla en Testing. Si se publica para otros usuarios o los datos restringidos se almacenan/transmiten en servidores, puede requerir verificación y una evaluación de seguridad según las reglas de Google.

## Flujo de descarga

1. Classroom devuelve el `driveFile.id`.
2. Se solicita metadata:

   ```http
   GET https://www.googleapis.com/drive/v3/files/{fileId}?fields=id,name,mimeType,size,md5Checksum,capabilities(canDownload),modifiedTime
   ```

3. Si `capabilities.canDownload !== true`, se falla cerrado.
4. Para un blob ZIP descargable:

   ```http
   GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
   ```

5. El ZIP se valida, extrae, resume y se descarta como dato de ejecución temporal.

No se usa `alternateLink`, cookies, scraping ni navegador automatizado.

## Retención y límites

El workflow no guarda ZIP en el repositorio. `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` evita inflar SQLite; las ejecuciones exitosas no guardan datos binarios y las fallidas se podan con `EXECUTIONS_DATA_MAX_AGE=24`.

Valores predeterminados:

```env
MAX_ZIP_SIZE_MB=25
MAX_EXTRACTED_SIZE_MB=100
MAX_ZIP_FILES=500
MAX_SINGLE_FILE_MB=10
```

Además se rechazan rutas absolutas/`..`, symlinks, cifrado y ratios superiores a 100:1.

Referencias oficiales: [descargar archivos](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [elegir scopes de Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) y [metadata/capabilities](https://developers.google.com/workspace/drive/api/guides/file-metadata).
