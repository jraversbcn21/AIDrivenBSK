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
| 5 | Automatización | ✅ Completada (2026-08-04) |
| 6 | Debugging | ✅ Completada (2026-08-06) |
| 7 | Nivel intermedio (anclaje de locators) | ✅ Completada (2026-08-10) |
| 8 | Nivel avanzado | Pendiente |
| 9 | Proyecto final | Pendiente |

---

## 🔖 Dónde retomar (para la próxima sesión)

**Siguiente paso: empezar la Fase 8 — Nivel avanzado.** La Fase 7 (Nivel intermedio: anclaje de locators) se completó el 2026-08-10 a la primera, 100% interactiva, y cerró un pendiente real del proyecto: el lead 2 de findings §29 (el `.first()` de wishlist sin anclar) pasó de sospecha a **defecto confirmado en vivo y arreglado** — detalle completo en findings §31. El contenido de la Fase 8 no está predefinido; decidirlo con Jorge al empezar (candidatos naturales que dejó esta fase: el click sin bound de la plantilla de interacción del Builder — findings §26, defecto confirmado sin arreglar —, o añadir el patrón del drawer §28 al vocabulario del analyzer, si sigue recurriendo).

**Nivel del alumno confirmado hasta ahora:** buena intuición conceptual; pide explícitamente aprender de forma interactiva (ver consola real, no solo teoría). Conceptos que ya se le pueden dar por sabidos sin re-explicar: el patrón acción/consulta e idempotencia (Fase 5), strict mode + `.catch` que disfraza errores (Fases 5-6), estado vs. transición y el falso verde (Fase 6), y ahora el anclaje de locators y el diseño de experimentos discriminantes (Fase 7).

**Nuevo, Fase 7:** identificó a la primera la precondición no escrita del `.first()` ("que el producto principal esté en la wishlist"), predijo correctamente la casilla ❓ de la fila D con el mecanismo correcto ("`.first()` cogería la tarjeta del carrusel"), y eligió sin ayuda quitar el `.first()` del arreglo con la razón correcta ("así si hay dos salta el error"). Pre-registró sus predicciones antes de cada corrida y acertó ambas. **Dos puntos a reforzar:** (1) al preguntarle en qué fila de la tabla estaba la página, no supo leerlo de la salida — hubo que explicarle que el estado se lee de las DOS variables a la vez, y que el nombre que NO buscas es el que te dice en qué fila estás; (2) no retenía las 7 categorías del analyzer de la Fase 4 (pidió que se las refrescara) — normal por poco uso, pero conviene que las repase antes de una fase que trabaje sobre el analyzer. El punto de refuerzo que traía la Fase 6 (stack trace antes que screenshot) **se aplicó bien**: el triage del fallo de search de la corrida final se hizo leyendo el stack trace primero.

Correcciones importantes ya hechas y que no deben repetirse:
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

### Fase 5 — Automatización

- **`actUntil` (`src/support/retry.ts`) es el primitivo centralizado del patrón act→verify→retry** — le pasas un `act` (el intento) y un `verify` (la condición de estado real), y reintenta hasta que `verify` sea `true` o expire `deadlineMs`. Ya lo usan `selectFirstSize()`/`addToCart()`; escribir un método nuevo que cambia estado en DES significa reutilizar esto, no reinventar un bucle a mano.
- **Patrón de método en un Page/Component Object para una interacción con estado:** una **consulta** async que nunca lanza (`isXxx(): Promise<boolean>`, con `.catch(() => false)`) + una **acción** que primero comprueba con la consulta (idempotencia — no repetir la acción si el estado ya es el deseado) y usa esa misma consulta como `verify` de `actUntil`.
- **El "modo estricto" (strict mode) de Playwright:** un locator basado en rol/nombre asume que identifica un único elemento. Si se resuelve a más de uno, métodos como `.isVisible()` o `.click()` **lanzan un error** en vez de elegir uno al azar. Un `.catch(() => false)` pensado para "el elemento no existe todavía" **también atrapa ese error real de ambigüedad** y lo disfraza del mismo `false` — un bug real puede parecer indistinguible de "aún no está listo".
- **Un elemento repetido en la misma página puede aparecer más tarde de lo esperado.** Un carrusel de recomendaciones ("También te puede gustar") puede reutilizar el mismo texto/rol que el botón principal de la página, y si carga con retraso (lazy), el locator puede pasar de único a ambiguo *a mitad de un `actUntil`* — el mismo patrón de bug ya visto en el proyecto con testIds repetidos en grids de producto (findings B16/M8b). `.first()` (scoped al orden real del DOM, cuando el elemento de interés siempre precede al contenido repetido) es la solución ya usada en el propio framework para esta clase de problema.
- **Nunca concluir "es ruido de entorno" sin mirar la evidencia real primero** (`error-context.md`/screenshot que genera Playwright al fallar) — un test que falla por timeout puede estar fallando por una razón completamente distinta a la que parece a simple vista (aquí: la acción SÍ había funcionado, el problema era cómo lo comprobábamos).

