# Despliegue self-hosted

Guía para ejecutar Migite en un servidor Linux propio (Ubuntu/Debian) con Docker
Compose. El despliegue es **un único contenedor** (`app`) que sirve la API y los
estáticos de la web, con los datos persistidos en dos volúmenes. El acceso está
pensado para **VPN o red local** (RNF-021): no expongas el puerto 3000 a Internet.

Los mismos ficheros `docker-compose*.yml` y el `Dockerfile` que usa el proyecto
sirven para desarrollo y producción; esta guía solo cubre producción.

## Requisitos

- Linux x86_64 con Docker Engine y el plugin `docker compose` (v2 o superior).
- `git` y `curl`.
- Acceso desde tu equipo por VPN (WireGuard, Tailscale…) o por LAN.
- Servidor de 8 GB de RAM (el contenedor usa bastante menos; no hay límite duro
  configurado).
- Las claves de proveedor LLM son opcionales (BYOK): sin ellas la aplicación
  arranca y solo registra un aviso.

## 1. Clonar el repositorio

```bash
git clone https://github.com/mpjuanantonio/migite.git
cd migite
```

Fija la versión que quieras desplegar. Los tags `vX.Y.Z` los crea el workflow
`Release` al publicar en `main`; si aún no hay ninguno, usa el commit que
quieras:

```bash
git fetch --tags
git tag --list
git checkout v0.1.0        # o el tag que corresponda
```

## 2. Revisar `config/app.yaml`

```yaml
paths:
  vault: ./vault          # documentos; volumen `vault` montado en /app/vault
  index: ./data/index.db  # índice SQLite; volumen `indice` montado en /app/data
timeZone: Europe/Madrid
locale: es
```

- Las rutas son relativas a la raíz del proyecto (`/app` dentro del contenedor)
  y coinciden con los volúmenes de `docker-compose.yml`. Si las cambias, ajusta
  también los `volumes` del compose.
- `timeZone` afecta a la lógica de la aplicación; no hace falta configurar `TZ`
  en el contenedor.
- El fichero se **copia dentro de la imagen**: si lo editas después de construir,
  vuelve a construir (paso 4) o quedará la versión antigua.

## 3. Crear el `.env`

El `.env` vive en la raíz del repo, contiene los secretos, no se versiona y no
se copia a la imagen (está en `.dockerignore`). Compose lo inyecta en el
contenedor (`env_file`). Restringe sus permisos:

```bash
chmod 600 .env
```

### 3.1 `MIGITE_SESSION_SECRET`

Secreto para firmar la cookie de sesión. Debe tener **al menos 32 caracteres**, con
al menos 16 caracteres distintos y sin patrones repetidos:

```bash
openssl rand -hex 32
```

### 3.2 `MIGITE_USER` y `MIGITE_PASSWORD_HASH`

El hash es **argon2** (argon2id). El usuario es el que usarás en el login, sin
espacios alrededor.

**Opción A — con el propio contenedor (recomendada en el servidor).** Construye
primero la imagen (paso 4) y ejecuta:

```bash
export VERSION=v0.1.0
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm \
  -w /app/apps/server app \
  node -e "import('@node-rs/argon2').then((a) => a.hash('TU_CONTRASENA').then(console.log))"
```

**Opción B — con Node 22 en el host.** Requiere las dependencias instaladas
(`pnpm install --frozen-lockfile` en la raíz del repo):

```bash
cd apps/server
node -e "import('@node-rs/argon2').then((a) => a.hash('TU_CONTRASENA').then(console.log))"
```

Ambas opciones imprimen una línea que empieza por `$argon2id$v=19$m=...`.
Cópiala **literal** como valor de `MIGITE_PASSWORD_HASH` (en `.env` no hace
falta entrecomillarla; si la exportas por shell, usa comillas simples para que
`$` no se expanda).

### 3.3 Contenido del `.env`

```dotenv
# Autenticación (obligatorias: el arranque falla si faltan o no son válidas)
MIGITE_USER=ana
MIGITE_PASSWORD_HASH=$argon2id$v=19$m=19456,t=2,p=1$...$...
MIGITE_SESSION_SECRET=pega_aqui_la_salida_de_openssl_rand_hex_32

# Opcional: fuerza `Secure` en la cookie de sesión aunque no llegue `X-Forwarded-Proto`.
# MIGITE_SECURE_COOKIES=1

# Opcional (BYOK, ver config/llm.yaml). El arranque avisa si falta, pero no falla.
# OPENAI_API_KEY=sk-...
```

