# Backend del formulario de contacto (PHP + Resend)

`contacto.php` recibe las solicitudes del formulario "Resuelve tus dudas" del sitio, las valida, guarda un respaldo en CSV y manda el correo a **inscripciones@institutofleming.edu.mx** a través de **[Resend](https://resend.com)**, con "Responder a" la persona interesada.

Vive en el hosting que el instituto ya paga en HostGator. Como el correo lo envía Resend (y no el servidor de HostGator), la mala reputación de envío del hosting compartido deja de afectar.

## Archivos

| Archivo | Para qué |
|---|---|
| `contacto.php` | El backend. Se sube a `public_html/api/contacto.php`. |
| `config.example.php` | Plantilla de configuración (sin secretos). La real va fuera de `public_html`. |
| `pruebas/` | Pruebas funcionales con PHP real (Docker) y un Resend falso. |

Requisitos: PHP 7.4 o superior con las extensiones `curl` y `mbstring` (vienen activas en cPanel; se revisan en **Select PHP Version**). Probado en PHP 7.4, 8.1 y 8.3.

## Desplegar

### 1. Resend: verificar el dominio y crear la clave
1. Crear cuenta en resend.com.
2. **Domains → Add Domain** → `institutofleming.edu.mx`. Resend muestra unos registros DNS (un subdominio para envíos y la firma DKIM).
3. En **cPanel → Zone Editor** de HostGator, agregar esos registros tal como los muestra Resend y esperar a que el dominio salga como **Verified**.
   - Estos registros usan un subdominio aparte: **no cambian ni afectan el correo que el instituto ya recibe**.
4. **API Keys → Create API Key** con permiso **Sending access** y, si se puede, restringida a ese dominio. Copiarla (solo se muestra una vez).

> Para probar antes de verificar el dominio se puede usar `FROM_EMAIL = 'onboarding@resend.dev'`, pero en ese modo Resend solo entrega al correo de la propia cuenta de Resend.

### 2. Configuración (fuera de `public_html`)
1. En **cPanel → Administrador de archivos**, crear la carpeta `/home/USUARIO/fleming-formulario/` (al mismo nivel que `public_html`, no dentro).
2. Crear ahí `config.php` copiando `config.example.php` y llenando:
   - `RESEND_API_KEY`: la clave del paso 1.
   - `FROM_EMAIL`: p. ej. `Sitio web Instituto Fleming <formulario@institutofleming.edu.mx>`.
   - `TO_EMAIL`: `inscripciones@institutofleming.edu.mx` (confirmar que la cuenta existe).
   - `ALLOWED_ORIGINS`: los dominios desde donde se publica el sitio.
   - `LEADS_CSV` y `RATE_DIR`: rutas dentro de esa misma carpeta (cambiar `USUARIO`).
   - `LIMITE_DIARIO`: 100 si se usa el plan gratis de Resend (su tope diario).
   - `IP_HEADER`: dejar vacío, salvo que el sitio se ponga detrás de Cloudflare u otro proxy (ver el ejemplo).
3. Permisos de `config.php`: **600**.

Los errores (sin datos personales) se guardan en `errores.log`, en esa misma carpeta. Así no queda un `error_log` público dentro de `public_html`.

`contacto.php` busca la configuración en `../../fleming-formulario/config.php` respecto a sí mismo (o en la ruta de la variable de entorno `FLEMING_FORM_CONFIG`).

### 3. Subir el backend
1. Subir `contacto.php` a `public_html/api/contacto.php`.
   - Si `public_html` tiene el WordPress actual, no hay conflicto: un archivo que existe se sirve directo.
2. Abrir `https://institutofleming.edu.mx/api/contacto.php` en el navegador. Debe mostrar:
   `{"ok":true,"servicio":"formulario-fleming","configurado":true,"limites":true}`
   - Si `configurado` es `false`, falta la clave, el remitente o el destinatario en `config.php`.
   - Si `limites` es `false`, la carpeta `RATE_DIR` no existe o PHP no puede escribir en ella. El formulario no acepta envíos hasta que se corrija.
   - Si al abrirla con `curl` sale `406 Not Acceptable`, es el ModSecurity de HostGator rechazando el cliente: probar desde el navegador.
3. Desde el sitio publicado, en un navegador real, enviar un mensaje de prueba que incluya `<`, `'` y acentos. ModSecurity a veces bloquea textos así antes de que lleguen a PHP. Si se bloquea, el visitante ve el error con el correo como alternativa; hay que pedir a HostGator que excluya `/api/contacto.php` de esa regla.

### 4. Conectar el sitio
En `assets/js/lead-form.js`, poner la URL en `FORM_CONFIG.endpoint` y publicar el sitio. Enviar una solicitud de prueba y revisar:
- el correo en inscripciones@,
- **Resend → Emails** (registro de cada envío: entregado, rebotado, etc.),
- el archivo `solicitudes.csv`.

## Cómo responde

| Situación | HTTP | Respuesta |
|---|---|---|
| Enviado | 200 | `{"ok":true}` |
| Dato inválido | 400 | `{"ok":false,"error":"nombre" \| "email" \| "telefono" \| "formato"}` |
| Sitio no permitido (CORS) | 403 | `{"ok":false,"error":"origen"}` |
| Límite anti-abuso | 429 | `{"ok":false,"error":"limite"}` |
| Falta configuración (o `RATE_DIR` no se puede usar) | 500 | `{"ok":false,"error":"configuracion"}` |
| Error inesperado (queda en `errores.log`) | 500 | `{"ok":false,"error":"servidor"}` |
| Resend no aceptó el correo | 502 | `{"ok":false,"error":"envio"}` |

## Seguridad y límites
- La clave de Resend solo existe en `config.php`, fuera de la carpeta pública; nunca en el sitio ni en el repositorio (`config.php` está en `.gitignore`).
- Solo acepta peticiones de los orígenes de `ALLOWED_ORIGINS`. Los rechazos quedan en el log, así se nota si falta un dominio (p. ej. con o sin `www`).
- Validación en el servidor y longitudes máximas por campo:
  - el teléfono solo admite dígitos y `+ ( ) . -`;
  - los campos de una línea pierden los saltos de línea (no llegan al asunto);
  - la "página de origen" solo se acepta si es del propio sitio.
- Campo trampa para bots (`campo_extra`): oculto sin depender de Tailwind y con un nombre que el autollenado del navegador no reconoce. Cada vez que se activa queda en el log, por si alguna vez lo activara una persona.
- Límites, revisados y apartados antes de enviar bajo un mismo candado (las peticiones simultáneas no se cuelan):
  - 1 envío por correo cada 60 s;
  - 5 **intentos** por IP cada 10 min (una IP puede ser la red de una escuela o de datos móviles);
  - un tope diario, con aviso en el log al 80 % y al llegar al tope.
  Por IP y por día cuentan también los envíos que Resend rechaza, así que, si Resend falla, nadie puede llenar el CSV sin límite. El límite por correo sí se libera tras una falla, para que la persona pueda reintentar enseguida.
- El respaldo CSV se escribe **antes** de enviar: si Resend falla, la solicitud no se pierde.
  - Se crea con permisos 600 (tiene datos personales) y con BOM para que Excel muestre los acentos.
  - Los textos que empiezan con `=`, `+`, `-` o `@` se neutralizan para que Excel no los ejecute como fórmula; el teléfono se guarda tal cual porque ya no puede contener fórmulas.
- Un envío solo cuenta como exitoso si Resend devuelve el id del correo. `Idempotency-Key` evita duplicar un reintento idéntico en el mismo minuto.
- Los errores nunca se muestran al visitante. Van a `errores.log` (fuera de `public_html`) con el prefijo `[formulario-fleming]` y sin datos personales.
- Acuse automático para quien escribe: listo pero apagado (`SEND_CONFIRMATION`) hasta que el instituto apruebe el texto. Es un texto fijo, sin nada de lo que escribió el visitante, para que nadie pueda usarlo para enviar su propio texto a terceros.
- Los archivos de límites de días anteriores se borran solos.
- El aviso de privacidad debería mencionar este respaldo CSV y cuánto tiempo se conserva.

## Pruebas locales
Con Docker y Node, desde la raíz del repositorio:

```bash
node backend/php/pruebas/mock-resend.cjs &          # Resend falso en :8092
docker run -d --name fleming-php -p 8091:8091 \
  -v "$PWD/backend/php:/app:ro" \
  -e FLEMING_FORM_CONFIG=/app/pruebas/config-prueba.php \
  php:8.1-cli php -S 0.0.0.0:8091 -t /app
node backend/php/pruebas/prueba.cjs 8091            # 15 casos
docker rm -f fleming-php
```

En Git Bash de Windows, anteponer `MSYS_NO_PATHCONV=1` y usar `$(pwd -W)` en lugar de `$PWD`. Reiniciar el Resend falso antes de cada corrida (guarda las peticiones en memoria).

Cubre:
- salud y CORS (preflight y origen no permitido);
- envío correcto y su contenido;
- límites por correo y por IP (cuentan los intentos fallidos);
- validación, incluido el teléfono con caracteres no válidos, y JSON inválido;
- campo trampa;
- saneado: página ajena, saltos de línea en el asunto y teléfono con `+52`;
- falla de Resend sin bloquear el reintento, y respuesta 2xx sin id;
- respaldo CSV: permisos 600, BOM, fórmulas y teléfono;
- método no permitido;
- log de errores sin datos personales.
