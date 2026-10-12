async function fetchJSON(url) {
  // "no-cache" fuerza una revalidación con el servidor en cada carga (en vez
  // de servir una copia en caché sin más), para que los cambios en los JSON
  // de datos se reflejen de inmediato durante el desarrollo.
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeTitleWithBr(html) {
  const escaped = escapeHTML(html);
  return escaped
    .replaceAll("&lt;br&gt;", "<br>")
    .replaceAll("&lt;br/&gt;", "<br/>")
    .replaceAll("&lt;br /&gt;", "<br/>");
}

// --- Placeholder de imagen (usado mientras no exista la fotografía real) -

// Palabras que no aportan al derivar iniciales de un título/nombre.
const INITIALS_STOPWORDS = new Set([
  "de", "del", "la", "las", "el", "los", "en", "con", "y", "para", "por", "un", "una",
  "dr", "dra", "mtro", "mtra", "ing", "lic", "acuerdo", "sep",
]);

function getInitials(text) {
  const clean = String(text || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s-]/g, " ");

  const words = clean
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((w) => !INITIALS_STOPWORDS.has(w.toLowerCase()) && !/^\d+$/.test(w));

  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  const fallback = clean.trim().split(/\s+/).filter(Boolean);
  return fallback.length ? fallback[0].slice(0, 2).toUpperCase() : "?";
}

// Renderiza un contenedor con fondo de marca + iniciales como placeholder,
// con la imagen real superpuesta. Si la imagen no existe (404) o aún no fue
// entregada por el cliente, el onerror la retira y deja visibles las
// iniciales — así, cuando la fotografía real se agregue en la misma ruta,
// no hace falta tocar ningún código.
function renderMediaPlaceholder({ src, alt, label, icon, containerClass, imgClass = "", imgStyle = "", initialsClass = "text-2xl" }) {
  const safeAlt = escapeHTML(alt || "");
  const safeSrc = escapeHTML(src || "");

  // Si el programa trae un ícono representativo (temática, no fotografía),
  // se usa como placeholder; si no, se cae a las iniciales del título/nombre.
  const badge = icon
    ? `<span class="material-icons ${initialsClass} text-white/90">${escapeHTML(icon)}</span>`
    : `<span class="${initialsClass} font-extrabold text-white/90 tracking-wide select-none">${escapeHTML(getInitials(label ?? alt ?? ""))}</span>`;

  const img = safeSrc
    ? `<img
        src="${safeSrc}"
        alt="${safeAlt}"
        loading="lazy"
        class="absolute inset-0 w-full h-full object-cover ${imgClass}"
        style="${escapeHTML(imgStyle)}"
        onerror="this.remove()"
      />`
    : "";

  return `
    <div class="relative overflow-hidden bg-gradient-to-br from-primary to-secondary flex items-center justify-center ${containerClass}">
      ${badge}
      ${img}
    </div>
  `;
}

// --- Menú desplegable "Oferta Educativa" en la barra de navegación -------
//
// Dos niveles: el primero lista los niveles académicos (Bachillerato,
// Técnicas, Licenciaturas, Maestría) desde data/oferta.json; al pasar el
// cursor (o hacer clic) sobre uno de ellos, se carga bajo demanda
// data/oferta/<nivel>.json y se despliega un submenú anidado con sus
// programas. Cada programa enlaza a index.html con el nivel/programa como
// query params — todavía no existen páginas dedicadas por programa, así
// que por ahora esto solo desplaza a la sección de oferta educativa del
// home; la lógica para leer esos params y abrir el detalle exacto queda
// pendiente para una siguiente tarea.

const ofertaDropdownControllers = [];
let dropdownGlobalListenersBound = false;

