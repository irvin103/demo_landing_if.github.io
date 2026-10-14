// Aviso de privacidad en un modal (versión resumida).
//
// Los enlaces con [data-aviso-privacidad] (footer y casilla del formulario)
// apuntan al PDF del aviso integral; con JavaScript se abre en su lugar este
// modal, cuyo contenido vive en partials/aviso-privacidad.html y se carga la
// primera vez que se abre. Si esa carga falla, se sigue al PDF.
//
// Se usa <dialog> nativo: Esc para cerrar, foco atrapado dentro y regreso del
// foco al enlace que lo abrió, sin código extra.

const CONTENIDO = "partials/aviso-privacidad.html";

// Promesa compartida: dos clics seguidos no crean dos modales.
let dialogo = null;

async function crearDialogo() {
  const res = await fetch(CONTENIDO, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const d = document.createElement("dialog");
  d.id = "aviso-privacidad";
  d.className = "aviso-dialogo bg-surface-light dark:bg-surface-dark text-gray-900 dark:text-white rounded-3xl shadow-xl p-0";
  d.setAttribute("aria-labelledby", "aviso-privacidad-titulo");
  d.innerHTML = await res.text();

  d.addEventListener("click", (e) => {
    // Clic en un botón de cerrar, o fuera de la caja (en el fondo oscuro).
    if (e.target.closest("[data-cerrar-aviso]") || e.target === d) d.close();
  });
  document.body.append(d);
  return d;
}

export function initAvisoPrivacidad() {
  document.addEventListener("click", async (e) => {
    const enlace = e.target.closest("a[data-aviso-privacidad]");
    if (!enlace || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    try {
      dialogo ??= crearDialogo();
      const d = await dialogo;
      d.showModal();
      d.querySelector(".aviso-cuerpo")?.scrollTo(0, 0);
    } catch (err) {
      dialogo = null; // se reintenta en el siguiente clic
      console.error("No se pudo abrir el aviso de privacidad:", err);
      location.href = enlace.href;
    }
  });
}
