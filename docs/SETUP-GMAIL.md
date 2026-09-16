# Configuración exacta de Gmail OAuth

La credencial debe llamarse **`Gmail account`**, porque ese nombre está referenciado por los workflows importables. Se puede remapear manualmente después de importar.

## 1. Preparar n8n y obtener el redirect URI

1. Levanta n8n con `docker compose up -d` y abre `http://localhost:5678`.
2. En **Credentials → Create Credential**, busca **Gmail OAuth2 API**.
3. Selecciona **Custom OAuth2** si aparece un selector de autenticación.
4. Copia el valor que n8n muestra como **OAuth Redirect URL**. En local debe ser exactamente:

   `http://localhost:5678/rest/oauth2-credential/callback`

   No cambies protocolo, hostname, puerto, slash ni mayúsculas. La guía oficial de n8n confirma que localhost es válido para desarrollo sin dominio público: [Google OAuth2 single service](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/).

## 2. Crear el proyecto en Google Cloud

1. Abre [Google Cloud Console](https://console.cloud.google.com/).
2. Selector de proyecto → **New Project**.
3. Nombre sugerido: `classroom-github-automation`.
4. Con el proyecto seleccionado, ve a **APIs & Services → Library**.
5. Busca **Gmail API** y pulsa **Enable**.

No habilites Google Drive, Classroom API ni Pub/Sub: este workflow no los usa.

## 3. Configurar OAuth consent screen

1. Ve a **Google Auth Platform → Overview → Get started**.
2. App name: `Classroom GitHub Automation`.
3. User support email: tu cuenta Gmail.
4. Audience:
   - **Internal** si la cuenta pertenece a un Google Workspace que controlas.
   - **External** para una cuenta Gmail personal.
5. Acepta la política y crea la app.
6. Si elegiste External, entra a **Audience → Test users** y añade exactamente la cuenta que recibirá los correos de Classroom.

Advertencia: una app External en estado Testing puede expirar el refresh token a los siete días. Para operación continua, mueve la app a Production cuando hayas terminado las pruebas. Si Google muestra la pantalla de app no verificada, continúa únicamente porque tú creaste la app y eres su único usuario; no distribuyas este OAuth client.

## 4. Crear el OAuth client

1. Ve a **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `n8n local Gmail`.
5. En **Authorized redirect URIs**, pega el URI copiado de n8n:

   `http://localhost:5678/rest/oauth2-credential/callback`

6. Crea el client y copia **Client ID** y **Client Secret**.

## 5. Terminar la credencial en n8n

1. Regresa a la credencial Gmail OAuth2 API.
2. Name: `Gmail account`.
3. Pega Client ID y Client Secret.
4. Activa **Custom Scopes**.
5. Sustituye los scopes predeterminados por sólo:

   `https://www.googleapis.com/auth/gmail.modify`

6. Pulsa **Sign in with Google**, concede acceso y guarda.

`gmail.modify` permite leer mensajes, enviar el resumen y modificar labels sin permitir borrado permanente. Es suficiente para todos los nodos de este proyecto. No uses `https://mail.google.com/`. Referencias: [scopes oficiales](https://developers.google.com/workspace/gmail/api/auth/scopes) y [credencial Gmail de n8n](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/credentials/GmailOAuth2Api.credentials.ts).

## 6. Crear la label de idempotencia

En Gmail web:

1. Barra lateral → **Create new label**.
2. Nombre: `Processed`.
3. Activa **Nest label under** y crea/elige `Automation/Classroom` según la interfaz, hasta que el nombre completo visible sea:

   `Automation/Classroom/Processed`

Alternativamente crea una label con ese nombre jerárquico desde la administración de labels. Verifica que aparezca en el selector del nodo `Gmail - Mark Processed`.

## 7. Prueba mínima

1. Abre el workflow principal.
2. En cada nodo Gmail selecciona `Gmail account` si n8n no lo remapeó automáticamente.
3. Ejecuta sólo `Gmail - Search Candidates`.
4. Debe devolver máximo 20 mensajes de los últimos 21 días que cumplan:

   `from:no-reply@classroom.google.com newer_than:21d -label:Automation/Classroom/Processed`

No marques nada manualmente durante el dry run.

## Cuota

El volumen semanal de este workflow está muy por debajo de los límites publicados. Google indica que el uso estándar bajo el umbral diario no incurre costo adicional; consulta siempre la [tabla vigente](https://developers.google.com/workspace/gmail/api/reference/quota).
