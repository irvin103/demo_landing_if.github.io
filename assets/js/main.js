import { initLeadForm } from "./lead-form.js";
import { renderOferta, renderPlanteles, renderPromos, renderOfertaNavMenu, renderProgramaDetalle, initComunidadDropdown } from "./render-sections.js";

async function includePartials() {
  const nodes = document.querySelectorAll("[data-include]");

  await Promise.all(
    [...nodes].map(async (el) => {
      const file = el.getAttribute("data-include");
      if (!file) return;

      const res = await fetch(file, { cache: "no-cache" });
      if (!res.ok) {
        el.innerHTML = `<!-- Error cargando ${file}: ${res.status} -->`;
        return;
      }

      el.innerHTML = await res.text();
      el.removeAttribute("data-include");
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

// Como el contenido de la página se inyecta vía fetch (data-include), el
// salto nativo del navegador a un #ancla en la URL suele dispararse ANTES
// de que ese contenido exista en el DOM, así que no llega a ningún lado.
// Se reintenta el scroll a mano una vez que los partials ya están listos.
// Menú de navegación en móvil (el botón hamburguesa del nav, solo < md).
function initMobileMenu() {
  const toggle = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("mobile-menu");
  if (!toggle || !menu) return;

  const icon = toggle.querySelector(".material-icons");
  const setOpen = (open) => {
    menu.classList.toggle("hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    if (icon) icon.textContent = open ? "close" : "menu";
  };

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

// Activa la animación de entrada (.is-visible) de los elementos [data-reveal]
// cuando llegan al viewport. Sin IntersectionObserver se muestran de inmediato.
function initReveal() {
  const nodes = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.2 }
  );
  nodes.forEach((el) => observer.observe(el));
}

function scrollToHashTarget() {
  if (!location.hash) return;
  document.querySelector(location.hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.addEventListener("DOMContentLoaded", async () => {
  await includePartials();
  setActiveNavLink();
  initComunidadDropdown();
  initMobileMenu();
  initLeadForm();
  initReveal();

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