// Prueba funcional de backend/php/contacto.php servido por PHP real (Docker)
// contra el Resend falso. Ver backend/php/README.md, sección "Pruebas locales".
const assert = require("node:assert/strict");
const { execSync } = require("node:child_process");
const PHP = `http://localhost:${process.argv[2] || 8091}/contacto.php`;
const MOCK = "http://localhost:8092";
const ORIGEN = "http://localhost:8080";

const post = (datos, origen = ORIGEN) =>
  fetch(PHP, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8", Origin: origen }, body: JSON.stringify(datos) });
const peticiones = async () => (await fetch(MOCK + "/peticiones")).json();
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
    assert.deepEqual(await r.json(), { ok: true, servicio: "formulario-fleming", configurado: true });
  });

  await caso("Preflight CORS de origen permitido", async () => {
    const r = await fetch(PHP, { method: "OPTIONS", headers: { Origin: ORIGEN, "Access-Control-Request-Method": "POST" } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), ORIGEN);
  });

  await caso("Origen no permitido: 403", async () => {
    const r = await post(valido(), "https://sitio-ajeno.com");
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
  });

  await caso("Mismo correo antes de 60 s: 429 límite", async () => {
    const r = await post(valido());
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { ok: false, error: "limite" });
    assert.equal((await peticiones()).length, 1);
  });

  await caso("Validación del servidor", async () => {
    for (const [extra, error] of [[{ email: "no-es-correo" }, "email"], [{ email: "b@c.mx", nombre: "A" }, "nombre"], [{ email: "c@c.mx", telefono: "123" }, "telefono"]]) {
      const r = await post(valido(extra));
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
    const r = await post(valido({ email: "bot@spam.com", empresa: "ACME" }));
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal((await peticiones()).length, antes);
  });

  await caso("Falla de Resend: 502 y el reintento no queda bloqueado", async () => {
    await fetch(MOCK + "/fallar");
    const r1 = await post(valido({ email: "falla@correo.com" }));
    assert.equal(r1.status, 502);
    assert.deepEqual(await r1.json(), { ok: false, error: "envio" });
    await fetch(MOCK + "/normal");
    const r2 = await post(valido({ email: "falla@correo.com" }));
    assert.equal(r2.status, 200, "tras una falla, reintentar debe funcionar");
  });

  await caso("CSV: respaldo con protección contra fórmulas", async () => {
    await post(valido({ email: "f@f.mx", nombre: "=HYPERLINK(\"x\")" }));
    const csv = execSync(`docker exec fleming-php cat /tmp/solicitudes.csv`).toString();
    const lineas = csv.trim().split("\n");
    assert.match(lineas[0], /^Fecha,Nombre,/);
    assert.ok(lineas.some((l) => l.includes(`"'=HYPERLINK(""x"")"`)), "fórmula neutralizada");
    assert.ok(lineas.some((l) => l.includes("falla@correo.com")), "la solicitud fallida también quedó respaldada");
  });

  await caso("Límite por IP: 5 envíos en 10 min, el sexto se frena", async () => {
    // Ya van 3 envíos exitosos desde esta IP (ana, falla@ y f@).
    assert.equal((await post(valido({ email: "g4@g.mx" }))).status, 200);
    assert.equal((await post(valido({ email: "g5@g.mx" }))).status, 200);
    const r = await post(valido({ email: "g6@g.mx" }));
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { ok: false, error: "limite" });
  });

  await caso("Método no permitido: 405", async () => {
    const r = await fetch(PHP, { method: "PUT", headers: { Origin: ORIGEN } });
    assert.equal(r.status, 405);
  });

  console.log(`OK: ${casos.length} casos pasaron`);
  casos.forEach((c) => console.log("  ✓ " + c));
})().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
