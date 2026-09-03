---
description: Crea un git worktree con rama feature/<nombre> en ../worktrees/<repo-actual>/feature/<nombre>. Si el nombre contiene espacios, pregunta si convertirlo a snake_case.
---

El argumento recibido es: $ARGUMENTS

Reglas antes de ejecutar el comando:
1. Si el argumento contiene espacios, esa forma no es correcta. Pregunta al usuario con la herramienta `question` si quieres que lo conviertas a snake_case (todo a minúsculas y espacios → guiones bajos; p. ej. "Mi Feature Nueva" → "mi_feature_nueva"), mostrándole el nombre convertido propuesto:
   - Si acepta: usa el nombre convertido en lugar del argumento en el comando y ejecútalo.
   - Si rechaza: NO ejecutes el comando ni ninguna otra acción, y muestra únicamente el mensaje: worktree no creado
2. Si el argumento no contiene espacios, úsalo tal cual.

Ejecuta este comando bash desde el directorio de trabajo actual y no hagas nada más (sin commits ni acciones extra), usando el nombre resultante de las reglas anteriores:

git worktree add -b feature/$ARGUMENTS ../worktrees/$(basename "$PWD")/feature/$ARGUMENTS