### Fase 6 — Debugging

- **Los cuatro artefactos que Playwright genera al fallar**, y cuándo (según `playwright.config.ts` real): `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, `trace: 'on-first-retry'` y un `error-context.md` con el snapshot de accesibilidad. El trace solo se graba en el **primer reintento** — para forzarlo siempre en una investigación se usa `--trace on`.
- **El trace viewer es la herramienta central de debugging:** muestra la línea de tiempo de *todas* las acciones Playwright, y por cada una un snapshot del DOM en tres momentos (`Before` / `Action` / `After`), más las pestañas `Log`, `Errors`, `Console`, `Network` y `Source`.
- **Cómo se lee un click en el Log:** un click que funcionó deja rastro de haber resuelto el elemento y ejecutado la acción; uno que solo dice `waiting for <locator>` y consume exactamente su `timeout` **nunca encontró nada** — el click no ocurrió.
- **Un test verde no demuestra nada por sí solo.** Un test que *no puede fallar* es peor que uno rojo: reporta una seguridad que no da, y nadie relee un test en verde.
- **La causa estructural del falso verde: afirmar un ESTADO en vez de una TRANSICIÓN.** Si el test no garantiza su estado de partida, el `expect` final puede estar comprobando algo que ya era cierto antes de empezar. En DES esto es especialmente fácil porque la cuenta es compartida y **arrastra estado entre corridas** (carrito, wishlist — findings §7).
- **`actUntil` se traga el error del `act` por diseño** (`"the verify is the truth"`, `src/support/retry.ts`) — porque en DES un click se pierde constantemente por hidratación. La consecuencia: **toda la corrección recae en el `verify`**. Si el `verify` no sabe distinguir "mi acción funcionó" de "ya era verdad", bendecirá un no-op.
- **Una consulta booleana con dos significados es una trampa:** `isInWishlist()` devolvía `false` tanto para "no está en la wishlist" como para "la página aún no ha pintado el botón". La solución es una señal de *readiness* previa que espere a que aparezca **cualquiera** de los estados posibles (patrón ya existente en el proyecto: `ProductPage.detectAddFlow()`).
- **Un falso verde es invisible para toda la plataforma agéntica:** `pnpm analyze` clasifica fallos de `reports/results.json` y `pnpm heal` solo actúa sobre los `selector-drift`. Sin fallo no hay clasificación ni propuesta de curación — el selector roto no lo habría visto nadie.
- **Validar un arreglo = experimento controlado, no "pasó".** Ver el test **rojo** con el bug puesto y **verde** al quitarlo, cambiando **una sola variable**, es lo que convierte "pasó" en "sé por qué pasó".
- **Cuando hay dos fallos en una corrida, el stack trace desambigua:** dice qué archivo y qué línea del spec falló. Un screenshot llamativo (`SIN RESULTADOS`) puede pertenecer a un fallo distinto del que estás investigando.
- **`.first()` arregla la ambigüedad, no el anclaje.** Silencia una *strict mode violation*, pero el locator sigue sin estar atado al elemento que te interesa: si ese elemento deja de coincidir con el nombre buscado, `.first()` se desliza en silencio al siguiente que sí coincida (p. ej. una tarjeta del carrusel de recomendaciones).

### Fase 7 — Nivel intermedio: anclaje de locators

- **Un locator tiene dos partes, y la segunda casi nunca se piensa:** *qué* coincide (rol + nombre accesible) y *cuál* de las coincidencias tomas (`.first()`, scope). El conjunto de coincidencias **no es fijo**: es función del ESTADO (un botón que se renombra según estado entra y sale del conjunto) y del TIEMPO (contenido lazy que hidrata a mitad de poll lo agranda). Selección posicional sobre un conjunto así está sin anclar por construcción.
- **`.first()` arregla la ambigüedad, nunca el anclaje** — confirmado en vivo esta fase (la Fase 6 lo enunció como lección; la 7 lo demostró): el `.first()` de wishlist respondía por *cualquier* producto de la página, no por el principal. Es legítimo cuando "cualquier ejemplar sirve" es lo que de verdad quieres (política M9/§17 para triggers repetidos); nunca como respuesta a una strict mode violation inesperada — ahí **el error era la información**, y `.first()` apaga el detector.
- **El strict mode es un detector de ambigüedad gratis, con dos interruptores que lo apagan:** `.first()` (elige uno y calla) y `.catch(() => false)` (traga el error y lo disfraza de "no está"). Verificado offline con `setContent`: `isVisible()` sobre **0** coincidencias devuelve `false` SIN lanzar — o sea, un `.catch` ahí no protege del "aún no existe" (ese caso se protege solo); su único efecto posible es esconder ambigüedad.
- **Hay un tercer catch, y es doctrina:** `actUntil` traga los throws del `verify` (`retry.ts:41`, deliberado — un re-render puede desprender un nodo a mitad de poll). Consecuencia: una ambigüedad dentro de `actUntil` se manifiesta como timeout lento con mensaje genérico; en una llamada directa (`expect.poll`), como error inmediato y preciso. Y la regla que acompaña: **cuando un primitivo compartido te estorba, la sospecha por defecto es que tu caso de uso está mal planteado, no el primitivo.**
- **Solo un estado donde las hipótesis predicen resultados DISTINTOS es evidencia.** Método de la tabla: enumera las combinaciones de las variables relevantes (aquí 2 binarias → 4 filas), anota qué predice cada hipótesis en cada fila, y construye la fila discriminante. El estado por defecto de la página casi nunca discrimina — por eso "abrir y mirar" confirma cualquier cosa que ya creyeras.
- **En qué fila estás se lee de TODAS las variables a la vez** — y el nombre que NO buscas es el que te dice el estado (0 × "Eliminar" en toda la página = nada está en la wishlist, ni el principal ni el carrusel).
- **Nunca montes el experimento con el instrumento que estás midiendo:** el setup usa locators explícitos y sin ambigüedad escritos en el probe; el locator sospechoso aparece solo en la medición. Y verifica el setup antes de interpretar la medición (`ROW D BUILT? true`).
- **Pre-registrar la predicción antes de correr** — dicha en voz alta antes de ver el resultado, no puedes racionalizarla después. Incluye qué significaría el resultado contrario (refutar con evidencia también es un resultado válido: §24 y §28 son refutaciones).
- **Probes temporales en `tests/_probe/`**, ciclo de vida §18/§22/§23: se borran en cuanto el conocimiento aterriza en findings. Están dentro de `tests/`, así que `pnpm test` los recogería — no dejarlos ahí.
- **Escala real medida:** un PDP desktop renderiza **43** botones de wishlist (1 principal + 42 del grid de cross-selling, en filas de ~5, que solo hidratan al hacer scroll). El del principal NO tiene test-id; los 42 del cross-selling sí (`data-qa-anchor="productItemWishlist"`). El ancla del principal es su contenedor BEM `div.product-detail-info__labels-wishlist` — desviación documentada de la prioridad de selectores (clase semántica de componente, no selector posicional).

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

### Fase 5

| Comando | Qué hace | Cuándo usarlo |
|---|---|---|
| `pnpm exec playwright codegen "<url>?device=desktop"` | Abre un navegador controlado + graba código Playwright mientras interactúas a mano | Para probar en vivo un selector nuevo antes de escribirlo en un Page/Component Object — nunca adivinar |
| `pnpm exec playwright test <archivo> --project=chromium` | Corre un solo spec (dispara `setup` como dependencia si no hay sesión válida) | Validar un spec nuevo o recién arreglado sin esperar a la suite completa |

### Fase 6

| Comando | Qué hace | Cuándo usarlo |
|---|---|---|
| `pnpm exec playwright test <spec> --project=chromium --trace on` | Fuerza la grabación del trace en **todas** las corridas, no solo en el primer reintento | Cuando estás investigando algo — incluido un test que pasa y no te fías de él |
| `pnpm exec playwright show-trace test-results/<carpeta>/trace.zip` | Abre el trace viewer | Para ver qué acciones ocurrieron de verdad, con snapshot del DOM antes/después de cada una |

### Fase 7

| Comando | Qué hace | Cuándo usarlo |
|---|---|---|
| `pnpm exec playwright test <spec> --project=chromium --no-deps` | Corre el spec SIN disparar el proyecto `setup` (se salta el minuto de login) | Probes offline que no necesitan sesión ni DES (p. ej. semántica de locators con `setContent`) |
| `locator.evaluateAll(els => ...)` (en código de probe) | Ejecuta una función sobre TODOS los elementos que coinciden, en el navegador | Reconocimiento: contar coincidencias y extraer posición/cadena de ancestros de cada una — atravesando shadow DOM con `getRootNode().host` |
| `pnpm analyze` justo tras `pnpm test` | Clasifica los fallos del run recién escrito | El triage automático de la plataforma: corrobora (o refuta) tu lectura manual del fallo — `timeout` ≠ `selector-drift` es información |

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

### Fase 5

- Antes de escribir un método nuevo de acción/consulta, mirar si ya existe un método parecido en el mismo Page Object (aquí, `addToCart()` ya mostraba el patrón exacto a seguir para `addToWishlist()`) — copiar el patrón validado en vez de inventar uno nuevo.
- Tras arreglar un test intermitente, no fiarse de una sola corrida verde — repetirlo 2-3 veces para distinguir "arreglado de verdad" de "esta vez tuvimos suerte".
- Tras tocar un archivo compartido (un Page/Component Object que usan varios specs), correr la suite completa (`pnpm test`) antes de dar el cambio por bueno — no solo el spec nuevo.

### Fase 6

- **Un test que nunca has visto fallar no es un test.** Antes de dar por bueno un spec nuevo o recién arreglado, rómpelo a propósito (un selector, una aserción) y comprueba que se pone rojo. Si sigue verde con el bug dentro, el test no protege nada.
- **Todo test que afirme el resultado de una acción debe garantizar primero el estado contrario** — sobre todo en DES, donde la cuenta compartida arrastra estado entre corridas. Afirmar la transición (`false` → acción → `true`), no el estado final.
- **Lee `test-results/` ANTES de relanzar.** La siguiente corrida lo sobrescribe: screenshot, video, trace y `error-context.md` de la anterior se pierden. Si una corrida te sorprende, captura la evidencia antes de volver a lanzar nada (esta fase lo aprendió por las malas: se perdió el trace del único caso que quedó sin explicar).
- **Cuando escribas un `verify` para `actUntil`, pregúntate si sabría distinguir "mi acción funcionó" de "ya era verdad".** Si no, el `verify` bendecirá un no-op y el error del `act` ya viene tragado por diseño.
- **Al tocar un Page/Component Object compartido, correr `pnpm test` completo** — regla heredada de la Fase 5 y aplicada aquí (`ProductPage.ts` lo usan cuatro specs).

### Fase 7

- **Antes de escribir un probe de intervención, escribe uno de reconocimiento** — primero contar y localizar (sin clicks), después intervenir. Un probe que interviene y mide a la vez no sabe si lo que ve es el sitio o su propia intervención. Y mide dos veces si hay contenido lazy: recién cargado y tras scroll.
- **El setup de un experimento se hace con locators explícitos, nunca con el instrumento bajo sospecha** — y se verifica que el setup consiguió el estado antes de interpretar la medición.
- **Deja la cuenta compartida como la encontraste** — un probe que mete estado (wishlist, carrito) lo limpia al salir; §7 no tiene fixture de limpieza que lo haga por ti.
- **Un probe sin aserciones siempre termina en ✓** — su resultado está en las líneas de consola, no en el tick. No leer el verde como éxito (es el mismo aviso del falso verde de la Fase 6, en otra forma).
- **Al declarar "no es mi regresión" tras una suite roja, hazlo con la cadena de evidencia, no por corazonada:** stack trace → ¿el archivo es del diff de hoy? → ¿el spec que SÍ ejercita el diff pasó? → ¿el fallo matchea una clase documentada? → ¿qué dice el analyzer?

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

### Fase 5

| Síntoma | Causa | Solución |
|---|---|---|
| Un test falla con timeout esperando un cambio de estado que, mirando el screenshot/aria snapshot del fallo, **ya había ocurrido** | Un locator sin `.first()`/scope se volvió ambiguo (2+ elementos con el mismo rol+nombre) en algún momento del poll; el método de consulta usa `.catch(() => false)` para tratar "no existe todavía", pero eso también atrapa el error real de *strict mode violation* y lo convierte en el mismo `false` | Contar cuántas veces aparece ese rol+nombre en el snapshot del fallo; si son 2+, acotar el locator (`.first()` si el elemento de interés siempre precede al resto en el DOM, o un scope más específico) |

### Fase 6

| Síntoma | Causa | Solución |
|---|---|---|
| Un test pasa en verde pero sospechas que no comprueba nada | Afirma un **estado** que ya era cierto antes de empezar (cuenta compartida que arrastra estado entre corridas), en vez de una **transición** | Romper el selector a propósito y correr: si sigue verde, está confirmado. Arreglarlo garantizando el estado de partida y afirmando la transición completa |
| Una consulta `isXxx()` devuelve `false` y no sabes si es "no está" o "aún no ha cargado" | La consulta tiene dos significados indistinguibles; su `.catch(() => false)` los unifica | Añadir una espera de *readiness* previa que espere a que sea visible **cualquiera** de los estados posibles del control (patrón `detectAddFlow()`), y documentar en el docstring que la consulta solo es fiable después |
| Dos fallos distintos en la misma corrida y no sabes cuál investigar | El screenshot más llamativo no tiene por qué ser el de tu bug | Leer el **stack trace**: dice el archivo y la línea exacta del spec que falló. Comparar qué línea es en cada intento |
| Un `Click` en el trace dura exactamente su `timeout` y el Log solo dice `waiting for <locator>` | El locator no resolvió a ningún elemento — el click **no ocurrió** | Comprobar el nombre accesible real contra el del locator (`codegen` o el snapshot del fallo); no es un problema de timing |

### Fase 7

| Síntoma | Causa | Solución |
|---|---|---|
| `actUntil` agota su deadline con un mensaje "no renderizó / no apareció" pero el screenshot muestra el elemento perfectamente pintado — **y por duplicado** | El `verify` lanza una strict mode violation en cada poll y `retry.ts:41` la cuenta como `false` (doctrina) — el mensaje del timeout miente honestamente | Un "no está" con el elemento visible en el snapshot huele a error tragado: contar las coincidencias del rol+nombre en el snapshot; 2+ = ambigüedad, no ausencia |
| Una consulta de estado (`isXxx()`) devuelve una respuesta que "no puede ser" (dice `true` con el elemento principal claramente en el estado contrario) | El locator no está anclado: coincide con OTRO elemento de la página que sí está en ese estado (aquí: una tarjeta del cross-selling en la wishlist) | Reconocimiento primero (¿cuántos elementos matchean ese nombre y dónde viven?); anclar el locator a un contenedor propio del elemento de interés, no confiar en la posición |
| El analyzer clasifica un fallo recurrente como `unknown` | El mensaje de error es más reciente que el vocabulario del clasificador (aquí: el mensaje del drawer §28, escrito después que los patrones del analyzer) | `unknown/transient` recurrente con el mismo mensaje = candidato a nuevo patrón del clasificador; item de backlog con evidencia, no un bug del analyzer |

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

### Fase 5 — Automatización

Completada al tercer intento (2026-08-04), 100% interactiva de principio a fin. Ejercicio: escribir a mano un spec de wishlist (patrón POM) para el botón "Añadir/Eliminar de la lista de deseos" del PDP, sobre la base desktop ya estabilizada (§24 de findings). Proceso real seguido: probar el selector en vivo con `codegen` (el alumno lo ejecutó y describió lo que veía) → diseñar el par acción/consulta (`addToWishlist()`/`isInWishlist()`) discutiendo con el alumno cada decisión antes de escribir código → aplicar el código en `ProductPage.ts` siguiendo el patrón ya existente de `addToCart()` → escribir el spec (`tests/wishlist/add-to-wishlist.spec.ts`) → primera corrida real: **falló** con un timeout aparentemente de ruido de entorno, pero no se aceptó esa explicación sin mirar la evidencia (`error-context.md`) — investigación sistemática encontró un bug real (locator ambiguo por un carrusel de recomendaciones que repite el mismo botón, agravado por un `.catch` que disfrazaba el error de *strict mode*), se arregló con `.first()`, y se validó en vivo dos veces más (limpio) más la suite completa (`pnpm test` 8/8, cero reintentos — la primera corrida completamente verde con el spec de wishlist ya integrado). El stash `fase5-solo-attempt-2026-07-29` (conocimiento móvil, del primer intento inválido) se descartó tras completar el ejercicio de forma fresca. Detalle completo en findings §25.

### Fase 6 — Debugging

Completada a la primera (2026-08-06), 100% interactiva. Ejercicio: inyectar a propósito un defecto realista de selector (quitarle una palabra al nombre accesible del botón de wishlist: `'Añadir a la lista de deseos'` → `'Añadir a lista de deseos'`) y diagnosticarlo **desde la evidencia**, sin re-lanzar a ciegas.

### Fase 7 — Nivel intermedio: anclaje de locators

Completada a la primera (2026-08-10), 100% interactiva, sobre un pendiente real del proyecto: el lead 2 de findings §29 — la sospecha de que el `.first()` de los locators de wishlist (escrito en la Fase 5) no estaba anclado al producto principal. Proceso completo de investigación: formular la hipótesis como predicción falsable (el alumno identificó a la primera la precondición no escrita: "que el producto principal esté en la wishlist") → tabla de 4 combinaciones para encontrar el único estado que discrimina H0 de H1 (fila D: principal fuera, una tarjeta del cross-selling dentro — el alumno predijo la casilla correcta con el mecanismo correcto) → probe de reconocimiento (sin clicks: 43 botones de wishlist en un PDP, 1 principal sin test-id + 42 del cross-selling con `data-qa-anchor`) → probe de intervención montando la fila D con locators explícitos (nunca con el instrumento bajo sospecha), predicción pre-registrada → **H1 confirmada**: `isInWishlist() === true` con el principal demostrablemente fuera. Un segundo probe offline (`setContent`, `--no-deps`, segundos) demostró que `isVisible()` sobre 0 coincidencias devuelve `false` sin lanzar — el `.catch(() => false)` solo podía esconder ambigüedad, y la docstring de la Fase 5 describía mal su propio mecanismo. Arreglo: anclar ambos locators a `div.product-detail-info__labels-wishlist` (desviación CSS documentada — el botón principal no tiene test-id), quitar `.first()` (el alumno lo eligió con la razón correcta: "así si hay dos salta el error") y quitar el catch. Validación como experimento controlado: el MISMO probe de fila D, una variable cambiada, respuesta `true` → `false`. Suite completa: el spec de wishlist verde a la primera; un fallo real en search (clase §7/§24, ventana DES degradada de 15.1m) triado con la cadena stack trace → diff → clase documentada → analyzer (`timeout/persistent` — corroboró la lectura manual), aplicando bien el refuerzo pendiente de la Fase 6. Cierre del ciclo con `pnpm analyze` + `pnpm learn` sobre el run real. Detalle completo en findings §31. El ejercicio se desvió inmediatamente de lo previsto y ahí estuvo todo el valor: **el test pasó en verde con el selector roto, dos veces**. La investigación con el trace viewer (`--trace on` + `show-trace`) demostró que el click duraba exactamente sus 5s de `timeout` con el Log en `waiting for <locator>` — es decir, nunca ocurrió — y que el `Before` del click mostraba el PDP **sin pintar**. Diagnóstico final: el spec que el propio alumno escribió en la Fase 5 afirmaba un **estado** (`isInWishlist() === true`) en vez de una **transición**, sobre una cuenta compartida que arrastra la wishlist entre corridas (findings §7), de modo que el `true` ya era cierto antes de empezar; y la guarda de idempotencia no lo salvaba porque `isInWishlist()` respondía `false` sobre una página aún sin pintar, indistinguible de un "no está". Es la misma clase de defecto que findings §28: **un `verify` que no distingue "mi acción funcionó" de "ya era verdad"** — agravado porque `actUntil` se traga el error del `act` por diseño, así que toda la corrección recae en el `verify`. El alumno resolvió sin ayuda las dos preguntas de diseño ("quitarlo primero" y "esperar a que el PDP esté cargado"). Arreglo aplicado: `waitForWishlistControl()` (readiness por cualquiera de los dos estados, copiando el patrón existente `detectAddFlow()`), `removeFromWishlist()`, y el spec afirmando la transición completa. Validación como experimento controlado: rojo con el selector roto, verde al arreglarlo, una sola variable cambiada; suite completa 15/15 sin reintentos, unit 421/421, typecheck/lint limpios. Lección de plataforma que se llevó la fase: **un falso verde es invisible para `analyze` y `heal`** — sin fallo no hay clasificación ni propuesta de curación. Y una lección aprendida por las malas: se perdió el trace de la única corrida que quedó sin explicar por relanzar antes de leer `test-results/` (justo la nota de método de findings §28). Detalle completo en findings §29.