`PORT` es opcional (por defecto 3000); cambiarlo exige ajustar también el mapeo
`ports` del compose y el healthcheck. Las variables que ya existan en el entorno
del contenedor tienen prioridad sobre el `.env` que la aplicación lee por su
cuenta, así que con `env_file` no hay ambigüedad.

## 4. Construir la imagen

Fija la versión una vez por sesión (compose falla a propósito si falta):

```bash
export VERSION=v0.1.0
```

Construye la imagen de producción (`target: prod` del Dockerfile) y etiquétala
con esa versión:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

La primera construcción descarga dependencias y puede tardar varios minutos.
Durante el build se ejecutan dos *smoke checks* que cargan los binarios nativos
(`better-sqlite3` y `@node-rs/argon2`); si alguno no funciona en Alpine/musl, el
build falla ahí y no se despliega una imagen rota.

Si la imagen ya está publicada en el registro (el workflow `Release` publica en
`ghcr.io/mpjuanantonio/migite`), puedes saltarte el build y desplegarla tal cual:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --pull always
```

## 5. Arrancar

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 6. Verificar el arranque

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
curl -fsS http://localhost:3000/api/health
```

- `ps` debe mostrar `healthy` (el healthcheck tarda unos 10 segundos en pasar de
  `starting` a `healthy`).
- `curl` debe devolver `{"status":"ok"}`.
- Los logs no deben contener errores de configuración. Las migraciones de SQLite
  se aplican solas al arrancar; no hay paso manual.

## 7. Primer login

La interfaz web todavía no incluye formulario de login (llega en una fase
posterior), así que verifica la autenticación contra la API:

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/sesion \
  -H 'content-type: application/json' \
  -d '{"usuario":"ana","contrasena":"TU_CONTRASENA"}'
```

Respuesta esperada: `204 No Content` y una cabecera `Set-Cookie:
migite_session=...`. Comprueba que la sesión protege la API:

```bash
curl -b cookies.txt http://localhost:3000/api/objetos   # 200 con sesión
curl http://localhost:3000/api/objetos                  # 401 sin sesión
curl -b cookies.txt -X DELETE http://localhost:3000/api/sesion  # logout
```

La sesión dura 12 horas y la cookie es `HttpOnly` + `SameSite=Strict`; se marca
`Secure` automáticamente cuando la petición llega por HTTPS o con
`X-Forwarded-Proto: https`.

## 8. Red y seguridad

El compose publica `3000:3000` en todas las interfaces. Para cumplir RNF-021
(no exponer a Internet), limita el acceso al rango de tu VPN/LAN con el firewall
del host:

```bash
sudo ufw default deny incoming
sudo ufw allow from 10.8.0.0/24 to any port 3000 proto tcp   # ajusta tu subred
sudo ufw enable
```

Antes de `ufw enable`, permite el puerto de tu sesión SSH para no quedarte
fuera (por ejemplo `sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp`).

Alternativas:

- Enlazar solo a la interfaz deseada: cambia en `docker-compose.yml`
  `"3000:3000"` por `"10.8.0.1:3000:3000"` (la IP del host en la VPN/LAN).
- HTTPS con un reverse proxy (Caddy, nginx) escuchando en la VPN/LAN y
  reenviando a `127.0.0.1:3000`. Sin HTTPS, la contraseña y la cookie viajan en
  claro: aceptable solo dentro de una VPN.

## 9. Backup y restauración

Los datos viven en los volúmenes Docker `migite_vault` (documentos) y
`migite_indice` (índice SQLite, en modo WAL). El prefijo `migite_` es el nombre
del proyecto Compose; si despliegas desde otra carpeta con otro nombre, usa
`docker volume ls` para ver los reales.

Detén la aplicación antes de copiar para que SQLite cierre el WAL:

```bash
export VERSION=v0.1.0   # la versión que tengas desplegada
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop

mkdir -p backups
docker run --rm \
  -v migite_vault:/vault:ro \
  -v migite_indice:/data:ro \
  -v "$PWD/backups":/backup \
  alpine sh -c 'tar czf /backup/migite-$(date +%F-%H%M).tar.gz -C / vault data'

