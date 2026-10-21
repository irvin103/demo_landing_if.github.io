// Resend falso: guarda cada petición y responde como Resend (200 con id).
// /fallar → responde 500; /html → responde 200 con una página HTML (sin id);
// /normal → vuelve a responder bien.
const http = require("node:http");
const peticiones = [];
let modo = "normal";
http.createServer((req, res) => {
  if (req.url === "/peticiones") { res.end(JSON.stringify(peticiones)); return; }
  if (["/fallar", "/html", "/normal"].includes(req.url)) { modo = req.url.slice(1); res.end("ok"); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    peticiones.push({ auth: req.headers.authorization, idem: req.headers["idempotency-key"], body: JSON.parse(body || "{}") });
    if (modo === "html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Proxy</body></html>");
      return;
    }
    res.writeHead(modo === "fallar" ? 500 : 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(modo === "fallar" ? { statusCode: 500, name: "application_error", message: "falla simulada" } : { id: "email_" + peticiones.length }));
  });
}).listen(8092, () => console.log("mock resend en 8092"));
