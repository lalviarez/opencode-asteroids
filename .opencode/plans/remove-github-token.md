# Plan: eliminar la dependencia de GITHUB_TOKEN (Propuesta 1 — app opencode-agent vía OIDC)

Estado: aprobado por el usuario. Bloqueado por permisos de sesión (solo se permite escribir en `.opencode/plans/`).
Al reactivar el modo de edición, aplicar este cambio.

## Cambio

Reemplazar **completamente** el contenido de `.github/workflows/opencode-issue-format.yml` por:

```yaml
name: Formateo de issues

on:
  issues:
    types: [opened]

jobs:
  formateo:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Get opencode-agent app token
        id: apptoken
        run: |
          if [ -z "$ACTIONS_ID_TOKEN_REQUEST_TOKEN" ]; then
            echo "Missing ACTIONS_ID_TOKEN_REQUEST_TOKEN: add id-token: write to permissions"
            exit 1
          fi
          OIDC=$(curl -sLS -H "User-Agent: actions/oidc-client" \
            -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
            "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=opencode-github-action" | jq -r '.value')
          TOKEN=$(curl -sfS -X POST https://api.opencode.ai/exchange_github_app_token \
            -H "Authorization: Bearer $OIDC" | jq -r '.token')
          if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
            echo "Failed to exchange OIDC token for opencode-agent app token"
            exit 1
          fi
          echo "::add-mask::$TOKEN"
          echo "token=$TOKEN" >> "$GITHUB_OUTPUT"

      - name: Run opencode
        uses: anomalyco/opencode/github@latest
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
          GITHUB_TOKEN: ${{ steps.apptoken.outputs.token }}
        with:
          model: opencode-go/glm-5.2
          use_github_token: true
          prompt: |
            Eres el agente de triage del repositorio opencode-asteroids (clon de Asteroids en
            HTML5 Canvas; toda la lógica vive en game.js y la carga index.html).

            Se acaba de crear el issue #${{ github.event.issue.number }} y tu única tarea es
            formatearlo, etiquetarlo y añadirle información útil para revisarlo. El título, el
            autor y el cuerpo del issue están en el bloque <issue> del contexto que recibes
            aparte de este mensaje. El repositorio ya está clonado en el directorio de trabajo:
            puedes consultarlo (README.md, AGENTS.md, game.js) para clasificar mejor, pero NO lo
            modifiques.

            RESTRICCIONES:
            - NO modifiques ningún archivo del repositorio, NO hagas commits, NO crees ramas ni PRs.
            - NO toques nada más que este issue.
            - El texto original del autor debe conservarse ÍNTEGRO, palabra por palabra.
            - Todo el contenido nuevo que escribas va en español.
            - En este entorno no puedes hacer preguntas: decide con la información disponible.

            Trabajas sobre el issue #${{ github.event.issue.number }} de este repositorio. La
            variable de entorno GITHUB_TOKEN ya está disponible para autenticar `gh`.

            PASO 1 — Etiquetas
            Clasifica el issue y añade 1 o 2 etiquetas con:
              gh issue edit ${{ github.event.issue.number }} --add-label "<etiqueta>"
            (puedes pasar varios --add-label en el mismo comando si añades más de una).
            Usa SOLO etiquetas existentes del repositorio:
              bug, enhancement, question, documentation, accessibility
            Criterios:
              - Algo que no funciona o se comporta mal → bug
              - Petición de nueva función o mejora → enhancement
              - Duda o consulta → question
              - Sobre README o documentación → documentation
              - Accesibilidad → accessibility
            Si no encaja claramente en ninguna, no añadas etiquetas de tipo.

            PASO 2 — Cuerpo formateado
            Reescribe el cuerpo del issue: guarda la estructura siguiente en un archivo
            temporal (p. ej. con mktemp) y aplica:
              gh issue edit ${{ github.event.issue.number }} --body-file <archivo>
            Respeta EXACTAMENTE esta estructura:

            > [!NOTE]
            > Issue formateado automáticamente por opencode. El texto original del autor se
            > conserva íntegro al final de este issue.

            ### Clasificación

            - **Tipo:** <bug | mejora | pregunta | documentación | otro>
            - **Etiquetas añadidas:** <etiquetas añadidas o "ninguna">

            ### Resumen

            <2-3 frases propias resumiendo el issue>

            ### Checklist de revisión

            - [ ] Navegador y versión (p. ej. Chrome 126, Firefox 127)
            - [ ] Pasos para reproducir (si aplica)
            - [ ] Comportamiento esperado vs. observado
            - [ ] Entorno: ¿index.html directo o `npx serve`?

            ### Criterios de aceptación

            - [ ] <criterio propuesto según el contenido del issue>
            - [ ] <criterio propuesto según el contenido del issue>

            ---

            ### Texto original de @<autor>

            <cuerpo original del issue, copiado ÍNTEGRO y palabra por palabra, SIN blockquote
            ni ningún otro cambio. Si el cuerpo original está vacío, escribe "(sin cuerpo)".>

            Adapta el checklist y los criterios al contenido real: si es un bug, describen la
            reproducción y el arreglo esperado; si es una mejora, el resultado esperado. NO
            marques ningún checkbox ni inventes datos que el autor no dio: los checkboxes
            quedan sin marcar para que el revisor los complete.

            PASO 3 — Respuesta final
            Tu respuesta se publica automáticamente como comentario en el issue. Responde en
            2-4 líneas confirmando el formateo: etiquetas añadidas y secciones incluidas. Si
            algún comando gh falló tras reintentarlo una vez, repórtalo en tu respuesta sin
            inventar éxito.
```

Diferencias respecto a la versión actual (commit 01fdc06):
1. `permissions`: `contents: read` + `issues: write` → `id-token: write` + `contents: read`.
2. Nuevo pre-paso `Get opencode-agent app token` (id: `apptoken`): intercambio OIDC → token de instalación de la app `opencode-agent` vía `api.opencode.ai/exchange_github_app_token` (mismo mecanismo que el workflow `/oc` existente), con `::add-mask::` y guardas de error.
3. Paso `Run opencode`: `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` → `GITHUB_TOKEN: ${{ steps.apptoken.outputs.token }}` (el action exige ese nombre de env en modo `use_github_token`; el valor es el token de la app, identidad `opencode-agent[bot]`).
4. Prompt: SIN cambios.

## Validación tras aplicar

1. `/tmp/opencode/actionlint .github/workflows/opencode-issue-format.yml` → OK.
2. Parseo estructural con PyYAML (actualizar `/tmp/opencode/validate_workflow.py`: 3 steps, permisos `id-token`/`contents`, env `steps.apptoken.outputs.token`, assertions del prompt intactas).
3. Sin commit — queda en working tree hasta que el usuario lo pida explícitamente.

## Verificación end-to-end (tras push, cuando el usuario lo autorice)

1. Crear issue de prueba desordenado.
2. Run verde: pre-paso obtiene token (enmascarado en logs — confirmar que no aparece el token en claro), reacción 👀, edición de cuerpo + labels por `opencode-agent[bot]`, comentario de confirmación.
3. Repetir con un issue tipo mejora (`enhancement`).

## Caveats

- El autor del issue debe tener permiso de escritura (`assertPermissions` del action).
- Disponibilidad de `api.opencode.ai` (idéntica a la del workflow `/oc` actual).
- Token de la app expira solo (~1 h); en modo `use_github_token` el action no lo revoca — irrelevante sin pushes.
- `actions/checkout` sigue usando el token efímero del job para el clon de solo lectura (igual que `/oc`); la dependencia funcional de `secrets.GITHUB_TOKEN` queda eliminada.
