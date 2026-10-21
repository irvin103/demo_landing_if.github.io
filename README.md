# Instituto Fleming — Sitio Web

Sitio web multi-página para el **Instituto Fleming**, construido como sitio estático (HTML + JavaScript vanilla con ES Modules + Tailwind CSS vía CDN) pensado para GitHub Pages, sin build step ni framework. Cada página comparte una misma "carcasa" (nav, footer, widget de chat) y compone su contenido en tiempo de ejecución a partir de fragmentos HTML ("partials") y datos en JSON.

## Páginas del sitio

- **`index.html`** — Home: hero, promociones, oferta educativa (con detalle por nivel en un modal), planteles, estadísticas y el formulario de contacto ("Resuelve tus dudas").
- **`nosotros.html`** — Historia del instituto y misión/visión/valores.
- **Aviso de privacidad** — No es una página: es un modal con la versión resumida (`partials/aviso-privacidad.html`, lo abre `assets/js/aviso-privacidad.js`) desde el footer y la casilla del formulario, con enlace al aviso integral en PDF (`assets/docs/aviso-privacidad-instituto-fleming.pdf`). Sin JavaScript, esos enlaces abren el PDF.
- **19 páginas de programa** (`bachillerato-gastronomia.html`, `licenciatura-derecho.html`, `ingenieria-industrial.html`, etc.) — una página dedicada por programa académico, con imagen principal, tabs verticales de detalle y botón de contacto. Ver la sección "Páginas de programa" más abajo.

## ¿Cómo funciona?

1. Cada página define su `<head>` (Tailwind CDN + `assets/js/tailwind-config.js` con el tema compartido, fuentes, `assets/css/styles.css`) y marca los puntos de inserción de cada sección con `data-include="partials/archivo.html"`.
2. `assets/js/main.js` recorre esos elementos, hace `fetch` de cada partial (con `cache: "no-cache"` para evitar servir versiones desactualizadas mientras se itera) y lo inyecta como `innerHTML`. Luego resuelve, en este orden: qué link del nav debe verse "activo" según la página actual, el menú desplegable de redes sociales, el resto de secciones dependientes de datos (en paralelo), y por último el scroll a un `#ancla` si la URL trae una (debe ir al final para que la página ya tenga su alto real).
3. `assets/js/render-sections.js` concentra toda la lógica de renderizado dinámico: lee los JSON de `data/` y llena las secciones, arma los menús desplegables del nav, los modales, los acordeones y las páginas de programa.
4. `assets/js/n8n-chat.js` inicializa el widget de chat de `@n8n/chat` contra un webhook de n8n.

Al depender de `fetch` para partials y datos, el sitio necesita servirse por HTTP (no `file://`) — ver "Ejecutar el proyecto localmente" más abajo.

## Estructura del proyecto

