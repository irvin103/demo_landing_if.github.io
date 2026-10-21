import { initLeadForm } from "./lead-form.js";
import { initAvisoPrivacidad } from "./aviso-privacidad.js";
import { renderOferta, renderPlanteles, renderPromos, renderOfertaNavMenu, renderProgramaDetalle, initComunidadDropdown } from "./render-sections.js";

async function includePartials() {
  const nodes = document.querySelectorAll("[data-include]");

  await Promise.all(
    [...nodes].map(async (el) => {
      const file = el.getAttribute("data-include");
      if (!file) return;

      // Cada parcial falla por separado: uno que no cargue no debe impedir
      // que el resto de la página (y sus scripts) arranque.
      try {
        const res = await fetch(file, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        el.innerHTML = await res.text();
        el.removeAttribute("data-include");
      } catch (err) {
        console.error(`No se pudo cargar ${file}:`, err);
        el.innerHTML = `<!-- Error cargando ${file} -->`;
      }
    })
  );
}

// Clases Tailwind completas (no solo un modificador) para evitar que queden
// clases de ambos estados mezcladas en el mismo enlace.
const NAV_LINK_ACTIVE_CLASS =
  "relative font-semibold text-primary after:content-[''] after:absolute after:left-0 after:-bottom-7 after:w-full after:h-1 after:bg-primary";
const NAV_LINK_INACTIVE_CLASS =
  "font-medium text-secondary-text-light dark:text-secondary-text-dark hover:text-primary dark:hover:text-primary transition-colors";

function setActiveNavLink() {
  const current = location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll("[data-nav-link]").forEach((link) => {
    const isActive = link.getAttribute("href") === current;
    link.className = isActive ? NAV_LINK_ACTIVE_CLASS : NAV_LINK_INACTIVE_CLASS;
  });
}

// Menú de navegación en móvil (el botón hamburguesa del nav, solo < md).
// El estado lo anuncia aria-expanded; la etiqueta del botón no cambia.
function initMobileMenu() {
  const toggle = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("mobile-menu");
  if (!toggle || !menu) return;

  const icon = toggle.querySelector(".material-icons");
  const setOpen = (open) => {
    menu.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
    if (icon) icon.textContent = open ? "close" : "menu";
  };
  // Al pasar a escritorio el menú móvil se oculta por CSS; se cierra también
  // aquí para que aria-expanded no quede desactualizado.
  window.matchMedia("(min-width: 768px)").addEventListener("change", (e) => {
    if (e.matches) setOpen(false);
  });

  toggle.addEventListener("click", () => setOpen(menu.classList.contains("hidden")));
  // Al elegir un enlace (incluidos los #ancla de la misma página) se cierra.
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.classList.contains("hidden")) {
      setOpen(false);
      toggle.focus();
    }
  });
}

// Numera los hijos de un [data-reveal-stagger] para escalonar su entrada
// (ver styles.css). Se vuelve a llamar cuando llegan hijos nuevos, p. ej. las
// tarjetas que se pintan desde los JSON después de cargar la página.
function indexStaggerChildren(container) {
  [...container.children].forEach((child, i) => child.style.setProperty("--reveal-i", String(i)));
}

// Cuenta de 0 a la cifra final ("+3042", "+3,000", "14"), una sola vez. Si
// el texto no es una cifra, o se prefiere menos movimiento, no hace nada.
function parseCounter(text) {
  const match = text.match(/^(\D*)([\d,]+)(\D*)$/);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  const withCommas = digits.includes(",");
  return {
    target: Number(digits.replace(/,/g, "")),
    format: (n) => prefix + (withCommas ? n.toLocaleString("en-US") : String(n)) + suffix,
  };
}

// Antes de que el contador entre en pantalla se muestra en 0, para que no
// salte de la cifra final a 0 al arrancar. La cifra real queda en
// data-countup-final (y en el HTML, para buscadores y sin JavaScript).
function prepareCounter(el) {
  const original = el.textContent.trim();
  const counter = parseCounter(original);
  // También con "reducir movimiento": un número que cambia no es desplazamiento.
  if (!counter) return false;
  el.dataset.countupFinal = original;
  el.textContent = counter.format(0);
  return true;
}

function countUp(el) {
  const original = el.dataset.countupFinal;
  const counter = original && parseCounter(original);
  if (!counter) return;

  const { target, format } = counter;
  const duration = 1400;
  const start = performance.now();

  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(2, -10 * t); // ease-out-expo
    el.textContent = t < 1 ? format(Math.round(target * eased)) : original;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Animaciones de entrada: marca con .is-visible los [data-reveal] y
// [data-reveal-stagger] cuando llegan al viewport (una sola vez) y arranca
// el conteo de los [data-countup]. Sin IntersectionObserver todo se muestra.
function initReveal() {
  const revealNodes = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");

  document.querySelectorAll("[data-reveal-stagger]").forEach((container) => {
    indexStaggerChildren(container);
    new MutationObserver(() => indexStaggerChildren(container)).observe(container, { childList: true });
  });

  if (!("IntersectionObserver" in window)) {
    revealNodes.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  // A partir de aquí el CSS oculta lo que todavía no entra en pantalla (ver
  // styles.css); sin esta clase todo se ve normal.
  document.documentElement.classList.add("js-reveal");
  const counters = [...document.querySelectorAll("[data-countup]")].filter(prepareCounter);

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  revealNodes.forEach((el) => revealObserver.observe(el));

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counterObserver.unobserve(entry.target);
        countUp(entry.target);
      });
    },
    { threshold: 0.6 }
  );
  counters.forEach((el) => counterObserver.observe(el));
}

// Como el contenido de la página se inyecta vía fetch (data-include), el
// salto nativo del navegador a un #ancla en la URL suele dispararse ANTES
// de que ese contenido exista en el DOM, así que no llega a ningún lado.
// Se reintenta el scroll a mano una vez que los partials ya están listos.
function scrollToHashTarget() {
  if (!location.hash) return;
  let id = location.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // Hash mal codificado: se usa tal cual.
  }
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Un error en una parte no debe dejar sin arrancar a las demás (p. ej., sin
// initReveal el contenido animado se quedaría oculto).
function safely(fn) {
  try {
    fn();
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await includePartials();
  safely(initReveal);
  safely(setActiveNavLink);
  safely(initComunidadDropdown);
  safely(initMobileMenu);
  safely(initLeadForm);
  safely(initAvisoPrivacidad);

  await Promise.allSettled([
    renderPromos(),
    renderOferta(),
    renderPlanteles(),
    renderOfertaNavMenu(),
    renderProgramaDetalle()
  ]);

  // Se hace hasta el final, cuando la página ya alcanzó su alto real: si se
  // hace antes de que las secciones dinámicas (promos, oferta, planteles)
  // terminen de insertarse, el salto usa una página todavía "corta" y luego, al crecer el contenido de arriba, el formulario queda
  // más abajo de donde se hizo scroll — quedando pegado cerca del hero.
  scrollToHashTarget();
});