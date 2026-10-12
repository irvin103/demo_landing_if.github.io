/**
 * Backend del formulario "Resuelve tus dudas" del sitio del Instituto Fleming.
 *
 * Google Apps Script vinculado a una hoja de cálculo y publicado como
 * aplicación web. Recibe el POST del formulario (assets/js/lead-form.js),
 * guarda cada solicitud en la hoja y manda un correo a CONFIG.DESTINATARIO.
 * Guardar en la hoja va primero: aunque el correo no llegue, la solicitud
 * queda registrada.
 *
 * Instalación y despliegue: ver README.md en esta misma carpeta.
 */

const CONFIG = {
  DESTINATARIO: "inscripciones@institutofleming.com",
  ASUNTO: "Nueva solicitud de información desde el sitio web",
  NOMBRE_REMITENTE: "Sitio web Instituto Fleming",
  HOJA: "Solicitudes",
  // Correo de acuse para la persona que escribe. Apagado hasta que el
  // instituto apruebe el texto.
  RESPUESTA_AUTOMATICA: false,
  // Anti-abuso: un mensaje por correo cada N segundos y un tope diario.
  SEGUNDOS_ENTRE_MENSAJES: 60,
  LIMITE_DIARIO: 200,
};

// Campos aceptados y su longitud máxima; cualquier otro se ignora.
const CAMPOS = {
  nombre: 120,
  telefono: 30,
  email: 160,
  mensaje: 3000,
  programa: 120,
  programaNombre: 200,
  nivel: 60,
  pagina: 500,
  empresa: 200, // campo trampa para bots
};

const ENCABEZADOS = ["Fecha", "Nombre", "Teléfono", "Correo", "Programa", "Nivel", "Mensaje", "Página"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function doPost(e) {
  try {
    const datos = limpiar_(JSON.parse((e && e.postData && e.postData.contents) || "{}"));
    // Un bot llenó el campo trampa: se responde "ok" sin hacer nada.
    if (datos.empresa) return respuesta_({ ok: true });

    const error = validar_(datos);
    if (error) return respuesta_({ ok: false, error: error });
    if (!dentroDeLimites_(datos.email)) return respuesta_({ ok: false, error: "limite" });

    guardarEnHoja_(datos);
    enviarCorreo_(datos);
    if (CONFIG.RESPUESTA_AUTOMATICA) responderAlInteresado_(datos);
    return respuesta_({ ok: true });
  } catch (err) {
    console.error(err);
    return respuesta_({ ok: false, error: "interno" });
  }
}

// Para comprobar en el navegador que el despliegue responde.
function doGet() {
  return respuesta_({ ok: true, servicio: "formulario-fleming" });
}

function limpiar_(entrada) {
  const datos = {};
  Object.keys(CAMPOS).forEach(function (campo) {
    const valor = entrada && entrada[campo] != null ? String(entrada[campo]) : "";
    datos[campo] = valor.trim().slice(0, CAMPOS[campo]);
  });
  return datos;
}

function validar_(d) {
  if (d.nombre.length < 2) return "nombre";
  if (!EMAIL_RE.test(d.email)) return "email";
  const digitos = d.telefono.replace(/\D/g, "");
  if (digitos.length > 0 && digitos.length < 10) return "telefono";
  return "";
}

function dentroDeLimites_(email) {
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const claveCorreo = "correo:" + email.toLowerCase();
    if (cache.get(claveCorreo)) return false;

    const claveDia = "dia:" + Utilities.formatDate(new Date(), "America/Mexico_City", "yyyy-MM-dd");
    const enviados = Number(cache.get(claveDia) || 0);
    if (enviados >= CONFIG.LIMITE_DIARIO) return false;

    cache.put(claveCorreo, "1", CONFIG.SEGUNDOS_ENTRE_MENSAJES);
    cache.put(claveDia, String(enviados + 1), 21600);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// Evita que un texto que empieza con =, +, - o @ se interprete como fórmula
// al abrir la hoja (inyección de fórmulas).
function celdaSegura_(valor) {
  return /^[=+\-@]/.test(valor) ? "'" + valor : valor;
}

function guardarEnHoja_(d) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(CONFIG.HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(CONFIG.HOJA);
    hoja.appendRow(ENCABEZADOS);
    hoja.setFrozenRows(1);
  }
  hoja.appendRow(
    [new Date(), d.nombre, d.telefono, d.email, d.programaNombre || d.programa, d.nivel, d.mensaje, d.pagina].map(
      function (v) {
        return typeof v === "string" ? celdaSegura_(v) : v;
      }
    )
  );
}

function escaparHtml_(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cuerpoCorreo_(d) {
  const filas = [
    ["Nombre", d.nombre],
    ["Correo", d.email],
    ["Teléfono", d.telefono || "(no lo dejó)"],
    ["Programa de interés", d.programaNombre || d.programa || "(no indicó)"],
    ["Página", d.pagina],
  ];
  const mensaje = d.mensaje || "Quiero más información, contáctenme.";
  const texto =
    filas.map(function (f) { return f[0] + ": " + f[1]; }).join("\n") +
    "\n\nMensaje:\n" + mensaje +
    "\n\nResponde a este correo para contestarle directamente.";
  const html =
    '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    filas.map(function (f) {
      return '<tr><td style="padding:4px 12px 4px 0;color:#555"><b>' + escaparHtml_(f[0]) +
        '</b></td><td style="padding:4px 0">' + escaparHtml_(f[1]) + "</td></tr>";
    }).join("") +
    "</table>" +
    '<p style="font-family:Arial,sans-serif;font-size:14px"><b>Mensaje:</b><br>' +
    escaparHtml_(mensaje).replace(/\n/g, "<br>") + "</p>" +
    '<p style="font-family:Arial,sans-serif;font-size:12px;color:#777">Responde a este correo para contestarle directamente.</p>';
  return { texto: texto, html: html };
}

function enviarCorreo_(d) {
  const cuerpo = cuerpoCorreo_(d);
  const programa = d.programaNombre || d.programa;
  MailApp.sendEmail({
    to: CONFIG.DESTINATARIO,
    subject: CONFIG.ASUNTO + (programa ? " (" + programa + ")" : ""),
    name: CONFIG.NOMBRE_REMITENTE,
    replyTo: d.email,
    body: cuerpo.texto,
    htmlBody: cuerpo.html,
  });
}

function responderAlInteresado_(d) {
  MailApp.sendEmail({
    to: d.email,
    subject: "Recibimos tu mensaje, Instituto Fleming",
    name: "Instituto Fleming",
    replyTo: CONFIG.DESTINATARIO,
    body:
      "Hola " + d.nombre + ",\n\nGracias por escribirnos. Recibimos tu mensaje y te contactaremos pronto.\n\n" +
      "Instituto Fleming",
  });
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Solo para las pruebas locales con Node (Apps Script no define `module`).
if (typeof module !== "undefined") {
  module.exports = { CONFIG, doPost, doGet, limpiar_, validar_, celdaSegura_, cuerpoCorreo_, escaparHtml_ };
}