function bindDropdownGlobalListeners() {
  if (dropdownGlobalListenersBound) return;
  dropdownGlobalListenersBound = true;

  document.addEventListener("click", (e) => {
    ofertaDropdownControllers.forEach((c) => {
      if (!c.container.contains(e.target)) c.setOpen(false);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") ofertaDropdownControllers.forEach((c) => c.setOpen(false));
  });
}

// Ata hover (con un pequeño retraso al salir, para poder cruzar el hueco
// entre el botón y el panel) + clic + Escape a un contenedor [data-dropdown]
// que tenga un [data-dropdown-trigger] y un [data-dropdown-panel] como
// hijos directos. Reutilizable para el menú de nivel superior y para cada
// submenú anidado de nivel académico.
function bindDropdown(container) {
  if (!container || container.dataset.dropdownBound) return null;

  const trigger = container.querySelector(":scope > [data-dropdown-trigger]");
  const panel = container.querySelector(":scope > [data-dropdown-panel]");
  if (!trigger || !panel) return null;

  container.dataset.dropdownBound = "true";

  let closeTimer = null;
  let open = false;

  const setOpen = (value) => {
    open = value;
    trigger.setAttribute("aria-expanded", String(value));
    panel.classList.toggle("hidden", !value);
    trigger.classList.toggle("text-primary", value);
    trigger.querySelector("[data-dropdown-caret]")?.classList.toggle("rotate-180", value);
  };

  const cancelClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer = setTimeout(() => setOpen(false), 200);
  };

  container.addEventListener("mouseenter", () => {
    cancelClose();
    setOpen(true);
  });
  container.addEventListener("mouseleave", scheduleClose);

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(!open);
  });

  const controller = { container, setOpen, isOpen: () => open };
  ofertaDropdownControllers.push(controller);
  return controller;
}

const ofertaLevelProgramsCache = {};

async function getOfertaProgramsForLevel(level) {
  if (ofertaLevelProgramsCache[level]) return ofertaLevelProgramsCache[level];
  const data = await fetchJSON(`data/oferta/${level}.json`);
  const programs = data.programs || [];
  ofertaLevelProgramsCache[level] = programs;
  return programs;
}

export async function renderOfertaNavMenu() {
  const rootDropdown = document.getElementById("oferta-nav-dropdown");
  const menu = document.getElementById("oferta-nav-menu");
  if (!rootDropdown || !menu) return;

  bindDropdownGlobalListeners();
  bindDropdown(rootDropdown);

  const data = await fetchJSON("data/oferta.json");
  const levels = data.items || [];

  menu.innerHTML = levels.map((item) => {
    const title = escapeHTML(item.title || "");
    const level = escapeHTML(item.level || "");
    return `
      <div class="relative" data-dropdown data-level="${level}">
        <button
          type="button"
          data-dropdown-trigger
          aria-haspopup="true"
          aria-expanded="false"
          class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:text-primary dark:hover:text-primary transition-colors"
        >
          ${title}
          <span class="material-icons text-base text-gray-400 flex-shrink-0">chevron_right</span>
        </button>
        <div data-dropdown-panel class="hidden absolute left-full top-0 z-50 pl-2">
          <div class="w-64 max-h-80 overflow-y-auto bg-white dark:bg-surface-dark rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2" data-programs-list>
            <p class="px-4 py-3 text-xs text-gray-400">Cargando…</p>
          </div>
        </div>
      </div>
    `;
  }).join("");

  menu.querySelectorAll("[data-dropdown]").forEach((el) => {
    const controller = bindDropdown(el);
    if (!controller) return;

    const level = el.dataset.level;
    let loaded = false;

    const loadPrograms = async () => {
      if (loaded) return;
      loaded = true;

      const listEl = el.querySelector("[data-programs-list]");
      try {
        const programs = await getOfertaProgramsForLevel(level);
        listEl.innerHTML = programs.length
          ? programs.map((p) => {
              const programTitle = escapeHTML(p.title || "");
              const href = escapeHTML(`${p.id || ""}.html`);
              return `<a href="${href}" class="block px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:text-primary dark:hover:text-primary transition-colors">${programTitle}</a>`;
            }).join("")
          : `<p class="px-4 py-3 text-xs text-gray-400">Sin programas disponibles.</p>`;
      } catch (err) {
        listEl.innerHTML = `<p class="px-4 py-3 text-xs text-red-500">No se pudo cargar.</p>`;
      }
    };

    el.addEventListener("mouseenter", loadPrograms);
    el.querySelector(":scope > [data-dropdown-trigger]")?.addEventListener("click", loadPrograms);
  });
}

