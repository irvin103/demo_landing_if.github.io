// Prueba funcional de backend/php/contacto.php servido por PHP real (Docker)
// contra el Resend falso. Ver backend/php/README.md, sección "Pruebas locales".
const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const PHP = `http://localhost:${process.argv[2] || 8091}/contacto.php`;
const MOCK = "http://localhost:8092";
const ORIGEN = "http://localhost:8080";

// `ip` simula la IP del visitante (config-prueba.php: IP_HEADER); sin ella
// cuenta la IP real de la conexión.
const post = (datos, { origen = ORIGEN, ip } = {}) =>
  fetch(PHP, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8", Origin: origen, ...(ip ? { "X-Prueba-IP": ip } : {}) },
    body: JSON.stringify(datos),
  });
const peticiones = async () => (await fetch(MOCK + "/peticiones")).json();
const modoResend = (modo) => fetch(`${MOCK}/${modo}`);
const enContenedor = (cmd) => execSync(`docker exec fleming-php ${cmd}`).toString();
const valido = (extra = {}) => ({
  nombre: "Ana Prueba", email: "ana@correo.com", telefono: "55 1234 5678",
  mensaje: "Me interesa <b>Derecho</b>", programa: "licenciatura-derecho",
  programaNombre: "Licenciatura en Derecho", nivel: "licenciaturas", pagina: "http://localhost:8080/index.html", ...extra,
});
const casos = [];
const caso = async (nombre, fn) => { await fn(); casos.push(nombre); };

