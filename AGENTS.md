## ESTILO
- TypeScript estricto: nada de `any`
- Exports con nombre; sin comentarios salvo que se pidan
- Un router/feature por módulo

## TRAMPAS (GOTCHAS)
- SQLite requiere modo WAL para lecturas concurrentes
- El orden de middleware importa para auth
- Nunca tocar `*.env` (denegado también por permisos)

## DECISIONES_DE_ARQUITECTURA
- Monorepo por capas: apps/ no se importa desde packages/core
- Puertos y adaptadores: interfaces en core, implementaciones fuera
- Eventos para efectos secundarios
- Migraciones de BD versionadas desde el commit 1

## ESTRATEGIA_DE_TESTS
- Integración sobre unitarios para rutas de API
- Ningún test llama a servicios externos (mocks siempre)
