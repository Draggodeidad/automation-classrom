# Configuración exacta de GitHub

Usa un fine-grained personal access token restringido únicamente a los dos repositorios. La credencial n8n debe llamarse **`GitHub account`**.

## 1. Comprobar prerrequisitos

1. Issues debe estar habilitado en:
   - `Draggodeidad/campusops-dmi-team`
   - `Draggodeidad/pwa-utt`
2. `Draggodeidad`, `JulianDele` y `osbaldoXxC` deben ser colaboradores asignables.
3. La cuenta que crea el token debe tener acceso suficiente para asignar usuarios y labels. GitHub puede aceptar la creación de la Issue pero ignorar silenciosamente assignees/labels si la cuenta no tiene push/triage adecuado; la [documentación del endpoint](https://docs.github.com/en/rest/issues/issues#create-an-issue) lo advierte.

## 2. Crear el token fino

1. GitHub → avatar → **Settings**.
2. **Developer settings → Personal access tokens → Fine-grained tokens**.
3. **Generate new token**.
4. Token name: `n8n-classroom-issues`.
5. Expiration: usa una fecha corta razonable (por ejemplo 90 días) y registra un recordatorio para rotarlo.
6. Resource owner: `Draggodeidad`.
7. Repository access: **Only select repositories** y selecciona exactamente:
   - `campusops-dmi-team`
   - `pwa-utt`
8. Repository permissions:
   - **Contents: Read-only** — árbol y README.
   - **Issues: Read and write** — consultar/crear Issues, assignees y labels.
   - **Pull requests: Read-only** — contexto de PRs abiertos.
   - **Metadata: Read-only** — GitHub la incluye como permiso obligatorio/implícito.
9. No concedas Administration, Actions, Workflows, Secrets, Webhooks ni Contents write.
10. Genera y copia el token una sola vez.

Fuentes: [permisos por endpoint](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens), [tokens fine-grained](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## 3. Guardar en n8n

1. n8n → **Credentials → Create Credential → GitHub API**.
2. Authentication: Access Token/PAT.
3. Name: `GitHub account`.
4. Pega el token y guarda.
5. No lo pongas en `.env`, el workflow JSON ni un Code Node.

Los nodos HTTP Request usan esta credencial predefinida; n8n inyecta el token sin exportarlo con el workflow.

## 4. Validación de acceso

Prueba en n8n los nodos, en este orden:

1. `GitHub - Repository` debe devolver `default_branch`.
2. `GitHub - Recent Issues` debe devolver lista o array vacío, no 404.
3. `GitHub - Labels` debe listar labels.
4. `GitHub - Tree` debe devolver `tree`.
5. `GitHub - Open Pull Requests` debe devolver lista o array vacío.

No pruebes `GitHub - Create Issue` hasta estar en un repositorio de sandbox o haber revisado el dry run.

## Labels que el workflow puede crear

Sólo crea las faltantes entre:

- `DMI` o `PWA`;
- `week-NN` de la actividad actual;
- `type:feature`, `type:test`, `type:docs`, `type:devops`, `type:evidence` realmente usados;
- `priority:high`, `priority:medium`, `priority:low` realmente usados.

No crea `owner:*`; el assignee ya representa al propietario.
