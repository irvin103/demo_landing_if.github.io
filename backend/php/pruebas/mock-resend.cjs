// Resend falso: guarda cada petición y responde 200, o 500 si se activa /fallar.
const http = require("node:http");
const peticiones = [];
let fallar = false;
http.createServer((req, res) => {
  if (req.url === "/peticiones") { res.end(JSON.stringify(peticiones)); return; }
  if (req.url === "/fallar") { fallar = true; res.end("ok"); return; }
  if (req.url === "/normal") { fallar = false; res.end("ok"); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    peticiones.push({ auth: req.headers.authorization, idem: req.headers["idempotency-key"], body: JSON.parse(body || "{}") });
    res.writeHead(fallar ? 500 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(fallar ? { statusCode: 500, message: "falla simulada" } : { id: "email_" + peticiones.length }));
  });
}).listen(8092, () => console.log("mock resend en 8092"));