(async () => {
  await caso("GET de salud", async () => {
    const r = await fetch(PHP);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, servicio: "formulario-fleming", configurado: true, limites: true });
  });

  await caso("Preflight CORS de origen permitido", async () => {
    const r = await fetch(PHP, { method: "OPTIONS", headers: { Origin: ORIGEN, "Access-Control-Request-Method": "POST" } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGEN);
  });

  await caso("Origen no permitido: 403", async () => {
    const r = await post(valido(), { origen: "https://sitio-ajeno.com" });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  });

  await caso("Envío válido llega a Resend con los datos correctos", async () => {
    const r = await post(valido());
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGEN);
    assert.deepEqual(await r.json(), { ok: true });
    const [p] = await peticiones();
    assert.equal(p.auth, "Bearer re_prueba_123");
    assert.match(p.idem, /^[a-f0-9]{64}$/);
    assert.deepEqual(p.body.to, ["inscripciones@institutofleming.edu.mx"]);
    assert.equal(p.body.reply_to, "ana@correo.com");
    assert.match(p.body.from, /formulario@institutofleming\.edu\.mx/);
    assert.match(p.body.subject, /Licenciatura en Derecho/);
    assert.ok(p.body.html.includes("&lt;b&gt;Derecho&lt;/b&gt;"), "HTML escapado");
    assert.ok(p.body.text.includes("Teléfono: 55 1234 5678"));
    assert.ok(p.body.text.includes("Página: http://localhost:8080/index.html"), "página del sitio se conserva");
  });

  await caso("Mismo correo antes de 60 s: 429 límite", async () => {
    const r = await post(valido());
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { ok: false, error: "limite" });
    assert.equal((await peticiones()).length, 1);
  });

  await caso("Validación del servidor (incluye caracteres no válidos en el teléfono)", async () => {
    const malos = [
      [{ email: "no-es-correo" }, "email"],
      [{ email: "b@c.mx", nombre: "A" }, "nombre"],
      [{ email: "c@c.mx", telefono: "123" }, "telefono"],
      [{ email: "d@c.mx", telefono: "=55 1234 5678 9" }, "telefono"],
      [{ email: "e@c.mx", telefono: "55 1234 5678 ext|1" }, "telefono"],
    ];
    for (const [extra, error] of malos) {
      const r = await post(valido(extra), { ip: "10.0.0.9" });
      assert.equal(r.status, 400);
      assert.deepEqual(await r.json(), { ok: false, error });
    }
  });

  await caso("JSON inválido: 400 formato", async () => {
    const r = await fetch(PHP, { method: "POST", headers: { Origin: ORIGEN }, body: "{no json" });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { ok: false, error: "formato" });
  });

  await caso("Campo trampa: ok sin enviar", async () => {
    const antes = (await peticiones()).length;
    const r = await post(valido({ email: "bot@spam.com", campo_extra: "ACME" }), { ip: "10.0.0.9" });
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal((await peticiones()).length, antes);
  });

  await caso("Saneado: página ajena se descarta, asunto sin saltos de línea, teléfono con +52", async () => {
    const r = await post(
      valido({
        email: "s@s.mx", nombre: '=HYPERLINK("x")', telefono: "+52 (55) 1234-5678",
        pagina: "https://sitio-falso.com/login", programaNombre: "Derecho\nBcc: otro@x.com",
      }),
      { ip: "10.0.0.2" }
    );
    assert.equal(r.status, 200);
    const p = (await peticiones()).at(-1).body;
    assert.ok(!p.subject.includes("\n"), "sin saltos en el asunto");
    assert.match(p.subject, /\(Derecho Bcc: otro@x\.com\)$/);
    assert.ok(p.text.includes("Página: (no indicada)"), "página ajena descartada");
    assert.ok(!p.html.includes("sitio-falso"));
  });

  await caso("Falla de Resend: 502 y el reintento no queda bloqueado", async () => {
    await modoResend("fallar");
    const r1 = await post(valido({ email: "falla@correo.com" }), { ip: "10.0.0.3" });
    assert.equal(r1.status, 502);
    assert.deepEqual(await r1.json(), { ok: false, error: "envio" });
    await modoResend("normal");
    const r2 = await post(valido({ email: "falla@correo.com" }), { ip: "10.0.0.3" });
    assert.equal(r2.status, 200, "tras una falla, reintentar debe funcionar");
  });

  await caso("Resend responde 200 sin id (p. ej. un proxy): se trata como falla", async () => {
    await modoResend("html");
    const r = await post(valido({ email: "html@correo.com" }), { ip: "10.0.0.4" });
    await modoResend("normal");
    assert.equal(r.status, 502);
  });

  await caso("Límite por IP: cuentan los intentos, también los fallidos", async () => {
    const ip = "10.0.0.5";
    await modoResend("fallar");
    assert.equal((await post(valido({ email: "i1@i.mx" }), { ip })).status, 502);
    await modoResend("normal");
    for (const n of [2, 3, 4, 5]) {
      assert.equal((await post(valido({ email: `i${n}@i.mx` }), { ip })).status, 200);
    }
    const r = await post(valido({ email: "i6@i.mx" }), { ip });
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { ok: false, error: "limite" });
    // Otra IP no se ve afectada.
    assert.equal((await post(valido({ email: "i7@i.mx" }), { ip: "10.0.0.6" })).status, 200);
  });

  await caso("CSV: privado (600), BOM, teléfono sin apóstrofo y fórmulas neutralizadas", async () => {
    assert.equal(enContenedor("stat -c %a /tmp/solicitudes.csv").trim(), "600");
    const csv = enContenedor("cat /tmp/solicitudes.csv");
    assert.ok(csv.startsWith("﻿Fecha,Nombre,"), "BOM y encabezado");
    const lineas = csv.trim().split("\n");
    assert.equal(lineas.filter((l) => l.includes("Fecha,Nombre,")).length, 1, "un solo encabezado");
    assert.ok(lineas.some((l) => l.includes(`"'=HYPERLINK(""x"")"`)), "fórmula neutralizada");
    assert.ok(lineas.some((l) => l.includes(`,"+52 (55) 1234-5678",`)), "teléfono tal cual");
    assert.ok(lineas.some((l) => l.includes("falla@correo.com")), "la solicitud fallida también quedó respaldada");
    assert.ok(!csv.includes("bot@spam.com"), "el campo trampa no escribe en el CSV");
  });

  await caso("Método no permitido: 405", async () => {
    const r = await fetch(PHP, { method: "PUT", headers: { Origin: ORIGEN } });
    assert.equal(r.status, 405);
  });

  await caso("Log de errores: registra lo importante, sin datos personales", async () => {
    const log = enContenedor("cat /tmp/errores.log");
    assert.match(log, /Origen no permitido: https:\/\/sitio-ajeno\.com/);
    assert.match(log, /Campo trampa activado/);
    assert.match(log, /Resend respondió 500: application_error/);
    assert.match(log, /Resend respondió 200: respuesta inesperada/);
    assert.ok(!/@(correo|i|s|spam)\.(com|mx)/.test(log), "sin correos de visitantes en el log");
  });

  console.log(`OK: ${casos.length} casos pasaron`);
  casos.forEach((c) => console.log("  ✓ " + c));
})().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
