# Self-hosted runner para los jobs live (qa-cycle / explore) — guía de instalación

**Fecha:** 2026-07-14 · **Contexto:** C11 redefinido — el CI vive en GitHub (`jraversbcn21/AIDrivenBSK`, decisión de Jorge). Los runners cloud de GitHub **nunca** alcanzarán DES (`*.inditex.grp` exige la VPN GlobalProtect, que corre en tu máquina con tus credenciales). Los jobs live corren por tanto en un **runner self-hosted instalado en tu propia máquina**: GitHub orquesta, tu equipo ejecuta.

## Estado

- ✅ Workflows listos y pusheados: `ci.yml` (offline, cloud, ya activo en cada push), `qa-cycle.yml` y `explore.yml` (live, esperan el runner).
- ⬜ **Pendiente (manual, tuyo):** instalar el runner + crear los secrets. C11 se cierra el día que el primer `qa-cycle` salga verde en Actions.

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

## Condiciones operativas (honestas)

- Los jobs programados (qa-cycle L-V 07:00/08:00 Madrid; explore lunes) solo corren si **tu máquina está encendida y el runner activo**; si además la VPN está caída, el probe los corta limpio en segundos. Un job programado que dispara con la máquina apagada queda `queued` hasta ~24h y expira — sin efectos secundarios.
- Los reports de cada ciclo quedan como **artifacts** del run (14 días) — la memoria committeada (`coverage/run-history.json`) NO se actualiza desde CI (el runner hace checkout limpio y no pushea; grabar el aprendizaje sigue siendo un acto local/humano — coherente con la doctrina de la plataforma).
- Consideración a tu criterio: el runner ejecuta contra el pre-prod corporativo desde un repo GitHub personal con secrets de una cuenta de test. Es tu setup y tu decisión (ya elegida); solo queda dicho.