// --- Menú desplegable "Comunidad" (redes sociales) en la barra de nav ---
//
// A diferencia del menú de "Oferta Educativa", este es estático (siempre
// las mismas 4 redes, ya escritas en partials/nav.html), así que solo hace
// falta reutilizar el mismo bindDropdown genérico — sin fetch ni submenú.

export function initComunidadDropdown() {
  const container = document.getElementById("comunidad-nav-dropdown");
  if (!container) return;

  bindDropdownGlobalListeners();
  bindDropdown(container);
}

// --- Página de detalle de un programa (una por programa, ver /*.html) ---
//
// Cada página de programa marca <body data-nivel="..." data-programa-id="...">
// y comparte el mismo partial partials/programa-detalle.html. Esta función
// lee esos data-attributes, busca el programa en data/oferta/<nivel>.json y
// arma el layout: imagen/ícono grande centrado + tabs verticales (Resumen,
// Modalidad y Horarios, Requisitos, Te ofrecemos, Planteles).

const TAB_ACTIVE_CLASS =
  "flex-shrink-0 md:w-full text-left px-5 py-4 text-sm font-semibold border-b-2 md:border-b-0 md:border-l-4 transition-colors whitespace-nowrap md:whitespace-normal border-primary text-primary bg-white dark:bg-surface-dark";
const TAB_INACTIVE_CLASS =
  "flex-shrink-0 md:w-full text-left px-5 py-4 text-sm font-semibold border-b-2 md:border-b-0 md:border-l-4 transition-colors whitespace-nowrap md:whitespace-normal border-transparent text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/60 hover:text-primary";

function renderProgramaEmptyState(msg) {
  return `<p class="text-sm text-secondary-text-light dark:text-secondary-text-dark italic">${escapeHTML(msg)}</p>`;
}

// Directorio de planteles (data/planteles.json) con dirección/teléfono, para
// cruzarlo contra los nombres en program.planteles y mostrar tarjetas con
// la info de contacto completa en la pestaña "Planteles".
let plantelesDirectoryCache = null;

async function getPlantelesDirectory() {
  if (plantelesDirectoryCache) return plantelesDirectoryCache;
  const data = await fetchJSON("data/planteles.json");
  plantelesDirectoryCache = data.items || [];
  return plantelesDirectoryCache;
}

function renderPlantelCard(plantel) {
  const name = escapeHTML(plantel.name || "");
  const address = plantel.address ? `<p class="flex items-start gap-2 text-sm text-secondary-text-light dark:text-secondary-text-dark mt-2"><span>🏠</span><span>${escapeHTML(plantel.address)}</span></p>` : "";
  const phone = plantel.phone?.length ? `<p class="flex items-center gap-2 text-sm text-secondary-text-light dark:text-secondary-text-dark mt-1"><span>📞</span><span>${plantel.phone.map((n) => escapeHTML(n)).join(" / ")}</span></p>` : "";

  return `
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h4 class="font-bold text-gray-900 dark:text-white">${name}</h4>
      ${address}
      ${phone}
    </div>
  `;
}

