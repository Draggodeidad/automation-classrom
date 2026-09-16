# Setup de Google Classroom

## 1. Proyecto de Google Cloud

1. Crea o selecciona un proyecto en Google Cloud Console.
2. Habilita **Google Classroom API** y **Google Drive API**.
3. Configura la pantalla de consentimiento OAuth.
4. Para una automatización personal, selecciona `External` y agrega tu cuenta como test user mientras la app permanezca en Testing.
5. Crea un cliente OAuth 2.0 de tipo **Web application**.
6. Copia desde la credencial n8n la **OAuth Redirect URL** exacta y agrégala como Authorized redirect URI en Google Cloud.

## 2. Credencial genérica en n8n

Crea una credencial **OAuth2 API** llamada exactamente:

```text
Google Classroom and Drive OAuth2
```

Configura:

```text
Grant Type: Authorization Code
Authorization URL: https://accounts.google.com/o/oauth2/v2/auth
Access Token URL: https://oauth2.googleapis.com/token
Client ID: <cliente de Google Cloud>
Client Secret: <secreto de Google Cloud>
Authentication: Body
```

Scopes, separados por espacio:

```text
https://www.googleapis.com/auth/classroom.courses.readonly
https://www.googleapis.com/auth/classroom.coursework.me.readonly
https://www.googleapis.com/auth/drive.readonly
```

Agrega a la autorización:

```text
access_type=offline
prompt=consent
```

Conecta la cuenta que es alumna de DMI y PWA. n8n almacenará y renovará el refresh token en su base SQLite cifrada con `N8N_ENCRYPTION_KEY`.

## 3. Resolver Course IDs una sola vez

Durante setup ejecuta, con la misma credencial:

```http
GET https://classroom.googleapis.com/v1/courses?pageSize=100&courseStates=ACTIVE&fields=courses(id,name,section,courseState),nextPageToken
```

Identifica DMI y PWA por `name`/`section`, copia sus `id` y guárdalos en `.env`:

```env
CLASSROOM_PWA_COURSE_ID=...
CLASSROOM_DMI_COURSE_ID=...
```

Reinicia n8n después de cambiar `.env`. El workflow no llama `courses.list` durante las ejecuciones semanales.

## 4. Verificación de sólo lectura

Prueba cada ID con:

```http
GET https://classroom.googleapis.com/v1/courses/{courseId}/courseWork?courseWorkStates=PUBLISHED&orderBy=updateTime%20desc&pageSize=5
```

No concedas scopes de escritura. El workflow no crea, modifica, entrega ni califica trabajo de Classroom.

## Justificación de scopes

- `classroom.courses.readonly`: sólo para descubrir/confirmar los IDs durante setup.
- `classroom.coursework.me.readonly`: permite a la cuenta alumna listar su CourseWork publicado.
- `drive.readonly`: se explica en [SETUP-DRIVE.md](SETUP-DRIVE.md); es necesario para adjuntos del profesor no seleccionados mediante Picker.

Referencias oficiales: [Classroom OAuth scopes](https://developers.google.com/workspace/classroom/guides/auth), [`courses.courseWork.list`](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/list) y [recurso CourseWork](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork).
