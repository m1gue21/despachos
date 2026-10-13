# Marca: Arriero

> Propuesta inicial. Antes de registrarla hay que verificar en la SIC
> (Superintendencia de Industria y Comercio) que el nombre esté libre en la
> clase de transporte y mensajería (clase 39 de Niza) y comprar el dominio.

## Nombre

**Arriero** — *despacho local de domicilios y transporte.*

Los arrieros movieron el Eje Cafetero: café, correo y mercancía a lomo de mula
por trochas que nadie más subía. Manizales se fundó y creció gracias a ellos.
Hoy el trabajo es el mismo con otro vehículo: motos y carros subiendo y
bajando lomas, llevando pedidos y personas de un barrio a otro.

Por qué funciona:

- **Local de verdad.** Ninguna app grande puede llamarse así sin sonar
  impostada. Es orgullo regional, no un nombre genérico en inglés.
- **Dice lo que hacemos.** Llevar cosas y gente por la montaña.
- **Corto y fácil de dictar** por teléfono o WhatsApp: "arriero punto co".
- **Da para una historia** que se cuenta sola: de la mula a la moto.

Alternativas consideradas (por si Arriero no está disponible):

| Nombre | Idea | Por qué no fue la primera |
|---|---|---|
| **Vuelta** | "Hágame una vuelta" = mandado en Colombia | Muy usada; choca con ciclismo y con frases comunes al buscarla |
| **Ladera** | Manizales está hecha de laderas | Bonito pero no evoca reparto ni transporte |
| **Carriel** | El bolso del arriero, símbolo de Caldas | Se entiende como accesorio, no como servicio |

## Diferenciador

> **Despacho humano y local, con tecnología de app grande.**

Las apps grandes ponen un algoritmo entre el negocio y el mensajero. Los grupos
de WhatsApp ponen el caos. Arriero está en el medio:

1. **Operadores de aquí** que conocen los barrios, las lomas y los atajos, y
   asignan cada servicio al mensajero más cercano.
2. **Se pide como siempre: por WhatsApp.** Ni el negocio ni su cliente tienen
   que instalar nada.
3. **El cliente ve a su mensajero en vivo** con un enlace, y califica al final.
4. **Trato justo para el mensajero:** puntaje transparente (sabe cómo se
   calcula), trabaja por sector o en vivo según quiera, y no necesita un
   celular de gama alta: puede trabajar sin app.

Frase de marca: **"Lo llevamos, loma arriba."**
Variantes: *"Despacho de aquí, para los de aquí."* · *"De la mula a la moto,
siempre llegamos."*

## Voz

- Cercana y paisa sin caricatura: tuteo, frases cortas, palabras de aquí
  ("domi", "vuelta", "loma", "parcero" solo con medida).
- Concreta: decimos qué pasa y cuánto tarda, no "soluciones innovadoras".
- Honesta: no prometemos tiempos ni tarifas que no controlamos; no inventamos
  cifras ni testimonios.

## Color

Inspirado en el paisaje: el verde de los cafetales en ladera, el ámbar del
carriel y la luz de la tarde, la tierra de las trochas.

| Token | Hex | Uso |
|---|---|---|
| `cafetal` | `#1F5C45` | Color principal: marca, botones, encabezados |
| `cafetal-900` | `#0F2E23` | Texto sobre claro, fondos oscuros |
| `carriel` | `#E59A2F` | Acento: rutas, llamados a la acción secundarios, el "pin" del logo |
| `trocha` | `#B5532A` | Acento cálido puntual (alertas suaves, ilustración) |
| `neblina` | `#F6F1E7` | Fondo cálido (la neblina de la mañana en Manizales) |
| `piedra` | `#5B6660` | Texto secundario |

Contraste verificado para texto: `cafetal-900` sobre `neblina` y blanco sobre
`cafetal` cumplen WCAG AA. El ámbar `carriel` no se usa para texto pequeño
sobre claro (no alcanza AA); sí como relleno de botón con texto `cafetal-900`.

## Tipografía

- **Bricolage Grotesque** (variable, libre en Google Fonts / Fontsource):
  títulos y logotipo. Tiene carácter —un poco artesanal— sin perder
  legibilidad.
- **Texto:** la fuente del sistema (system-ui). Carga cero y se lee bien en
  cualquier celular.

## Logo

- **Isotipo:** una **A** que es a la vez una **montaña** (las lomas de
  Manizales) y un **sendero**: en lugar del travesaño de la A, una ruta
  punteada en ámbar que sube zigzagueando hasta un **punto de entrega** cerca
  de la cima. Se lee como "llegamos a donde sea, aunque sea loma arriba".
- **Logotipo:** "arriero" en minúscula, Bricolage Grotesque ExtraBold, color
  `cafetal-900`, con el punto de la *i* en ámbar.
- Archivos: `apps/landing/public/logo.svg` (completo),
  `apps/landing/public/isotipo.svg`, `apps/landing/public/favicon.svg`.
- Espacio libre alrededor: la altura de la *a* minúscula. Tamaño mínimo del
  isotipo: 20 px.
- Pendiente para la versión final: convertir el logotipo a trazos (hoy el
  texto del SVG depende de que la fuente esté instalada).

## Producto

- **Arriero Despacho:** el panel de los operadores.
- **Arriero Conductor:** la web/app de los mensajeros y conductores.
- **Seguimiento Arriero:** el enlace que recibe el cliente.