// plantelesDirectory se pasa ya resuelto (ver renderProgramaDetalle) para
// que esta función pueda seguir siendo síncrona.
function renderProgramaTabsContent(program, plantelesDirectory) {
  const externalLinkBlock = program.externalLink?.url
    ? `<a href="${escapeHTML(program.externalLink.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 mt-5 text-sm font-semibold text-secondary hover:underline">
        ${escapeHTML(program.externalLink.label || "Más información")}
        <span class="material-icons text-sm">open_in_new</span>
      </a>`
    : "";

  const hasBenefits = program.benefits?.length;
  const hasOfficialDocs = program.officialDocumentsObtained?.length;

  const tabs = [
    {
      key: "resumen",
      label: program.title || "Resumen",
      content: `
        <p class="text-sm text-secondary-text-light dark:text-secondary-text-dark leading-relaxed">${escapeHTML(program.description || "")}</p>
        ${externalLinkBlock}
      `,
    },
    {
      key: "modalidad",
      label: "Modalidad y Horarios",
      content: program.schedule?.length
        ? renderBulletList(program.schedule)
        : renderProgramaEmptyState("Próximamente más información sobre modalidad y horarios."),
    },
    {
      key: "requisitos",
      label: "Requisitos",
      content: program.requiredDocuments?.length
        ? renderBulletList(program.requiredDocuments)
        : renderProgramaEmptyState("Próximamente más información sobre requisitos."),
    },
    {
      key: "ofrecemos",
      label: "Te ofrecemos",
      content: hasBenefits || hasOfficialDocs
        ? `
          ${hasBenefits ? `<div class="${hasOfficialDocs ? "mb-6" : ""}"><h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Beneficios</h4>${renderBulletList(program.benefits)}</div>` : ""}
          ${hasOfficialDocs ? `<div><h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Documentos oficiales que obtendrás</h4>${renderBulletList(program.officialDocumentsObtained)}</div>` : ""}
        `
        : renderProgramaEmptyState("Próximamente más información sobre los beneficios de este programa."),
    },
  ];

  // Este programa no tiene planteles asociados (p. ej. la Licenciatura por
  // Experiencia Profesional Acuerdo 286, que no es presencial en un
  // plantel específico) — se omite la pestaña por completo en vez de
  // mostrarla vacía.
  if (program.planteles?.length) {
    const matched = program.planteles
      .map((name) => (plantelesDirectory || []).find((p) => p.name === name))
      .filter(Boolean);

    tabs.push({
      key: "planteles",
      label: "Planteles",
      content: matched.length
        ? `<div class="space-y-4">${matched.map(renderPlantelCard).join("")}</div>`
        : `<div class="flex flex-wrap gap-2">${program.planteles.map((p) => `<span class="text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-full">${escapeHTML(p)}</span>`).join("")}</div>`,
    });
  }

  return tabs;
}

// Tamaño del recuadro grande de la foto principal (el máximo que se
// muestra en pantalla). Varias de las fotos entregadas no tienen
// resolución suficiente para llenar este recuadro sin verse borrosas,
// sobre todo en pantallas de alta densidad (Retina/HiDPI), así que cada
// imagen se asigna a un tamaño (large/medium/small) según su resolución
// real, evitando el escalado hacia arriba.
const HERO_IMAGE_TIERS = {
  large: { containerClass: "w-full max-w-2xl h-80 md:h-96 rounded-xl shadow-lg", initialsClass: "text-6xl" },
  medium: { containerClass: "w-full max-w-xl h-64 md:h-72 rounded-xl shadow-lg", initialsClass: "text-5xl" },
  small: { containerClass: "w-full max-w-md h-56 md:h-64 rounded-xl shadow-lg", initialsClass: "text-4xl" },
};

// Clasificación por archivo (no por programa): varios programas comparten
// la misma foto, así que el tamaño depende de la imagen, no del id.
const HERO_IMAGE_SIZE_BY_FILE = {
  "assets/img/acuerdo_286_sep.jfif": "large",
  "assets/img/derecho_penal.webp": "large",
  "assets/img/ingenieria_industrial.webp": "large",
  "assets/img/licenciatura_administracion.jpg": "large",
  "assets/img/licenciatura_derecho.webp": "large",

  "assets/img/asistente_educativo.jpg": "medium",
  "assets/img/diseño_grafico.webp": "medium",
  "assets/img/educacion.jpg": "medium",

  "assets/img/computacion.jpg": "small",
  "assets/img/gastronomia.jpg": "small",
  "assets/img/mercadotecnia.webp": "small",
  "assets/img/pedagogia.jpg": "small",
  "assets/img/psicopedagogia.jfif": "small",
  "assets/img/puericultura.jpg": "small",
  "assets/img/turismo.jpg": "small",
};

function getHeroImageTier(imagePath) {
  const tier = HERO_IMAGE_SIZE_BY_FILE[imagePath] || "medium";
  return HERO_IMAGE_TIERS[tier];
}