docker compose -f docker-compose.yml -f docker-compose.prod.yml start
```

Restauración (sobrescribe los datos actuales; para volver atrás en el tiempo):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop
docker run --rm \
  -v migite_vault:/vault \
  -v migite_indice:/data \
  -v "$PWD/backups":/backup \
  alpine sh -c 'rm -rf /vault/* /data/* && tar xzf /backup/migite-FECHA.tar.gz -C /'
docker compose -f docker-compose.yml -f docker-compose.prod.yml start
```

Guarda los backups fuera del servidor y pruébalos de vez en cuando.

## 10. Actualización y rollback

El despliegue es reproducible por tag de imagen. Dos variantes:

**A) Con la imagen publicada en GHCR** (si el release existe):

```bash
export VERSION=v0.2.0
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --remove-orphans
docker image prune -f   # opcional: limpia capas antiguas
```

**B) Construyendo en el servidor desde el tag de código:**

```bash
git fetch --tags
git checkout v0.2.0
export VERSION=v0.2.0
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

En ambos casos los volúmenes se conservan: actualizar no borra datos.

**Rollback:** vuelve a lanzar el mismo comando con la versión anterior
(`export VERSION=v0.1.0`). Con la variante A, `up -d --pull always` (o `pull` +
`up -d`) recupera la imagen antigua; con la B, si la imagen de la versión
anterior sigue en la caché local basta `up -d`, y si no, `git checkout` al tag
anterior + `build` + `up -d`.

## 11. Operación y mantenimiento

```bash
# Logs en vivo
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app

# Reiniciar
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart app

# Parar / borrar el contenedor (los volúmenes se conservan)
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

- `restart: unless-stopped` ya está configurado: el contenedor se levanta solo
  tras un reinicio del servidor.
- No hay límite de memoria configurado. Si quieres acotarlo, añade
  `mem_limit: 2g` al servicio `app` de `docker-compose.prod.yml` (ajusta el
  valor a tu carga real).
- Los ficheros `config/*.yaml` van dentro de la imagen: tras editarlos hay que
  reconstruir y volver a levantar (`build` + `up -d`).

## 12. Problemas comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| El contenedor reinicia en bucle y el log menciona `MIGITE_USER` | `.env` ausente en la raíz o variable mal escrita | Revisa el `.env` (paso 3) y `docker compose logs app` |
| `MIGITE_SESSION_SECRET debe tener al menos 32 caracteres` | Secreto corto | Regénéralo con `openssl rand -hex 32` |
| `MIGITE_PASSWORD_HASH no es un hash argon2 válido` | Se pegó la contraseña en claro o un hash de otro algoritmo | Genera el hash con el paso 3.2 (debe empezar por `$argon2`) |
| Login devuelve `401` | Usuario o contraseña no coinciden | Repite el paso 3.2 y reinicia (`up -d` fuerza recreación) |
| `unhealthy` o `curl` falla | El server no arrancó o el puerto está ocupado | `docker compose exec app curl -fsS http://localhost:3000/api/health` y revisa logs |
| Build falla en un smoke check de nativos | El prebuild musl no cargó (`better-sqlite3`, `@node-rs/argon2`) | No despliegues esa imagen; revisa el error del `require` y reporta |
| `required variable VERSION is missing` | Comando compose sin la versión | `export VERSION=vX.Y.Z` antes de cualquier comando compose |
| Puerto 3000 ocupado en el host | Otro servicio lo usa | Edita `ports` en `docker-compose.yml` o libera el puerto |

## 13. Despliegue con Dockge

