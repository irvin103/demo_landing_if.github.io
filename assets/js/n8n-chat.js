// Widget de chat (@n8n/chat) + botón propio con la mascota de Fleming.
//
// La versión de @n8n/chat va fijada aquí y en el <link> de su CSS en cada
// página, para que una publicación nueva del paquete no cambie el chat sin
// aviso. Para actualizarla, cambiar ambas URLs juntas.
import { createChat } from "https://cdn.jsdelivr.net/npm/@n8n/chat@1.40.1/dist/chat.bundle.es.js";

// Webhook del flujo de n8n. El túnel de ngrok es temporal: reemplazar por la
// URL estable del servidor de n8n en cuanto exista.
const WEBHOOK_URL = "https://shadowlike-braylee-alodially.ngrok-free.dev/webhook/9a55f887-fab9-4f2c-ad56-890682e0108f/chat";

// Imagen de la mascota. Mientras no exista el archivo se muestra un ícono de
// respaldo; al colocar la imagen en esta ruta aparece sin tocar código.
const MASCOTA_SRC = "assets/img/mascota.webp";
// Versión animada (voltea a los lados y mira de reojo). Con "reducir
// movimiento" el navegador usa la fija.
const MASCOTA_ANIMADA_SRC = "assets/img/mascota-animada.webp";
const BUBBLE_TEXT = "¿En qué puedo ayudarte?";
// El globo se presenta en cada carga de página; abrir el chat o cerrarlo con
// la X solo lo esconde mientras se está en esa página.
const BUBBLE_DELAY_MS = 1800;
// Debe coincidir con la media query de la mascota compacta en styles.css.
const PANTALLA_BAJA = "(max-height: 599px)";

createChat({
  webhookUrl: WEBHOOK_URL,
  webhookConfig: { method: "POST", headers: {} },
  target: "#n8n-chat",
  mode: "window",
  chatInputKey: "chatInput",
  chatSessionKey: "sessionId",
  loadPreviousSession: true,
  metadata: {},
  showWelcomeScreen: false,
  defaultLanguage: "es",
  initialMessages: [
    "¡Hola! 👋",
    "Soy el asistente virtual del Instituto Fleming. ¿En qué te puedo ayudar?",
  ],
  i18n: {
    es: {
      title: "Asistente Fleming 👋",
      subtitle: "Resolvemos tus dudas 24/7.",
      footer: "",
      getStarted: "Nueva conversación",
      inputPlaceholder: "Escribe tu pregunta…",
    },
  },
  enableStreaming: false,
});

// El widget crea su propio botón (un <div>, sin soporte de teclado). Se oculta
// por CSS y este botón lo acciona; la ventana del chat sigue siendo la de n8n.
function initLauncher() {
  const launcher = document.createElement("div");
  launcher.className = "chat-launcher";
  launcher.innerHTML = `
    <div class="chat-launcher__bubble" role="status" hidden>
      <span>${BUBBLE_TEXT}</span>
      <button type="button" class="chat-launcher__bubble-close" aria-label="Cerrar mensaje">
        <span class="material-icons" aria-hidden="true">close</span>
      </button>
    </div>
    <button type="button" class="chat-launcher__button" aria-label="Abrir el chat con el asistente de Fleming" aria-expanded="false">
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcset="${MASCOTA_SRC}" />
        <img class="chat-launcher__mascota" src="${MASCOTA_ANIMADA_SRC}" alt="" width="96" height="96" />
      </picture>
      <span class="chat-launcher__fallback material-icons" aria-hidden="true">support_agent</span>
    </button>
  `;
  document.body.append(launcher);

  const button = launcher.querySelector(".chat-launcher__button");
  const bubble = launcher.querySelector(".chat-launcher__bubble");
  const img = launcher.querySelector(".chat-launcher__mascota");

  const conMascota = () => launcher.classList.add("has-mascota");
  img.addEventListener("load", conMascota);
  img.addEventListener("error", () => img.remove());
  if (img.complete && img.naturalWidth) conMascota();

  const ocultarBubble = () => {
    bubble.hidden = true;
  };

  const chatAbierto = () => {
    const win = document.querySelector("#n8n-chat .chat-window");
    return !!win && getComputedStyle(win).display !== "none";
  };

  const sincronizar = () => {
    const abierto = chatAbierto();
    button.setAttribute("aria-expanded", String(abierto));
    button.setAttribute("aria-label", abierto ? "Cerrar el chat" : "Abrir el chat con el asistente de Fleming");
    launcher.classList.toggle("is-open", abierto);
    if (abierto && !bubble.hidden) ocultarBubble();
  };

  button.addEventListener("click", () => {
    const toggle = document.querySelector("#n8n-chat .chat-window-toggle");
    if (!toggle) return;
    toggle.click();
    // La ventana se muestra u oculta en el siguiente frame del widget.
    requestAnimationFrame(() => requestAnimationFrame(sincronizar));
  });

  launcher.querySelector(".chat-launcher__bubble-close").addEventListener("click", ocultarBubble);

  // Si el widget abre o cierra la ventana por su cuenta (botón de cerrar del
  // encabezado), se refleja en el botón propio.
  new MutationObserver(sincronizar).observe(document.getElementById("n8n-chat"), {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  const mostrarBubble = () => {
    if (!chatAbierto()) bubble.hidden = false;
  };
  setTimeout(() => {
    // En pantallas bajas (celulares chicos o en horizontal) el globo taparía
    // el botón principal del hero: espera a que la persona baje un poco.
    if (window.matchMedia(PANTALLA_BAJA).matches && window.scrollY < 120) {
      const alBajar = () => {
        if (window.scrollY < 120) return;
        window.removeEventListener("scroll", alBajar);
        if (!launcher.classList.contains("is-open")) mostrarBubble();
      };
      window.addEventListener("scroll", alBajar, { passive: true });
      return;
    }
    mostrarBubble();
  }, BUBBLE_DELAY_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLauncher);
} else {
  initLauncher();
}