function renderProgramaContent(program, level, levelLabel, plantelesDirectory) {
  const heroWrap = document.getElementById("programa-hero-wrap");
  const breadcrumbNivel = document.getElementById("programa-breadcrumb-nivel");
  const breadcrumbTitle = document.getElementById("programa-breadcrumb-title");
  const featuredBadge = document.getElementById("programa-featured-badge");
  const titleEl = document.getElementById("programa-title");
  const levelLabelEl = document.getElementById("programa-level-label");
  const ctaEl = document.getElementById("programa-cta");
  const tabsEl = document.getElementById("programa-tabs");
  const contentEl = document.getElementById("programa-tab-content");

  document.title = `${program.title} - Instituto Fleming`;

  if (heroWrap) {
    // Marco oscuro a todo el ancho (alineado con el resto del contenido)
    // para que la sección no se sienta vacía a los lados; la foto usa el
    // tamaño más grande que su resolución real permite sin verse borrosa
    // (ver HERO_IMAGE_TIERS). py-1: respiro mínimo arriba/abajo.
    const heroTier = getHeroImageTier(program.image);
    heroWrap.innerHTML = `
      <div class="w-full bg-brand-dark rounded-2xl py-1 flex items-center justify-center">
        ${renderMediaPlaceholder({
          src: program.image || "",
          alt: program.title,
          label: program.title,
          icon: program.icon,
          containerClass: heroTier.containerClass,
          initialsClass: heroTier.initialsClass,
        })}
      </div>
    `;
  }

  if (breadcrumbNivel) breadcrumbNivel.textContent = levelLabel;
  if (breadcrumbTitle) breadcrumbTitle.textContent = program.title || "";

  if (featuredBadge) {
    featuredBadge.innerHTML = program.featured
      ? `<span class="inline-block bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-full">Programa destacado</span>`
      : "";
  }

  if (titleEl) titleEl.textContent = program.title || "";
  if (levelLabelEl) levelLabelEl.textContent = levelLabel || "";

  if (ctaEl) {
    const ctaLabel = program.cta?.label || "Contáctanos";
    const preselect = program.cta?.preselect || program.id || "";
    ctaEl.setAttribute("href", `index.html?programa=${encodeURIComponent(preselect)}&nivel=${encodeURIComponent(level)}#lead-form`);
    ctaEl.innerHTML = `${escapeHTML(ctaLabel)} <span class="material-icons text-sm">arrow_forward</span>`;
  }

  if (!tabsEl || !contentEl) return;

  const tabs = renderProgramaTabsContent(program, plantelesDirectory);

  tabsEl.innerHTML = tabs.map((t, i) => `
    <button
      type="button"
      data-tab-trigger
      data-tab-key="${t.key}"
      role="tab"
      aria-selected="${i === 0}"
      class="${i === 0 ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}"
    >
      ${escapeHTML(t.label)}
    </button>
  `).join("");

  const showTab = (key) => {
    const tab = tabs.find((t) => t.key === key);
    if (!tab) return;
    contentEl.innerHTML = tab.content;

    tabsEl.querySelectorAll("[data-tab-trigger]").forEach((btn) => {
      const isActive = btn.dataset.tabKey === key;
      btn.setAttribute("aria-selected", String(isActive));
      btn.className = isActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS;
    });
  };

  tabsEl.querySelectorAll("[data-tab-trigger]").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tabKey));
  });

  showTab(tabs[0].key);
}

function renderProgramaNotFound() {
  const titleEl = document.getElementById("programa-title");
  const tabsEl = document.getElementById("programa-tabs");
  const contentEl = document.getElementById("programa-tab-content");
  const heroWrap = document.getElementById("programa-hero-wrap");

  if (heroWrap) heroWrap.innerHTML = "";
  if (titleEl) titleEl.textContent = "Programa no encontrado";
  if (tabsEl) tabsEl.innerHTML = "";
  if (contentEl) {
    contentEl.innerHTML = `<p class="text-sm text-secondary-text-light dark:text-secondary-text-dark">No pudimos encontrar la información de este programa. <a href="index.html" class="text-primary font-semibold hover:underline">Vuelve al inicio</a> para ver toda la oferta educativa.</p>`;
  }
}