[Dockge](https://github.com/louislam/dockge) gestiona stacks de `docker compose`
desde una interfaz web: pegas el compose, editas el `.env` y arrancas el stack
sin usar la terminal del servidor. Dockge usa **un único fichero de compose** por
stack (no overlays), así que este repo incluye `docker-compose.dockge.yml` con la
base y la producción ya fusionadas y **solo imagen** (sin `build:`).

### 13.1 Crear el stack

1. En Dockge, crea un stack nuevo llamado `migite`.
2. Pega como compose el contenido de `docker-compose.dockge.yml` (del repo o de
   GitHub; no hace falta clonarlo en el servidor).
3. Antes de arrancar, la imagen debe ser accesible desde el servidor: si el
   paquete de GHCR es público, listo; si es privado, ejecuta una vez
   `docker login ghcr.io -u TU_USUARIO` en el host (token con permiso
   `read:packages`) o haz público el paquete.

### 13.2 Crear el `.env` del stack

El editor de entorno de Dockge guarda el `.env` junto al compose. Define:

| Variable | Obligatoria | Valor |
| --- | --- | --- |
| `VERSION` | Sí | Tag de la imagen a desplegar, p. ej. `v0.2.0`. Compose falla si falta. |
| `MIGITE_USER` | Sí | Usuario del login. |
| `MIGITE_PASSWORD_HASH` | Sí | Hash argon2id de la contraseña (paso 3.2), **entre comillas simples**. |
| `MIGITE_SESSION_SECRET` | Sí | Secreto de firma de la cookie (paso 3.1). |
| `MIGITE_SECURE_COOKIES` | No | `1` fuerza `Secure` en la cookie. |
| `OPENAI_API_KEY` | No | Clave BYOK (paso 3.3). |

Genera el secreto con `openssl rand -hex 32` (paso 3.1). Para el hash usa el
comando del paso 3.2 (Opción B con Node 22, o la Opción A cambiando los overlays
por `-f docker-compose.dockge.yml` si tienes el repo en el servidor). Ejemplo:

```dotenv
VERSION=v0.2.0
MIGITE_USER=ana
MIGITE_PASSWORD_HASH='$argon2id$v=19$m=19456,t=2,p=1$...$...'
MIGITE_SESSION_SECRET=pega_aqui_la_salida_de_openssl_rand_hex_32
# MIGITE_SECURE_COOKIES=1
```

El hash debe ir **entre comillas simples**: Compose también interpola los valores
del `.env`, y sin comillas `$argon2id$v=19...` se convierte en `=19=...` (el
valor llega corrupto al contenedor y el login falla). Las comillas simples pasan
el valor literal.

### 13.3 Arrancar y verificar

Pulsa **Start** (o **Deploy**) en el stack; equivale a `docker compose up -d`.

```bash
curl -fsS http://IP_DEL_SERVIDOR:3000/api/health   # {"status":"ok"}
```

En la vista del stack el contenedor debe pasar a `healthy` (el healthcheck de la
imagen tarda unos 10 segundos) y los logs no deben mostrar errores de
configuración. Para el primer login y el firewall aplican los pasos 7 y 8.

### 13.4 Actualización y rollback

- **Actualizar:** cambia `VERSION` en el `.env` del stack, guarda y pulsa
  **Update** en Dockge (hace `pull` de la nueva imagen y recrea el contenedor).
- **Rollback:** vuelve a la `VERSION` anterior y pulsa **Update** de nuevo; si
  esa imagen sigue en la caché local no hace falta red.

Los volúmenes se conservan en ambos casos.

### 13.5 Notas

- `config/app.yaml` va **dentro de la imagen**: cambiar zona horaria, rutas o
  proveedores LLM exige reconstruirla (sección 4) y desplegar una imagen nueva;
  Dockge solo despliega imágenes ya construidas.
- El stack de Dockge usa sus propios volúmenes (`migite_vault` y `migite_indice`
  si el stack se llama `migite`); los pasos 9 (backup) y 8 siguen aplicando.
- El `.env` que editas en Dockge es el del stack (p. ej.
  `/opt/stacks/migite/.env`), no el del repo clonado.

## Verificación de esta guía

Se ha comprobado en el repositorio:

- `docker compose config` válido con las combinaciones base, base+dev y
  base+prod (Docker Compose v5.5.1), incluidas las interpolaciones de
  `VERSION`.
- `docker-compose.dockge.yml` validado con `docker compose config` y un `.env`
  de ejemplo (`VERSION` + variables de auth, con el hash entrecomillado).
- El lockfile incluye el binario opcional `@node-rs/argon2-linux-x64-musl` y
  `better-sqlite3` trae `prebuilds/linuxmusl-x64.node`, que son los que usa la
  imagen Alpine.
- El stage `prod` del Dockerfile ejecuta un smoke check de ambos nativos para
  que un build roto falle en la construcción, no en producción.

El `docker build` y el arranque reales deben ejecutarse en el servidor con
daemon Docker y conectividad al registro; este repo no puede sustituir esa
prueba.
