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
3. Permisos de `config.php`: **600**.

`contacto.php` busca la configuración en `../../fleming-formulario/config.php` respecto a sí mismo (o en la ruta de la variable de entorno `FLEMING_FORM_CONFIG`).

### 3. Subir el backend
1. Subir `contacto.php` a `public_html/api/contacto.php`.
   - Si `public_html` tiene el WordPress actual, no hay conflicto: un archivo que existe se sirve directo.
2. Abrir `https://institutofleming.edu.mx/api/contacto.php` en el navegador. Debe mostrar:
   `{"ok":true,"servicio":"formulario-fleming","configurado":true}`
   Si `configurado` es `false`, falta la clave, el remitente o el destinatario en `config.php`.

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
| Falta configuración | 500 | `{"ok":false,"error":"configuracion"}` |
| Resend no aceptó el correo | 502 | `{"ok":false,"error":"envio"}` |

## Seguridad y límites
- La clave de Resend solo existe en `config.php`, fuera de la carpeta pública; nunca en el sitio ni en el repositorio (`config.php` está en `.gitignore`).
- Solo acepta peticiones de los orígenes de `ALLOWED_ORIGINS`.
- Campo trampa para bots, validación en el servidor y longitudes máximas por campo.
- Límites: 1 envío por correo cada 60 s, 5 por IP cada 10 min (una IP puede ser la red de una escuela o de datos móviles) y 200 al día. Solo cuentan los envíos que sí salieron.
- El respaldo CSV se escribe **antes** de enviar: si Resend falla, la solicitud no se pierde. Los textos que empiezan con `=`, `+`, `-` o `@` se neutralizan para que Excel no los ejecute como fórmula.
- `Idempotency-Key` en cada envío para que un reintento no duplique el correo.
- Errores en el `error_log` de PHP con el prefijo `[formulario-fleming]`.
- Acuse automático para quien escribe: listo pero apagado (`SEND_CONFIRMATION`) hasta que el instituto apruebe el texto.

## Pruebas locales
Con Docker y Node, desde la raíz del repositorio:

```bash
node backend/php/pruebas/mock-resend.cjs &          # Resend falso en :8092
docker run -d --name fleming-php -p 8091:8091 \
  -v "$PWD/backend/php:/app:ro" \
  -e FLEMING_FORM_CONFIG=/app/pruebas/config-prueba.php \
  php:8.1-cli php -S 0.0.0.0:8091 -t /app
node backend/php/pruebas/prueba.cjs 8091            # 12 casos
docker rm -f fleming-php
```

Cubre: salud, CORS (preflight y origen no permitido), envío correcto y su contenido, límites por correo e IP, validación, JSON inválido, campo trampa, falla de Resend sin bloquear el reintento, respaldo CSV y método no permitido.