export async function renderProgramaDetalle() {
  const tabsEl = document.getElementById("programa-tabs");
  if (!tabsEl) return;

  const nivel = document.body.dataset.nivel;
  const programaId = document.body.dataset.programaId;
  if (!nivel || !programaId) return;

  try {
    const [data, plantelesDirectory] = await Promise.all([
      fetchJSON(`data/oferta/${nivel}.json`),
      getPlantelesDirectory(),
    ]);
    const program = (data.programs || []).find((p) => p.id === programaId);

    if (!program) {
      renderProgramaNotFound();
      return;
    }

    renderProgramaContent(program, data.level || nivel, data.levelLabel || "", plantelesDirectory);
  } catch (err) {
    renderProgramaNotFound();
  }
}

export async function renderOferta() {
  const grid = document.getElementById("oferta-grid");
  if (!grid) return;

  bindOfertaModal();

  const data = await fetchJSON("data/oferta.json");
  grid.innerHTML = (data.items || []).map((item) => {
    const title = escapeHTML(item.title || "");
    const cta = escapeHTML(item.cta || "Conócelas");
    const image = escapeHTML(item.image || "");
    const level = escapeHTML(item.level || "");
    return `
      <button type="button" data-level="${level}" class="group bg-background-light dark:bg-gray-800 rounded-2xl overflow-hidden shadow-soft hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div class="h-48 overflow-hidden relative">
          <div class="absolute inset-0 bg-primary/20 group-hover:bg-primary/0 transition-colors z-10"></div>
          <img alt="${title}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" src="${image}" />
        </div>
        <div class="p-6 text-center">
          <h3 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">${title}</h3>
          <span class="inline-flex items-center justify-center px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-semibold group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all duration-300 dark:text-gray-300">
            ${cta} <span class="material-icons text-sm ml-1">chevron_right</span>
          </span>
        </div>
      </button>
    `;
  }).join("");

  grid.querySelectorAll("[data-level]").forEach((el) => {
    el.addEventListener("click", () => openOfertaDetalle(el.dataset.level));
  });
}

// --- Helpers genéricos de modal --------------------------------------

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("overflow-hidden");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overflow-hidden");
}

// Ata el cierre (botón/backdrop + tecla Escape) de un modal. Devuelve el
// elemento del modal, o null si el partial correspondiente no está en el DOM.
function bindModalDismiss(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return null;

  modal.querySelectorAll("[data-modal-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(modal));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal(modal);
  });

  return modal;
}

// --- Modal + accordion de detalle de oferta educativa (por nivel) -------

let ofertaModalBound = false;