```
demo_landing_if.github.io/
├── index.html                       # Home
├── nosotros.html                    # Página "Nosotros"
├── favicon.ico                      # Ícono de la pestaña (16/32/48 px, emblema IMIFLE); en assets/img/ están apple-touch-icon e icon-192/512
├── site.webmanifest                 # Íconos para Android / "agregar a pantalla de inicio"
├── backend/php/                     # Backend del formulario (PHP en HostGator + Resend): respaldo CSV + correo a inscripciones@
├── <programa>.html × 19             # Una página por programa académico (ver más abajo)
│
├── partials/
│   ├── nav.html                     # Barra de navegación: logo, Inicio, dropdown "Oferta Educativa",
│   │                                 #   Nosotros, dropdown "Comunidad" (redes sociales) y menú de celular
│   ├── hero.html                    # Hero del home
│   ├── promo-cards.html             # Contenedor de tarjetas promocionales (#promo-grid)
│   ├── certificacion.html           # Franja animada red CONOCER + Universidad Fleming IMIFLE
│   ├── oferta-educativa.html        # Contenedor de tarjetas por nivel (#oferta-grid) + modal de detalle
│   ├── planteles.html               # Contenedor de tarjetas de planteles (#planteles-grid)
│   ├── stats.html                   # Cita institucional + 3 estadísticas (contenido estático)
│   ├── lead-form.html               # Formulario "Resuelve tus dudas" (id="lead-form") + video de YouTube Shorts
│   ├── footer.html                  # Logo, redes sociales y enlaces legales (aviso de privacidad, reglamentos)
│   ├── aviso-privacidad.html        # Contenido del modal del aviso de privacidad (versión resumida)
│   ├── programa-detalle.html        # Skeleton compartido por las 19 páginas de programa
│   └── nosotros/
│       ├── hero.html                # Historia (1981, 45 años, +3,000 alumnos) + CTA
│       ├── quienes-somos.html       # "¿Por qué estudiar en Instituto Fleming?" (4 tarjetas)
│       ├── mision-vision.html       # Misión / Visión / Objetivos (cultura organizacional)
│       └── valores.html             # Los 7 valores institucionales (icon-grid)
│
├── assets/
│   ├── css/styles.css               # Overlay del hero, fondo de mapa, animaciones [data-reveal], franja de certificación, colores del chat
│   ├── js/
│   │   ├── tailwind-config.js       # Tema de Tailwind (colores, tipografía) compartido por todas las páginas
│   │   ├── main.js                  # Orquestador: inyecta partials, nav activo, menú móvil, animaciones al hacer scroll, scroll a #ancla
│   │   ├── render-sections.js       # Toda la lógica de renderizado dinámico (ver detalle abajo)
│   │   ├── lead-form.js             # Formulario de contacto: validación, programa precargado y envío
│   │   ├── aviso-privacidad.js      # Abre el aviso de privacidad resumido en un modal (<dialog>)
│   │   └── n8n-chat.js              # Widget de chat (@n8n/chat 1.40.1 fijada) + botón con la mascota y globo de diálogo
│   ├── img/                         # Imágenes locales (logos, oferta, hero, planteles)
│   └── docs/                        # PDFs oficiales: aviso de privacidad, reglamento universitario y escolar
│
└── data/
    ├── promos.json                  # Tarjetas promocionales del home
    ├── oferta.json                  # Los 4 niveles educativos (teaser del home + menú del nav)
    ├── oferta/
    │   ├── bachillerato.json        # 6 programas
    │   ├── licenciaturas.json       # 8 programas
    │   ├── maestrias.json           # 2 programas
    │   └── tecnicas.json            # 3 programas
    ├── planteles.json               # Planteles (nombre, tag, descripción, dirección, teléfono, imagen)
    └── form-options.json            # (sin usar; árbol Plantel→Nivel→Modalidad→Programa, ver nota abajo)
```

## Oferta educativa: de dato a página

La oferta educativa vive en **4 archivos JSON** bajo `data/oferta/` (uno por nivel), cada uno con un array `programs`. Cada programa trae: `id`, `title`, `icon` (Material Icon representativo, ya que no siempre hay fotografía real), `description`, `schedule`, `requiredDocuments`, `benefits`, `officialDocumentsObtained` (opcional), `planteles` (opcional — si falta, la pestaña "Planteles" se omite), `externalLink` (opcional, programas Acuerdo 286), `featured` (opcional), `image` y `cta`.

Ese mismo dato se consume en **tres lugares** distintos de `render-sections.js`:

1. **Home** (`renderOferta`) — 4 tarjetas simples por nivel (Bachillerato, Técnicas, Licenciaturas, Maestría), leídas de `data/oferta.json`. Al hacer clic se abre un modal (`renderOferta` + `openOfertaDetalle`) con un acordeón de los programas de ese nivel.
2. **Menú del nav** (`renderOfertaNavMenu`) — al pasar el cursor sobre "Oferta Educativa" se despliega un submenú con los 4 niveles; al pasar el cursor sobre un nivel, se cargan bajo demanda sus programas desde `data/oferta/<nivel>.json` y cada uno enlaza a su página dedicada (`<id>.html`).
3. **Páginas de programa** (`renderProgramaDetalle`) — cada una de las 19 páginas raíz (`bachillerato-gastronomia.html`, etc.) marca `<body data-nivel="..." data-programa-id="...">`; esa función lee esos atributos, busca el programa correspondiente y arma: imagen principal (con marco e iniciales/ícono como respaldo si la foto no existe — ver `HERO_IMAGE_TIERS`, tamaños ajustados según la resolución real de cada foto) y 5 pestañas verticales (Resumen, Modalidad y Horarios, Requisitos, Te ofrecemos, Planteles).

## Animaciones de entrada

Las secciones aparecen al hacer scroll sin cambiar el diseño: solo se agregan atributos `data-*` a los partials, y `assets/js/main.js` (`initReveal`) más `assets/css/styles.css` hacen el resto.

