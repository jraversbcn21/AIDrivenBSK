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
| 4 | Comandos esenciales | ⏭️ Próxima sesión — empezar aquí |
| 5 | Automatización | Pendiente |
| 6 | Debugging | Pendiente |
| 7 | Nivel intermedio | Pendiente |
| 8 | Nivel avanzado | Pendiente |
| 9 | Proyecto final | Pendiente |

---

## 🔖 Dónde retomar (para la próxima sesión)

**Siguiente paso: Fase 4 — Comandos esenciales.** Es la fase más larga: se explican TODOS los scripts de `package.json` (`test`, `test:unit`, `typecheck`, `lint`, `explore`, `plan`, `build-tests`, `analyze`, `heal`, `learn`, `qa-cycle`, `ask`, `test:generated`) con sintaxis, flags, cuándo usarlos y resultado esperado. El ejercicio ancla es el primer run **live** contra DES: `pnpm test` (suite esperada 7/7) + leer `reports/route-evidence.json`. Requiere VPN activa.

**Nivel del alumno confirmado hasta ahora:** buena intuición conceptual; dos correcciones importantes ya hechas y que no deben repetirse:
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

## Comandos

### Fase 2

| Comando | Qué hace | Cuándo usarlo |
|---|---|---|
| `pnpm install` | Instala dependencias npm desde `pnpm-lock.yaml` | Al clonar el repo o si cambia `package.json` |
| `pnpm exec playwright install --with-deps chromium` | Descarga el binario de Chromium | Tras el primer `pnpm install`, o si Playwright no encuentra el navegador |
| `pnpm typecheck` | `tsc --noEmit` — valida tipos sin generar archivos | Verificación offline rápida, antes de cualquier commit |
| `pnpm test:unit` | `vitest run` — suite de tests unitarios (offline, no toca DES) | Verificación offline del entorno y de cualquier cambio de código |

## Buenas prácticas

### Fase 3

- Nunca poner selectores sueltos dentro de un `.spec.ts` — siempre en el Page/Component Object correspondiente.
- Nunca editar `coverage/functional-map.json` a mano — es un artefacto generado, se regenera con `pnpm explore --update`.
- Tratar `tests/generated/` como material de revisión, no como suite ejecutable por defecto — promoverlo a un directorio permanente solo tras revisión humana.

## Errores frecuentes y soluciones

### Fase 2

| Síntoma | Causa | Solución |
|---|---|---|
| `SELF_SIGNED_CERT_IN_CHAIN` al instalar Chromium | Proxy corporativo intercepta el download HTTPS | `NODE_TLS_REJECT_UNAUTHORIZED=0 pnpm exec playwright install chromium` (puntual) o `NODE_EXTRA_CA_CERTS` (persistente) |
| Tests fallan con "Cannot navigate", timeouts raros al ejecutar | VPN desconectada | Reconectar VPN, verificar que DES responde |
| Conflictos raros de versiones / lockfile no cuadra | Usar npm/yarn en vez de pnpm | Usar siempre `pnpm` |
| Login falla / credenciales inválidas | `.env` sin `BERSHKA_USER`/`BERSHKA_PASS` | Rellenar `.env` con la cuenta de test real |
| `stderr` con mensajes de error en `pnpm test:unit` | Tests que prueban intencionadamente un camino de error (y comprueban la recuperación) | No es un fallo si el bloque termina en `✓` — mirar el resumen final, no el stderr aislado |

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
