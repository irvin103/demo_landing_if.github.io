// Pruebas locales de Code.gs con los servicios de Google simulados.
// Uso: node backend/apps-script/prueba.cjs
const assert = require("node:assert/strict");

const filas = [];
const correos = [];
const cache = new Map();

globalThis.CacheService = {
  getScriptCache: () => ({
    get: (k) => (cache.has(k) ? cache.get(k) : null),
    put: (k, v) => cache.set(k, v),
  }),
};
globalThis.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
globalThis.Utilities = { formatDate: () => "2026-10-12" };
globalThis.MailApp = { sendEmail: (opts) => correos.push(opts) };
globalThis.ContentService = {
  MimeType: { JSON: "json" },
  createTextOutput: (texto) => ({ setMimeType: () => ({ cuerpo: JSON.parse(texto) }) }),
};
const hoja = { appendRow: (fila) => filas.push(fila), setFrozenRows() {} };
globalThis.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => null, insertSheet: () => hoja }),
};
// El caso de JSON inválido registra el error a propósito; se silencia aquí.
console.error = () => {};

const gs = require("./Code.gs");
const post = (datos) => gs.doPost({ postData: { contents: JSON.stringify(datos) } }).cuerpo;
const valido = {
  nombre: "Ana Prueba",
  email: "ana@correo.com",
  telefono: "55 1234 5678",
  mensaje: "Me interesa <b>Derecho</b>",
  programa: "licenciatura-derecho",
  programaNombre: "Licenciatura en Derecho",
  nivel: "licenciaturas",
  pagina: "https://ejemplo/index.html",
};

// 1. Envío válido: guarda fila (con encabezados) y manda correo a inscripciones@.
assert.deepEqual(post(valido), { ok: true });
assert.equal(filas[0][0], "Fecha");
assert.equal(filas[1][1], "Ana Prueba");
assert.equal(correos.length, 1);
assert.equal(correos[0].to, "inscripciones@institutofleming.com");
assert.equal(correos[0].replyTo, "ana@correo.com");
assert.match(correos[0].subject, /Licenciatura en Derecho/);
assert.ok(correos[0].htmlBody.includes("&lt;b&gt;Derecho&lt;/b&gt;"), "el HTML del mensaje va escapado");

// 2. El mismo correo otra vez antes de 60 s: rechazado por límite.
assert.deepEqual(post(valido), { ok: false, error: "limite" });
assert.equal(correos.length, 1);

// 3. Validación del servidor.
assert.deepEqual(post({ ...valido, email: "no-es-correo" }), { ok: false, error: "email" });
assert.deepEqual(post({ ...valido, email: "b@c.mx", nombre: "A" }), { ok: false, error: "nombre" });
assert.deepEqual(post({ ...valido, email: "c@c.mx", telefono: "123" }), { ok: false, error: "telefono" });

// 4. Campo trampa: responde ok pero no guarda ni envía.
const antes = [filas.length, correos.length];
assert.deepEqual(post({ ...valido, email: "bot@spam.com", empresa: "ACME" }), { ok: true });
assert.deepEqual([filas.length, correos.length], antes);

// 5. Inyección de fórmulas en la hoja y recorte de longitudes.
post({ ...valido, email: "d@d.mx", nombre: "=HYPERLINK(\"x\")", mensaje: "x".repeat(5000) });
const ultima = filas[filas.length - 1];
assert.equal(ultima[1], "'=HYPERLINK(\"x\")");
assert.equal(ultima[6].length, 3000);

// 6. JSON inválido: error controlado.
assert.deepEqual(gs.doPost({ postData: { contents: "{no json" } }).cuerpo, { ok: false, error: "interno" });

// 7. Health check.
assert.deepEqual(gs.doGet().cuerpo, { ok: true, servicio: "formulario-fleming" });

console.log("OK: 7 grupos de pruebas pasaron");
