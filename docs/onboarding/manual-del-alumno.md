# Manual del Alumno — AIDrivenBsk

> Documentación viva del onboarding. Crece al cierre de cada fase de la formación.
> Mentor: Claude (Senior QA Automation Engineer) · Alumno: QA Tester Junior.
> Regla de oro: aquí solo entra lo que ya se ha explicado, practicado y validado en la formación.

## Estado de la formación

| Fase | Tema | Estado |
|---|---|---|
| 1 | Introducción a AIDrivenBsk (filosofía, arquitectura, ciclo completo) | ✅ Completada |
| 2 | Preparación del entorno | ✅ Completada |
| 3 | Primer contacto: estructura del proyecto | Pendiente |
| 4 | Comandos esenciales | Pendiente |
| 5 | Automatización | Pendiente |
| 6 | Debugging | Pendiente |
| 7 | Nivel intermedio | Pendiente |
| 8 | Nivel avanzado | Pendiente |
| 9 | Proyecto final | Pendiente |

---

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

## Comandos

### Fase 2

| Comando | Qué hace | Cuándo usarlo |
|---|---|---|
| `pnpm install` | Instala dependencias npm desde `pnpm-lock.yaml` | Al clonar el repo o si cambia `package.json` |
| `pnpm exec playwright install --with-deps chromium` | Descarga el binario de Chromium | Tras el primer `pnpm install`, o si Playwright no encuentra el navegador |
| `pnpm typecheck` | `tsc --noEmit` — valida tipos sin generar archivos | Verificación offline rápida, antes de cualquier commit |
| `pnpm test:unit` | `vitest run` — suite de tests unitarios (offline, no toca DES) | Verificación offline del entorno y de cualquier cambio de código |

## Buenas prácticas

*(se rellena por fase)*

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
