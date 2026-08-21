# Oráculo #7 — "N COLORES" de la card PLP vs colores del PDP (diseño)

**Fecha:** 2026-08-21. **Aprobado por:** Jorge. **Programa:** oráculos de correctness (findings §40).

## Contexto y por qué esta reformulación

El candidato del backlog era "result-count vs rendered cards". Está muerto tal como estaba
nombrado: la PLP desktop de DES **no muestra ningún contador de resultados** — confirmado por
dos vías independientes (0 elementos tipo "N resultados/artículos" en el mapa de 374 páginas,
y un screenshot desktop de Mujer Camisetas aportado por Jorge donde no aparece contador en
ninguna superficie). Lo que la card SÍ declara es el enlace **"N COLORES"** cuando el producto
tiene más de uno — un número prometido en la PLP, verificable contra el PDP real. Misma
familia que el oráculo de tallas overlay↔PDP (§42).

## Aserción

La primera card del primer viewport que declare "N COLORES" (N≥2) debe llevar a un PDP que
ofrezca **exactamente N colores**. Un desajuste con el resto del suite verde = catálogo
inconsistente, bug real de DES.

## Ruta

**Hombre Combo Wins** — la única PLP mantenida sin oráculo tras la diversificación de §44, y
su page object ya tiene `ensureOnPlp()` (hook de recuperación anti-bounce §26/§43).

**Contingencia:** es una PLP de campaña y no está confirmado que tenga cards multicolor. Si el
probe no encuentra ninguna, se crea un page object para **Mujer Camisetas**
(`/es/mujer/ropa/camisetas-n1234.html` — path exacto a confirmar en el probe; el screenshot
confirma cards de 2/3/4 colores ahí), con señal de `isLoaded()` por **título + heading** —
nunca `filterButton` (hazard §36).

## Flujo del spec (`tests/hombre/plp-colores-card-vs-pdp.spec.ts`)

Todo heredado de plantillas ya endurecidas:

1. Navegación param-less → `ensureOnPlp` → escanear cards del primer viewport **sin scroll**,
   leyendo `innerText` con bound de 5s (§43 — bounds en waiting reads).
2. Primera card cuyo texto matchee `/(\d+)\s+COLORES/i` → capturar su propio id `-c0p` y su N
   declarado. Cards sin declaración (un solo color) quedan fuera de alcance.
3. Click act→verify→retry anclado a **ese** id en la URL (§28/§31 — nunca "algún PDP";
   patrón de `plp-pdp-price-consistency`, §41). Re-anclaje vía `ensureOnPlp` dentro del loop
   de retry, guardado para no navegar fuera de un PDP ya alcanzado (§43).
4. En el PDP, contar los colores ofrecidos (selector: resultado del probe) y comparar con
   `expect.poll`. El mensaje de fallo lista ambos lados — N declarado y lo que el PDP
   renderizó — para que un bug de producto y un artefacto de lectura se nombren solos (§40).

## Probe previo obligatorio (~15 min, se borra tras aterrizar el conocimiento — ciclo §18)

- (a) ¿Hombre Combo Wins tiene cards multicolor? (decide la ruta)
- (b) ¿Cómo renderiza el PDP desktop su selector de color — rol, nombre accesible, y si el
  color activo cuenta como uno más? Es el único desconocido real: el selector de colores del
  PDP no está en ningún finding.

Los hallazgos del probe se registran en el findings doc (sección nueva) antes de escribir el
spec definitivo.

## Techo conocido (documentado también en el spec)

Si el PDP oculta colores sin stock mientras la card los cuenta todos, un desajuste sería
"falso bug". No comprobable sin encontrar un producto en ese estado; misma postura honesta
que §42 con las tallas deshabilitadas. El primer fallo se lee de su propio `error-context.md`
antes de culpar a DES.

## Qué NO hace

- No scrollea (el grid hidrata en lazy-load — §31).
- No compara nombres de colores, solo la cuenta.
- No toca las otras 5 rutas de oráculos (§44).

## Validación

- Probe en vivo → findings.
- Spec en vivo standalone (2 pases limpios).
- `pnpm typecheck` / `pnpm lint`.
- El full `qa-cycle` llega con el siguiente ciclo regular, no se lanza ad-hoc para esto.
