# Manual del Alumno — AIDrivenBsk

> Documentación viva del onboarding. Crece al cierre de cada fase de la formación.
> Mentor: Claude (Senior QA Automation Engineer) · Alumno: QA Tester Junior.
> Regla de oro: aquí solo entra lo que ya se ha explicado, practicado y validado en la formación.

## Estado de la formación

| Fase | Tema | Estado |
|---|---|---|
| 1 | Introducción a AIDrivenBsk (filosofía, arquitectura, ciclo completo) | ✅ Completada |
| 2 | Preparación del entorno | ✅ Completada |
| 3 | Primer contacto: estructura del proyecto | ✅ Completada |
| 4 | Comandos esenciales | ✅ Completada |
| 5 | Automatización | ⏭️ Próxima sesión — empezar aquí |
| 6 | Debugging | Pendiente |
| 7 | Nivel intermedio | Pendiente |
| 8 | Nivel avanzado | Pendiente |
| 9 | Proyecto final | Pendiente |

---

## 🔖 Dónde retomar (para la próxima sesión)

**Siguiente paso: Fase 5 — Automatización.** Aún sin planificar en detalle; retomar decidiendo con el alumno qué cubre exactamente (candidatos: escribir un spec nuevo a mano siguiendo el patrón POM, promover un draft de `tests/generated/` a un directorio permanente, o profundizar en `src/support/retry.ts`'s act→verify→retry).

**Nivel del alumno confirmado hasta ahora:** buena intuición conceptual; pide explícitamente aprender de forma interactiva (ver consola real, no solo teoría) — la Fase 4 se rehizo por completo en ese formato a petición suya. Correcciones importantes ya hechas y que no deben repetirse:
- El **mapa funcional lo genera el Explorer**, no el Planner (el Planner solo lo *anota* con evidencia de cobertura).
- Los **selectores viven en los Page/Component Objects** (`src/pages/`, `src/components/`), nunca en los `.spec.ts` — esa es la esencia del patrón POM que hace que un cambio de UI en DES solo obligue a tocar un archivo.

## Conceptos aprendidos

### Fase 1 — Introducción

- **AIDrivenBsk** es una plataforma de QA *agéntica* (no "solo" un framework Playwright): varios agentes de software colaboran en un ciclo completo de exploración → planificación → generación → ejecución → análisis → aprendizaje → auto-curación.
- **Mapa funcional** (`coverage/functional-map.json`): el corazón del sistema. Es *conocimiento* (qué existe en el sitio: páginas, elementos, flujos), no *verificación*. Todos los agentes lo leen y/o lo enriquecen.
- **Los 9 sub-proyectos** y su analogía con roles humanos de un equipo QA:

  | Sub-proyecto | Directorio | Rol |
  |---|---|---|
  | Foundation | `src/`, `tests/` | Cimientos: Page Objects, fixtures, tests base |
  | Explorer | `explorer/` | Crawlea DES y construye el mapa funcional |
  | Coverage Planner | `planner/` | Analiza qué está cubierto/qué falta, propone prioridades |
  | Builder | `builder/` | Genera specs de test a partir de las propuestas del planner |
  | Risk Analyzer | `analyzer/` | Clasifica fallos de un run (bug real vs. ruido de entorno) |
  | Healer | `healer/` | Propone fixes de selectores rotos — **nunca los aplica solo** |
  | Learning | `learning/` | Memoria histórica entre runs (`coverage/run-history.json`) |
  | Orchestrator | `orchestrator/` | Ejecuta el ciclo completo con un solo comando |
  | Intent | `intent/` | Traduce una intención en lenguaje natural a un test ejecutable |

- **Por qué el Healer solo propone, nunca aplica:** mantiene al humano en el bucle de decisión — evita que un "fix" automático rompa algo silenciosamente; el humano valida antes de tocar el spec real.
- **Estado actual del proyecto:** modo *use-and-maintain* — el roadmap de 10 fases está completo; ya no se construyen fases nuevas, se usa la plataforma como QA real del día a día.

### Fase 2 — Entorno

- Requisitos: **Node.js ≥18**, **pnpm** (el gestor real, confirmado por `pnpm-lock.yaml`), **VPN corporativa** (para todo lo que hable con DES), cuenta de test en `.env`.
- `pnpm install` instala **paquetes npm**; `pnpm exec playwright install --with-deps chromium` instala el **binario del navegador** — son pasos distintos, ambos necesarios.
- **Dos problemas de red distintos, no confundir:**
  - `SELF_SIGNED_CERT_IN_CHAIN` al instalar Chromium → proxy corporativo bloqueando la *descarga* → se arregla con `NODE_TLS_REJECT_UNAUTHORIZED=0` (puntual) o `NODE_EXTRA_CA_CERTS` (persistente).
  - Timeouts/"Cannot navigate" al *ejecutar* tests → VPN desconectada → reconectar VPN.
  - `ignoreHTTPSErrors` NO hace falta para los tests en sí — Chromium ya confía en la CA corporativa del SO.
- `.env`: `ENVIRONMENT` (`prod|des|local`) decide el entorno objetivo; `BASE_URL` sin path extra tras la raíz del locale; `BERSHKA_USER`/`BERSHKA_PASS` la cuenta de test.
- **Salvaguarda de código, no solo convención:** `checkoutAllowed` es `false` automáticamente cuando `ENVIRONMENT=prod` — ningún test puede tocar checkout/pago en producción.
- `ANTHROPIC_API_KEY` solo hace falta si activas `EXPLORER_MODE=llm|auto` (por defecto es `rules`, 100% offline) — no es necesaria para el uso normal del día a día.

### Fase 3 — Estructura del proyecto

- **Page Object** = clase que representa **una página completa** (`src/pages/`: `LoginPage`, `ProductPage`, `HomePage`, `SearchResultsPage`, `BasePage` como base común con el `goto()` que pasa por `consent.ts`).
- **Component Object** = clase que representa **una pieza de UI reutilizable entre páginas** (`src/components/`: `Header`, `SearchBar`, `FiltersPanel`, `ProductCard`, `CartTab`, `BaseComponent`).
- **Regla de oro del POM, confirmada con ejercicio real:** los selectores viven en el Page/Component Object, **nunca** en el `.spec.ts`. El spec solo llama a métodos (`loginPage.login(user, pass)`). Si DES cambia un texto/selector, se toca **un solo archivo** — el Page Object correspondiente — y todos los specs que lo usan siguen funcionando.
- **`src/support/`:** `locators.ts` (resuelve `Strategy` testId/role/label a un locator real), `retry.ts` (helpers act→verify→retry), `consent.ts` (gates de entrada a DES: cookies, gender gate, onboarding tour).
- **`src/fixtures/test.ts`:** el `test`/`expect` que casi todos los specs importan (en vez del `@playwright/test` crudo) — inyecta page objects listos (`homePage`, `loginPage`, `productPage`, `env`, etc.).
- **`tests/generated/` está gitignorado Y excluido de `pnpm test`** (`testIgnore: ['**/tests/generated/**']` en `playwright.config.ts`) — son drafts del Builder que un humano debe revisar antes de "promoverlos" a un directorio permanente (ejemplo real ya en el repo: `tests/mujer/bombacho-barrel.spec.ts` nació generado y fue promovido).
- **`coverage/functional-map.json` es un artefacto generado por el Explorer** (no se edita a mano) — contiene páginas/elementos/flujos descubiertos al crawlear, NO cobertura de tests. `coverage/run-history.json` es la memoria de runs pasados (usada por `analyzer --risk` y `planner`).
- **`playwright.config.ts` usa `workers: 1` y `retries: 1` a propósito** (no por limitación técnica): DES comparte una única cuenta/sesión entre tests y correr en paralelo hizo fallar la suite completa 6/6 veces en pruebas reales (documentado en el propio archivo de config). `retries: 1` absorbe el ruido de entorno de DES (dead loads, shells degradados) con trace-on-first-retry como evidencia.
- Dos proyectos Playwright: `setup` (hace login una vez, `auth.setup.ts`) → `chromium` (reutiliza la sesión vía `storageState: '.auth/state.json'`, depende de `setup`).
- `playwright.generated.config.ts` es un config separado, solo para `tests/generated/`, usado por `pnpm test:generated`.

### Fase 4 — Comandos esenciales

- **El ciclo real de los agentes tiene dependencias en cadena:** `explore` produce el mapa → `plan` lo anota con evidencia de `test` → `build-tests` genera drafts de las propuestas de `plan` → `test:generated` los ejecuta → `analyze` clasifica los fallos de `test` → `heal` propone fixes de los fallos `selector-drift` de `analyze` → `learn` graba el run en el histórico. `qa-cycle` es exactamente esta cadena (`test → analyze → learn → heal → plan`) en un solo comando, con los procesos hijos en `stdio: 'inherit'` (se ve todo en consola igual que a mano) y un reporte consolidado.
- **`pnpm explore` sin `--update` nunca toca el mapa canónico** — solo escribe un reporte con timestamp en `reports/explorer/`. `--update` es el único flag que sobrescribe `coverage/functional-map.json`, y tiene un guard que se niega a escribir un mapa de 0 páginas (protege contra un VPN caído a mitad de crawl).
- **`pnpm plan` sin `--update` es igual de seguro** — calcula cobertura contra la evidencia real (`route-evidence.json`) y escribe solo en `reports/planner/proposals.json`; el mapa canónico solo se anota con `coveredBy` si pasas `--update` explícitamente.
- **Anatomía de una propuesta del planner:** `flowId`, `steps` (cadena de `pageId`s), `priority` (high/med/low), `rationale`, `driftEvents` (cuántas veces ese flujo mostró drift en runs históricos — 0 si nunca se ha registrado).
- **Anatomía de un draft generado por el Builder:** un Page Object (`open()` navega paso a paso replicando la cadena descubierta — no un deep-link directo, porque DES a veces re-dispara el gender gate en deep-links, findings §8) + un `isLoaded()` que usa `locate()` con el `testId {attr, value}` correcto (M7) o un selector role/label si no hay testId de página específica (B14 deprioriza chrome compartido como el header). El spec en sí no tiene selectores — sigue el POM.
- **Existe un tipo de draft distinto, el "interaction spec"** (nace de M9): además de navegar y verificar carga, abre un overlay (`openOverlay()`), verifica que se abrió (`isOverlayOpen()==true`) y lo cierra, verificando que se cerró. Solo se genera cuando el flujo elegido pasa por una interacción capturada durante el crawl (M8/M8b).
- **Anatomía de `failure-report.json` (Risk Analyzer):** clasifica cada fallo en una de 7 categorías (`infrastructure`, `catalog-drift`, `environment-noise`, `selector-drift`, `assertion`, `timeout`, `unknown`), y por cada uno registra `outcome` (`flaky` si pasó en un retry, `failed` si no pasó en ningún intento), `persistence` (`transient` vs. recurrente, esto último requiere cruzar con el histórico) y `flowsAffected`.
- **El Healer hace un early-exit limpio cuando no hay nada que sanar** — no escribe un `healing-report.json` vacío que pisaría el último reporte con contenido real; solo actúa sobre fallos `category: selector-drift`.
- **`pnpm learn` es el único de estos comandos que escribe en un archivo versionado en git** (`coverage/run-history.json`) — el resto escriben en `reports/` (gitignorado) o en `tests/generated/` (gitignorado). El diff es puramente aditivo (una entrada nueva por run), consistente con "idempotente".
- **El exit code de `qa-cycle` mide la salud del pipeline, no de la suite** — una suite con tests flaky/failed no rompe el exit code; lo que sí lo rompe es que un paso falle tan grave que el resto se salten (`status: 'skipped'`).
- **`pnpm ask` agrupa "session-twins"** (v1.1): si el mismo flujo de negocio existe tanto en sesión `anon` como `auth` en el mapa, se muestra como una sola línea con ambos `flowId`s en vez de duplicar la entrada en la lista de ambigüedad.

## Comandos

### Fase 2

| Comando | Qué hace | Cuándo usarlo |
|---|---|---|
| `pnpm install` | Instala dependencias npm desde `pnpm-lock.yaml` | Al clonar el repo o si cambia `package.json` |
| `pnpm exec playwright install --with-deps chromium` | Descarga el binario de Chromium | Tras el primer `pnpm install`, o si Playwright no encuentra el navegador |
| `pnpm typecheck` | `tsc --noEmit` — valida tipos sin generar archivos | Verificación offline rápida, antes de cualquier commit |
| `pnpm test:unit` | `vitest run` — suite de tests unitarios (offline, no toca DES) | Verificación offline del entorno y de cualquier cambio de código |

### Fase 4

| Comando | Qué hace | Flags clave probados en vivo |
|---|---|---|
| `pnpm test` | Corre `tests/` contra DES; escribe `reports/results.json` + `reports/route-evidence.json` | — |
| `pnpm test:generated` | Corre solo los drafts de `tests/generated/` | — |
| `pnpm explore` | Crawlea DES → mapa funcional | `--update` (escribe el mapa canónico), `--session anon\|auth\|both`, `--diff`, `EXPLORER_MAX_PAGES` (env var) |
| `pnpm plan` | Anota el mapa con cobertura real | `--update`, `--top <n>` |
| `pnpm build-tests` | Genera drafts desde las propuestas del planner | `--top <n>`, `--no-prune` |
| `pnpm analyze` | Clasifica fallos de `reports/results.json` | `--top <n>`, `--risk <baseline-map>` |
| `pnpm heal` | Propone fixes de `selector-drift` (nunca los aplica) | `--top <n>`, `--no-probe` |
| `pnpm learn` | Graba el run en `coverage/run-history.json` (committed) | — |
| `pnpm qa-cycle` | Orquesta test→analyze→learn→heal→plan en un comando | `--risk`, `--update-map`, `--top <n>` |
| `pnpm ask "<intención>"` | Resuelve lenguaje natural → genera el draft de ese flujo | `--flow <id>` (desambiguar) |

## Buenas prácticas

### Fase 3

- Nunca poner selectores sueltos dentro de un `.spec.ts` — siempre en el Page/Component Object correspondiente.
- Nunca editar `coverage/functional-map.json` a mano — es un artefacto generado, se regenera con `pnpm explore --update`.
- Tratar `tests/generated/` como material de revisión, no como suite ejecutable por defecto — promoverlo a un directorio permanente solo tras revisión humana.

### Fase 4

- Para explorar/probar el Explorer sin riesgo, correr `pnpm explore` **sin `--update`** (nunca toca el mapa canónico) y acotar con `EXPLORER_MAX_PAGES=8 --session anon` para que tarde segundos, no los ~35-40 min de un crawl completo.
- El orden real del ciclo importa: `test → analyze → learn → heal → plan`, sin nada en medio que reescriba `reports/results.json` (ver el error frecuente de abajo).
- `pnpm learn` sí escribe en un archivo versionado en git (`coverage/run-history.json`) — en modo *use-and-maintain* esto es uso normal y esperado (cada run real alimenta el histórico), no hace falta revertirlo.
- Antes de correr `pnpm build-tests`, recordar que por defecto **prunea** `tests/generated/` (borra drafts previos) — es intencional (evita que specs obsoletos se acumulen), usar `--no-prune` solo si se quiere conservar una generación anterior a propósito.

## Errores frecuentes y soluciones

### Fase 2

| Síntoma | Causa | Solución |
|---|---|---|
| `SELF_SIGNED_CERT_IN_CHAIN` al instalar Chromium | Proxy corporativo intercepta el download HTTPS | `NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm exec playwright install chromium` (puntual) o `NODE_EXTRA_CA_CERTS` (persistente) |
| Tests fallan con "Cannot navigate", timeouts raros al ejecutar | VPN desconectada | Reconectar VPN, verificar que DES responde |
| Conflictos raros de versiones / lockfile no cuadra | Usar npm/yarn en vez de pnpm | Usar siempre `pnpm` |
| Login falla / credenciales inválidas | `.env` sin `BERSHKA_USER`/`BERSHKA_PASS` | Rellenar `.env` con la cuenta de test real |
| `stderr` con mensajes de error en `pnpm test:unit` | Tests que prueban intencionadamente un camino de error (y comprueban la recuperación) | No es un fallo si el bloque termina en `✓` — mirar el resumen final, no el stderr aislado |

### Fase 4

| Síntoma | Causa | Solución |
|---|---|---|
| `pnpm analyze` reporta "0 failed, 0 flaky" justo después de que `pnpm test` mostró fallos reales | `pnpm test` y `pnpm test:generated` escriben al **mismo archivo** `reports/results.json` (mismo reporter JSON, `playwright.generated.config.ts` hereda la config base) — si corres `test:generated` entre medias, pisa la evidencia del `test` original | Re-correr `pnpm test` justo antes de `pnpm analyze`, sin nada en medio que también use el reporter JSON |
| Dos tests con el mismo error exacto ("the size dialog did not close after selecting a size") en runs distintos | Ruido de entorno ya documentado (findings §14/§16/§18), no un bug nuevo — `pnpm analyze` lo confirma clasificándolo `category: timeout`, no `selector-drift` | No hace falta investigar cada vez — si el analyzer lo clasifica `timeout`/`environment-noise`, confiar en esa clasificación; solo escalar si empieza a aparecer como `selector-drift` o si `--risk`/el histórico muestra que deja de ser transitorio |
| `pnpm ask "<frase corta>"` devuelve varias opciones en vez de una sola | Ambigüedad real: varias frases matchean por tokens/tipo con score distinto (ver el campo `why` de cada candidato) | No es un fallo — usar `--flow <id>` con el `flowId` del candidato deseado (mostrado en la lista) para generar ese draft en concreto |

## Trucos

*(se rellena por fase)*

---

## Resúmenes por fase

### Fase 1 — Introducción a AIDrivenBsk

AIDrivenBsk es una plataforma de QA agéntica para el sitio DES de Bershka: 9 sub-proyectos que colaboran en un ciclo test→analyze→learn→heal→plan, todo orquestable con `pnpm qa-cycle`. El mapa funcional (`coverage/functional-map.json`) es la base de conocimiento compartida — el Explorer lo construye, todos los demás lo consumen. El proyecto está completo (roadmap cerrado) y en modo de uso diario.

### Fase 2 — Preparación del entorno

Requisitos: Node ≥18, pnpm, VPN corporativa, `.env` con credenciales de test. `pnpm install` trae paquetes; `pnpm exec playwright install` trae el navegador — son pasos separados. El error de certificado al instalar Chromium (proxy) y el error de VPN al ejecutar tests son problemas distintos, no confundir. `checkoutAllowed=false` en prod es una salvaguarda real de código. Entorno validado con `pnpm typecheck` + `pnpm test:unit` (405/405 tests, 50/50 archivos).

### Fase 3 — Primer contacto: estructura del proyecto

`src/` es la Foundation (Page Objects en `pages/`, Component Objects en `components/`, soporte en `support/`, fixture inyectado en `fixtures/test.ts`). `tests/` organiza specs por dominio (`auth/`, `cart/`, `checkout/`, `mujer/` como ejemplo de spec promovido) más `generated/` (gitignorado y excluido de `pnpm test`, drafts del Builder pendientes de revisión humana). `coverage/functional-map.json` (generado por el Explorer, nunca a mano) y `run-history.json` son el conocimiento acumulado versionado en git. `playwright.config.ts` corre en serie (`workers: 1`, `retries: 1`) a propósito por las limitaciones de cuenta compartida de DES. La esencia del POM quedó confirmada con un ejercicio real: los selectores viven en el Page Object, nunca en el spec.

### Fase 4 — Comandos esenciales

Fase completamente hands-on: cada comando del ciclo se ejecutó en vivo contra DES, en el orden real de dependencia (`explore` acotado sin `--update` → `plan` → `build-tests --top 2` → `test:generated` 4/4 pasado → `analyze` → `heal` → `learn` → `ask` con desambiguación real). Se confirmó en código y en consola: el mapa funcional tiene 3 capas (pages/components/elements) con `selectorHints` que preservan qué atributo real produjo cada testId (M7); los drafts del Builder respetan el POM (cero selectores en el spec); el Healer hace early-exit limpio sin selector-drift que sanar; `pnpm learn` es el único comando de esta fase que escribe en un archivo versionado en git, de forma puramente aditiva. Se encontró y documentó un gotcha real (no de la formación, del propio proyecto): `pnpm test` y `pnpm test:generated` comparten el mismo `reports/results.json`, así que `pnpm analyze` debe correr inmediatamente después de `pnpm test`, sin nada en medio. `pnpm qa-cycle` se explicó a partir de su código real (`orchestrator/cli.ts`) sin re-ejecutarlo, por ser exactamente la misma cadena ya validada paso a paso.