function bindOfertaModal() {
  if (ofertaModalBound) return;
  if (!bindModalDismiss("oferta-modal")) return;
  ofertaModalBound = true;

  document.getElementById("oferta-modal-body")?.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-accordion-toggle]");
    if (toggle) {
      const panel = document.getElementById(toggle.getAttribute("aria-controls"));
      const expanded = toggle.getAttribute("aria-expanded") === "true";

      toggle.setAttribute("aria-expanded", String(!expanded));
      panel?.classList.toggle("hidden", expanded);
      toggle.querySelector("[data-accordion-chevron]")?.classList.toggle("rotate-180", !expanded);
      return;
    }

    // El CTA "Contáctanos" de cada programa apunta a index.html#lead-form.
    // Como este modal solo existe en index.html, seguir ese enlace como
    // navegación normal recarga la página entera (mismo path, distinto
    // query string) y el navegador intenta saltar al ancla #lead-form
    // ANTES de que main.js termine de inyectar los partials — el formulario
    // ni siquiera existe todavía en el DOM en ese momento, así que la
    // página se queda "recargando" sin llegar a ningún lado. En vez de
    // navegar, cerramos el modal y bajamos directo al formulario que ya
    // está en la misma página (sin recarga), y actualizamos la URL con
    // nivel/programa vía history.pushState para no perder esa información.
    const ctaLink = e.target.closest('a[href*="#lead-form"]');
    if (ctaLink) {
      e.preventDefault();
      closeModal(document.getElementById("oferta-modal"));

      const url = new URL(ctaLink.href, location.href);
      history.pushState(null, "", url.pathname + url.search + url.hash);

      document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function renderBulletList(items) {
  return `<ul class="space-y-1.5">${items.map((i) => `
    <li class="flex items-start gap-2 text-sm text-secondary-text-light dark:text-secondary-text-dark">
      <span class="material-icons text-primary text-base mt-0.5">check_circle</span>
      <span>${escapeHTML(i)}</span>
    </li>`).join("")}</ul>`;
}

function renderProgramAccordion(program, level, index) {
  const id = escapeHTML(program.id || `programa-${index}`);
  const panelId = `oferta-panel-${id}`;
  const title = escapeHTML(program.title || "");
  const description = escapeHTML(program.description || "");

  const featuredBadge = program.featured
    ? `<span class="inline-block bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-full mb-1.5">Programa destacado</span>`
    : "";

  const scheduleBlock = program.schedule?.length
    ? `<div><h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Modalidad y horarios</h4>${renderBulletList(program.schedule)}</div>`
    : "";

  const requiredDocsBlock = program.requiredDocuments?.length
    ? `<div><h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Documentos requeridos</h4>${renderBulletList(program.requiredDocuments)}</div>`
    : "";

  const benefitsBlock = program.benefits?.length
    ? `<div><h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Beneficios</h4>${renderBulletList(program.benefits)}</div>`
    : "";

  const officialDocsBlock = program.officialDocumentsObtained?.length
    ? `<div><h4 class="font-bold text-sm text-gray-900 dark:text-white mb-2">Documentos oficiales que obtendrás</h4>${renderBulletList(program.officialDocumentsObtained)}</div>`
    : "";

  const plantelesBlock = program.planteles?.length
    ? `<div class="flex flex-wrap gap-2">${program.planteles.map((p) => `
        <span class="text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full">${escapeHTML(p)}</span>
      `).join("")}</div>`
    : "";

  const externalLinkBlock = program.externalLink?.url
    ? `<a href="${escapeHTML(program.externalLink.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-sm font-semibold text-secondary hover:underline">
        ${escapeHTML(program.externalLink.label || "Más información")}
        <span class="material-icons text-sm">open_in_new</span>
      </a>`
    : "";

  const ctaLabel = escapeHTML(program.cta?.label || "Contáctanos");
  const preselect = escapeHTML(program.cta?.preselect || program.id || "");
  const ctaHref = `index.html?programa=${encodeURIComponent(preselect)}&nivel=${encodeURIComponent(level)}#lead-form`;

  return `
    <div class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        type="button"
        data-accordion-toggle
        aria-expanded="false"
        aria-controls="${panelId}"
        class="w-full flex items-center justify-between gap-4 p-4 text-left bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span class="flex flex-col">
          ${featuredBadge}
          <span class="font-bold text-gray-900 dark:text-white">${title}</span>
        </span>
        <span class="material-icons text-gray-400 transition-transform duration-300 flex-shrink-0" data-accordion-chevron>expand_more</span>
      </button>

      <div id="${panelId}" class="hidden p-5 space-y-5 bg-white dark:bg-surface-dark">
        ${renderMediaPlaceholder({
          src: program.image || "",
          alt: program.title,
          label: program.title,
          containerClass: "w-full h-40 rounded-lg",
        })}

        <p class="text-sm text-secondary-text-light dark:text-secondary-text-dark leading-relaxed">${description}</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          ${scheduleBlock}
          ${requiredDocsBlock}
          ${benefitsBlock}
          ${officialDocsBlock}
        </div>

        ${plantelesBlock}

        <div class="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <a href="${ctaHref}" class="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-full transition-colors">
            ${ctaLabel} <span class="material-icons text-sm">chevron_right</span>
          </a>
          ${externalLinkBlock}
        </div>
      </div>
    </div>
  `;
}

async function openOfertaDetalle(level) {
  const modal = document.getElementById("oferta-modal");
  const titleEl = document.getElementById("oferta-modal-title");
  const bodyEl = document.getElementById("oferta-modal-body");
  if (!modal || !titleEl || !bodyEl || !level) return;

  titleEl.textContent = "Oferta Educativa";
  bodyEl.innerHTML = `<p class="text-sm text-secondary-text-light dark:text-secondary-text-dark">Cargando programas…</p>`;
  openModal(modal);

  try {
    const data = await fetchJSON(`data/oferta/${level}.json`);
    titleEl.textContent = data.levelLabel || "Oferta Educativa";

    const programs = data.programs || [];
    bodyEl.innerHTML = programs.length
      ? `<div class="space-y-4">${programs.map((p, i) => renderProgramAccordion(p, data.level || level, i)).join("")}</div>`
      : `<p class="text-sm text-secondary-text-light dark:text-secondary-text-dark">Próximamente más información sobre este nivel.</p>`;
  } catch (err) {
    bodyEl.innerHTML = `<p class="text-sm text-red-500">No se pudo cargar la información de este nivel. Intenta de nuevo más tarde.</p>`;
  }
}

export async function renderPlanteles() {
  const grid = document.getElementById("planteles-grid");
  if (!grid) return;

  const data = await fetchJSON("data/planteles.json");
  grid.innerHTML = (data.items || []).map((p) => {
    const name = escapeHTML(p.name || "");
    const tag = escapeHTML(p.tag || "");
    const description = escapeHTML(p.description || "");
    const href = escapeHTML(p.href || "#");
    const cta = escapeHTML(p.cta || "Conoce más");
    const image = escapeHTML(p.image || "");
    return `
      <div class="group bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col h-full transform hover:-translate-y-2 border border-gray-100 dark:border-gray-700">
        <div class="h-64 overflow-hidden relative">
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-10"></div>
          <img alt="${name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="${image}" />
          <div class="absolute bottom-6 left-6 z-20 w-full pr-6">
            <h3 class="text-2xl font-bold text-white mb-2 shadow-sm">${name}</h3>
            <p class="text-sm text-gray-200 mb-4 line-clamp-2">${description}</p>
            <a href="${href}" target="_blank" rel="noopener noreferrer" class="inline-block bg-primary hover:bg-white hover:text-primary text-white text-sm font-bold py-2 px-6 rounded-full transition-colors duration-300">
              ${cta}
            </a>
          </div>
          ${tag ? `<div class="absolute top-4 right-4 z-20">
            <span class="inline-block bg-white/90 backdrop-blur-sm text-primary text-xs font-bold px-3 py-1 rounded-full shadow-sm">${tag}</span>
          </div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

export async function renderPromos() {
  const grid = document.getElementById("promo-grid");
  if (!grid) return;

  const data = await fetchJSON("data/promos.json");
  grid.innerHTML = (data.items || []).map((p) => {
    const title = safeTitleWithBr(p.title || "");
    const href = escapeHTML(p.href || "#");
    const icon = escapeHTML(p.icon || "star");
    const bg = escapeHTML(p.bg || "#000B4D");
    const hoverBg = escapeHTML(p.hoverBg || "#001590");

    return `
      <a class="promo-card group relative overflow-hidden rounded-md shadow-sm transition-all duration-300 hover:shadow-md h-16 flex items-center justify-start px-4"
         href="${href}"
         style="background:${bg}"
         data-bg="${bg}"
         data-hover="${hoverBg}">
        <div class="relative z-10 flex flex-row items-center justify-start text-left w-full h-full gap-3">
          <span class="material-icons text-2xl text-white/90 group-hover:scale-110 transition-transform duration-300 flex-shrink-0">${icon}</span>
          <h3 class="text-sm font-semibold text-white tracking-tight leading-tight">${title}</h3>
        </div>
        <div class="absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-white/10 to-transparent"></div>
      </a>
    `;
  }).join("");

  grid.querySelectorAll(".promo-card").forEach((el) => {
    el.addEventListener("mouseenter", () => (el.style.background = el.dataset.hover));
    el.addEventListener("mouseleave", () => (el.style.background = el.dataset.bg));
  });
}
