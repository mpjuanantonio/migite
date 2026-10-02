# Migite

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Estado](https://img.shields.io/badge/estado-F0%20%C2%B7%20Fundaci%C3%B3n-informational)](#estado)

> Tu mano derecha, siempre para lo que necesites.

Agente personal de productividad. **Self-hosted** y **BYOK**: tú aportas tus propias claves de proveedor LLM.

## Estado

Fase **F0 — Fundación**: infraestructura y pipeline listos antes que el código (a partir de F1).

## Stack

| Capa | Tecnología |
| --- | --- |
| Runtime | Node.js 22 (Alpine) |
| Lenguaje | TypeScript estricto |
| LLM | LiteLLM (BYOK) |
| Búsqueda | SearXNG |
| Datos | PostgreSQL 16 |
| Despliegue | Docker Compose (dev / prod) |

## Puesta en marcha

### Requisitos

- Docker y Docker Compose
- Archivo `.env` a partir de `.env.example`

### Desarrollo (hot-reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Producción

```bash
VERSION=vX.Y.Z docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Servicios

| Servicio | Puerto | Rol |
| --- | --- | --- |
| `app` | 3000 | Aplicación principal |
| `litellm` | 4000 | Proxy LLM (BYOK) |
| `postgres` | interno | Persistencia |
| `searxng` | interno | Búsqueda web |

Los datos persisten en los volúmenes `vault`, `appdata` y `pgdata`.

## Arquitectura

Decisiones vigentes (detalle en `AGENTS.md`):

- Monorepo por capas: `apps/` no se importa desde `packages/core`.
- Puertos y adaptadores: interfaces en `core`, implementaciones fuera.
- Eventos para efectos secundarios.
- Migraciones de base de datos versionadas desde el primer commit.

## Calidad

Pipeline de CI en cada PR y push a `main`: `lint`, `typecheck`, `test` y `build`.

- Tests de integración sobre unitarios para rutas de API.
- Ningún test llama a servicios externos (mocks siempre).

## Desarrollo con agentes

El repositorio configura un equipo de agentes de [opencode](https://opencode.ai) en `opencode.json`:

| Agente | Rol |
| --- | --- |
| `orchestrator` | Descompone y delega; no escribe código |
| `implementador` | Features, fixes, boilerplate y migraciones |
| `code-reviewer` | Auditoría de calidad y bugs (read-only) |
| `test-architect` | Estrategia y escritura de tests |
| `security-auditor` | Auditoría de seguridad (read-only) |
| `docs-writer` | Documentación |

## Licencia

[Apache License 2.0](LICENSE)
