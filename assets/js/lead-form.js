// Formulario "Resuelve tus dudas" (partials/lead-form.html).
//
// Envío: si FORM_CONFIG.endpoint tiene una URL (p. ej. el webhook de un flujo
// de n8n que reenvía el correo a inscripciones@), se manda ahí como JSON. Si
// está vacío —o el envío falla— se abre la app de correo del visitante con el
// mensaje ya escrito para FORM_CONFIG.destinatario, así el formulario siempre
// tiene una forma de llegar al instituto aunque todavía no haya backend.
//
// Programa de interés: las páginas de programa enlazan a
// index.html?programa=<id>&nivel=<nivel>#lead-form; aquí se lee esa URL y se
// precarga el mensaje. El modal de oferta cambia la URL con pushState sin
// recargar, y avisa con el evento "leadform:programa".

const FORM_CONFIG = {
  // URL del webhook que recibe el formulario (POST JSON). Vacío = solo correo.
  endpoint: "",
  destinatario: "inscripciones@institutofleming.com",
  asunto: "Solicitud de información desde el sitio web",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function nombrePrograma(id, nivel) {
  if (!id || !nivel || !/^[a-z0-9-]+$/i.test(nivel)) return "";
  try {
    const res = await fetch(`data/oferta/${nivel}.json`, { cache: "no-cache" });
    if (!res.ok) return "";
    const data = await res.json();
    const p = (data.programs || []).find((x) => x.id === id || x.cta?.preselect === id);
    return p?.title || "";
  } catch {
    return "";
  }
}

function setError(input, mensaje) {
  const err = input.closest("[data-field]")?.querySelector("[data-error]");
  input.setAttribute("aria-invalid", mensaje ? "true" : "false");
  if (err) {
    err.textContent = mensaje;
    err.hidden = !mensaje;
  }
}

// Devuelve los campos con error, en orden, para enfocar el primero.
function validar(form) {
  const { nombre, telefono, email, consentimiento } = form.elements;
  const errores = [];
  const check = (input, ok, msg) => {
    setError(input, ok ? "" : msg);
    if (!ok) errores.push(input);
  };

  check(nombre, nombre.value.trim().length >= 2, "Escribe tu nombre.");
  const digitos = telefono.value.replace(/\D/g, "");
  check(telefono, digitos.length === 0 || digitos.length >= 10, "Escribe un teléfono de 10 dígitos.");
  check(email, EMAIL_RE.test(email.value.trim()), "Escribe un correo válido, por ejemplo nombre@correo.com.");
  check(consentimiento, consentimiento.checked, "Necesitamos tu autorización para contactarte.");
  return errores;
}

function datosDe(form) {
  const f = form.elements;
  return {
    nombre: f.nombre.value.trim(),
    telefono: f.telefono.value.trim(),
    email: f.email.value.trim(),
    mensaje: f.mensaje.value.trim(),
    programa: f.programa.value,
    programaNombre: form.dataset.programaNombre || "",
    nivel: f.nivel.value,
    pagina: location.href,
    fecha: new Date().toISOString(),
  };
}

function abrirCorreo(d) {
  const encabezado = [`Nombre: ${d.nombre}`, `Correo: ${d.email}`];
  if (d.telefono) encabezado.push(`Teléfono: ${d.telefono}`);
  if (d.programa) encabezado.push(`Programa de interés: ${d.programaNombre || d.programa}`);
  const body = `${encabezado.join("\n")}\n\n${d.mensaje || "Quiero más información, contáctenme."}`;
  location.href = `mailto:${FORM_CONFIG.destinatario}?subject=${encodeURIComponent(FORM_CONFIG.asunto)}&body=${encodeURIComponent(body)}`;
}

function mostrarEstado(form, tipo, texto) {
  const box = form.querySelector("[data-status]");
  if (!box) return;
  box.dataset.status = tipo;
  box.textContent = texto;
  box.hidden = false;
}

async function aplicarProgramaDeUrl(form) {
  const params = new URLSearchParams(location.search);
  const id = params.get("programa") || "";
  const nivel = params.get("nivel") || "";
  form.elements.programa.value = id;
  form.elements.nivel.value = nivel;
  if (!id) return;

  const nombre = await nombrePrograma(id, nivel);
  form.dataset.programaNombre = nombre;
  const mensaje = form.elements.mensaje;
  // Solo se precarga si la persona no ha escrito nada propio.
  if (!mensaje.value.trim() || mensaje.dataset.autollenado === "true") {
    mensaje.value = `Me interesa ${nombre || "este programa"}. Quiero más información.`;
    mensaje.dataset.autollenado = "true";
  }
}

export function initLeadForm() {
  const form = document.getElementById("lead-form-el");
  if (!form) return;

  aplicarProgramaDeUrl(form);
  window.addEventListener("leadform:programa", () => aplicarProgramaDeUrl(form));
  window.addEventListener("popstate", () => aplicarProgramaDeUrl(form));

  form.elements.mensaje.addEventListener("input", (e) => {
    e.target.dataset.autollenado = "false";
  });
  // Limpia el error de un campo en cuanto se corrige.
  form.addEventListener("input", (e) => {
    if (e.target.getAttribute("aria-invalid") === "true") setError(e.target, "");
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "consentimiento" && e.target.checked) setError(e.target, "");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Campo trampa: las personas no lo ven; si trae algo, es un bot.
    if (form.elements.empresa.value) return;

    const errores = validar(form);
    if (errores.length) {
      errores[0].focus();
      mostrarEstado(form, "error", "Revisa los campos marcados.");
      return;
    }

    const datos = datosDe(form);

    if (!FORM_CONFIG.endpoint) {
      abrirCorreo(datos);
      mostrarEstado(
        form,
        "info",
        `Abrimos tu app de correo con el mensaje listo para ${FORM_CONFIG.destinatario}. Solo falta que lo envíes.`
      );
      return;
    }

    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    mostrarEstado(form, "info", "Enviando…");
    try {
      const res = await fetch(FORM_CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      form.elements.mensaje.dataset.autollenado = "false";
      mostrarEstado(form, "ok", "¡Gracias! Recibimos tu mensaje y te contactaremos pronto.");
    } catch {
      mostrarEstado(
        form,
        "error",
        `No pudimos enviar tu mensaje. Abrimos tu app de correo para que lo mandes a ${FORM_CONFIG.destinatario}.`
      );
      abrirCorreo(datos);
    } finally {
      boton.disabled = false;
    }
  });
}
