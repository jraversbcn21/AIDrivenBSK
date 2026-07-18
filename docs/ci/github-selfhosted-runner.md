# Self-hosted runner para los jobs live (qa-cycle / explore) — guía de instalación

**Fecha:** 2026-07-14 · **Contexto:** C11 redefinido — el CI vive en GitHub (`jraversbcn21/AIDrivenBSK`, decisión de Jorge). Los runners cloud de GitHub **nunca** alcanzarán DES (`*.inditex.grp` exige la VPN GlobalProtect, que corre en tu máquina con tus credenciales). Los jobs live corren por tanto en un **runner self-hosted instalado en tu propia máquina**: GitHub orquesta, tu equipo ejecuta.

## Estado

- ✅ Workflows listos y pusheados: `ci.yml` (offline, cloud, ya activo en cada push), `qa-cycle.yml` y `explore.yml` (live, en el runner self-hosted).
- ✅ **C11 cerrado (2026-07-17):** runner instalado + secrets creados + primer `qa-cycle` verde en Actions.
- ✅ **Modo servicio (2026-07-18):** el runner corre como **servicio de Windows** (`actions.runner.jraversbcn21-AIDrivenBSK.jorge-laptop`, cuenta `NETWORK SERVICE`, arranque automático retardado) — sobrevive reinicios sin consola abierta. Verificado con un `qa-cycle` verde end-to-end ([run 29638531264](https://github.com/jraversbcn21/AIDrivenBSK/actions/runs/29638531264)). Ver "Gotchas de la cuenta de servicio" abajo — dos pasos de los workflows necesitaron arreglo al cambiar de cuenta.

## Paso 1 — Secrets del repo (una vez)

GitHub → `jraversbcn21/AIDrivenBSK` → **Settings → Secrets and variables → Actions → New repository secret**, tres secrets (los mismos valores de tu `.env` local):

| Secret | Valor |
|---|---|
| `BASE_URL` | la URL de DES hasta `/es/` |
| `BERSHKA_USER` | `jorge@esqa.com` |
| `BERSHKA_PASS` | (tu password de test) |

## Paso 2 — Instalar el runner (una vez, ~5 min)

1. GitHub → repo → **Settings → Actions → Runners → New self-hosted runner** → **Windows x64**.
2. GitHub te muestra 4-5 comandos con un token temporal — cópialos tal cual en una PowerShell **en una carpeta dedicada** (p.ej. `C:\actions-runner`, NUNCA dentro del repo). Son: descargar el zip, extraer, `./config.cmd --url ... --token ...`.
3. Durante `config.cmd` te pregunta:
   - *runner group*: Enter (default).
   - *name*: Enter (default) o `jorge-laptop`.
   - **labels: escribe `des-vpn`** ← imprescindible — los workflows seleccionan el runner por `runs-on: [self-hosted, des-vpn]`.
   - *work folder*: Enter (default).
   - *run as service*: si quieres el modo servicio (ver abajo), responde `Y` aquí — **pero solo funciona si la PowerShell está elevada** (abierta como Administrador); en una consola normal falla con `Needs Administrator privileges for configuring runner as windows service` y deja el runner configurado pero sin servicio.
4. Arrancarlo. Dos opciones:
   - **Manual (más simple, sin admin):** `./run.cmd` en una consola que dejes abierta. Se conecta al instante (aparece **Idle** en GitHub → Settings → Actions → Runners). Se para al cerrar la consola y no sobrevive reinicios — hay que relanzarlo a mano.
   - **Como servicio de Windows (sobrevive reinicios):** en Windows el servicio lo instala el **propio `config.cmd` desde una PowerShell elevada** respondiendo `Y` a "run as service" — **NO existe `svc.cmd` en Windows** (eso es de Linux/macOS, `svc.sh`; el paquete Windows solo trae `config.cmd` y `run.cmd`). Si el runner ya está configurado sin servicio, para pasar a servicio: (a) GitHub → Settings → Actions → Runners → tu runner → **Remove** (copia el token de removal); (b) PowerShell **como Administrador**: `cd C:\actions-runner ; ./config.cmd remove --token <TOKEN_REMOVAL>`; (c) obtén un token de registro nuevo en **New self-hosted runner** y re-ejecuta `./config.cmd --url ... --token ...` (misma label `des-vpn`), respondiendo `Y` a "run as service".

**Prerequisitos en la máquina** (ya los tienes todos): Node 18+, pnpm, Chromium de Playwright (el workflow lo instala/cachea solo), y GlobalProtect.

## Paso 3 — Verificación (esto ES el cierre de C11)

1. VPN GlobalProtect **conectada**.
2. GitHub → repo → **Actions → qa-cycle → Run workflow** (botón manual).
3. Mira el job: el primer paso real es el **probe de alcanzabilidad** — si la VPN está caída, falla ahí con el mensaje claro `DES unreachable — is GlobalProtect connected...` (nunca una pared de rojo confusa). Con VPN, sigue el ciclo entero (~10-15 min la primera vez por la descarga de Chromium; ~6-8 min después).
4. **Primer run verde = C11 cerrado.** Anótalo en el backlog (o pídemelo y lo cierro yo).

## Gotchas de la cuenta de servicio (2026-07-18, ambos encontrados y arreglados en vivo)

Al pasar de `run.cmd` (tu usuario) a servicio (`NETWORK SERVICE`), dos pasos de los workflows fallaron porque el entorno de la cuenta de servicio no es el tuyo:

1. **`shell: bash` no existe para el servicio** — Git Bash resuelve por el PATH *de usuario*; el primer run en modo servicio murió con `bash: command not found` en el probe. Fix (`366175a`): los probes de `qa-cycle.yml`/`explore.yml` van en Windows PowerShell llamando explícitamente a `curl.exe` de System32 (el nombre pelado `curl` es el alias de `Invoke-WebRequest` en PS 5.1). Regla general: **ningún paso de estos workflows debe asumir bash ni el PATH de tu usuario.**
2. **La caché de Playwright del servicio empieza vacía** — bajo tu usuario `playwright install chromium` era un no-op (navegador pre-instalado a mano en su día); bajo `NETWORK SERVICE` descargó de verdad por primera vez en CI y chocó con el cert del proxy corporativo (`SELF_SIGNED_CERT_IN_CHAIN`, el gotcha documentado en CLAUDE.md). Fix (`a9bd57d`): `NODE_TLS_REJECT_UNAUTHORIZED=0` **solo en el paso de descarga**. La caché del servicio vive en `C:\Windows\ServiceProfiles\NetworkService\AppData\Local\ms-playwright`.
- **Verruga cosmética conocida:** el post-step de caché de pnpm (`setup-node`) avisa `Failed to save` (usa `tar.exe` de Git, misma familia de PATH) — el job queda verde; solo se pierde el ahorro de caché entre runs.

## Condiciones operativas (honestas)

- Los jobs programados (qa-cycle L-V 07:00/08:00 Madrid; explore lunes) corren desatendidos: el runner es un servicio con arranque automático — solo hace falta que **la máquina esté encendida y la VPN GlobalProtect conectada** (la VPN sigue siendo por-sesión tuya: sin tu login + GlobalProtect, el probe corta limpio en segundos). Un job programado que dispara con la máquina apagada queda `queued` hasta ~24h y expira — sin efectos secundarios.
- Los reports de cada ciclo quedan como **artifacts** del run (14 días) — la memoria committeada (`coverage/run-history.json`) NO se actualiza desde CI (el runner hace checkout limpio y no pushea; grabar el aprendizaje sigue siendo un acto local/humano — coherente con la doctrina de la plataforma).
- Consideración a tu criterio: el runner ejecuta contra el pre-prod corporativo desde un repo GitHub personal con secrets de una cuenta de test. Es tu setup y tu decisión (ya elegida); solo queda dicho.