- `data-reveal`: el elemento sube y aparece al entrar en pantalla (una sola vez).
- `data-reveal-stagger`: lo mismo para cada hijo directo, escalonado cada 80 ms (incluye las tarjetas que se pintan después desde los JSON).
- `data-reveal-line`: las líneas decorativas de los títulos crecen desde el centro.
- `data-countup`: la cifra cuenta desde 0 hasta su valor ("+3042", "+3,000", "14"); el texto final es siempre el original.
- `data-hero-zoom`: la foto del hero entra con un leve acercamiento.

Duraciones y curvas viven en variables CSS (`--motion-enter`, `--motion-stagger`, `--motion-ease-out`, …). Se animan solo `opacity`, `translate` y `scale` con `@keyframes` para no interferir con los hover de Tailwind. Con "reducir movimiento" activado en el sistema, todo se muestra de inmediato sin animación.

## Ejecutar el proyecto localmente

Al usar `fetch` para cargar partials y JSON, el sitio debe servirse por HTTP:

```bash
# Con Python
python -m http.server 8080

# o con Node
npx serve .
```

Luego abre `http://localhost:8080`.

## Cosas a tener en cuenta / pendientes

- **`assets/js/n8n-chat.js`** apunta a un webhook de **ngrok temporal** (`WEBHOOK_URL`); se ha tenido que actualizar varias veces (ver historial de commits). Debe reemplazarse por un endpoint estable antes de depender de él en producción.
- **Mascota del chat:** el botón propio del chat busca `assets/img/mascota.webp` (idealmente PNG/WebP con fondo transparente, cuadrado, ~200 px). Mientras no exista, muestra un ícono de respaldo; al agregar el archivo aparece la mascota con su animación, sin tocar código. El globo "¿En qué puedo ayudarte?" sale a los 2 s y no vuelve a salir en la sesión si se cierra.
- **Versión de `@n8n/chat`:** fijada en 1.40.1 en `n8n-chat.js` y en el `<link>` del CSS de cada página; actualizar ambos juntos.
- **Formulario de contacto** (`assets/js/lead-form.js`): valida, precarga el programa cuando se llega desde una página de programa (`?programa=&nivel=`) y pide aceptar el aviso de privacidad. Envía a un backend PHP (`backend/php/contacto.php`) que se sube al hosting de HostGator, guarda un respaldo CSV y manda el correo a inscripciones@institutofleming.edu.mx con Resend. **Falta desplegarlo** (ver `backend/php/README.md`) y poner su URL en `FORM_CONFIG.endpoint`; mientras esté vacío, "Enviar" abre la app de correo del visitante con el mensaje listo.
- Algunas fotos de programas (`turismo.jpg`, `puericultura.jpg`, `psicopedagogia.jfif`) tienen resolución nativa baja y pueden verse un poco suaves incluso en el tamaño más chico — requeriría fotografía de mayor resolución para corregirse del todo.
- **`assets/img/turismo_2.webp`** no está enlazado desde ningún programa (solo se usa `turismo.jpg`).
- **`data/form-options.json`** ya no se usa en ningún lado (quedó de una versión anterior del formulario). Se dejó en el repo por si se retoma, pero no forma parte del flujo activo.
- **`assets/img/logo-red-conocer.webp`** es el logo oficial que entregó el cliente ("red Conocer de prestadores de servicio, Entidad de Certificación y Evaluación").
- **`assets/img/mascota.webp`** es el busto de la mascota "Alex Fleming" para el botón del chat (192 × 192, fondo transparente), recortado de la propuesta de mascota del cliente. Si el archivo falta, el botón muestra un ícono.
- **`assets/img/mascota-animada.webp`** es la versión animada del mismo busto (176 × 176, WebP animado con transparencia, ~8 s por vuelta: voltea a un lado y al otro y mira de reojo). Es la que usa el botón; con "reducir movimiento" se muestra `mascota.webp`.

## Tecnologías utilizadas

- **HTML5** + **JavaScript vanilla (ES Modules)** — sin build step ni framework.
- **Tailwind CSS** (vía CDN; el tema de marca vive en `assets/js/tailwind-config.js`: azul `#001590` del logo IMIFLE y rojo `#E01C26` de CONOCER como acento).
- **Material Icons / Material Symbols** y **Font Awesome** (incluye íconos de marca: TikTok, YouTube, Instagram, WhatsApp) para iconografía.
- **Google Fonts (Montserrat)**.
- **[@n8n/chat](https://www.npmjs.com/package/@n8n/chat)** para el widget de chat conectado a un flujo de automatización en n8n.
