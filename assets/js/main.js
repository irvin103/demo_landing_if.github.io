import { renderOferta, renderPlanteles, renderPromos, renderDirectivos, renderOfertaNavMenu, renderProgramaDetalle, initComunidadDropdown } from "./render-sections.js";

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
  initReveal();

  await Promise.allSettled([
    renderPromos(),
    renderOferta(),
    renderPlanteles(),
    renderDirectivos(),
    renderOfertaNavMenu(),
    renderProgramaDetalle()
  ]);

  // Se hace hasta el final, cuando la página ya alcanzó su alto real: si se
  // hace antes de que las secciones dinámicas (promos, oferta, planteles,
  // directivos) terminen de insertarse, el salto usa una página todavía
  // "corta" y luego, al crecer el contenido de arriba, el formulario queda
  // más abajo de donde se hizo scroll — quedando pegado cerca del hero.
  scrollToHashTarget();
});