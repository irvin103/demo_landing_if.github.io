# Backend del formulario de contacto (Google Apps Script)

Recibe las solicitudes del formulario "Resuelve tus dudas" del sitio, las **guarda en una hoja de Google** y **manda un correo a inscripciones@institutofleming.com** con "Responder a" la persona interesada. La hoja se escribe primero, así que una solicitud nunca se pierde aunque el correo no llegue.

No necesita servidor, dominio ni configuración de DNS. Es gratis.

## Archivos

- `Code.gs`: el script. La configuración (`CONFIG`) está al inicio: destinatario, asunto, nombre de la hoja, acuse automático y límites anti-abuso.
- `prueba.cjs`: pruebas locales con los servicios de Google simulados (`node backend/apps-script/prueba.cjs`).

## Desplegarlo (unos 5 minutos)

1. Entra con la cuenta de Google que será dueña de las solicitudes (lo ideal es una del instituto) y crea una hoja de cálculo, por ejemplo "Solicitudes sitio web Fleming".
2. En la hoja: **Extensiones → Apps Script**. Borra lo que trae el editor, pega todo el contenido de `Code.gs` y guarda.
3. Revisa `CONFIG.DESTINATARIO` (hoy: `inscripciones@institutofleming.com`).
4. **Implementar → Nueva implementación**. En el engrane elige **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. **Implementar** y autoriza los permisos que pide (hoja de cálculo y envío de correo). Copia la URL de la aplicación web; termina en `/exec`.
6. Ábrela en el navegador: debe mostrar `{"ok":true,"servicio":"formulario-fleming"}`.
7. Pega esa URL en `assets/js/lead-form.js`, en `FORM_CONFIG.endpoint`.
8. Envía una solicitud de prueba desde el sitio: debe aparecer una fila en la pestaña **Solicitudes** de la hoja y llegar el correo.

Para cambiar el script después: **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: nueva**. Así la URL no cambia.

## Detalles

- **Remitente:** el correo sale desde la cuenta de Google que desplegó el script, con el nombre "Sitio web Instituto Fleming". Al darle "Responder", la respuesta va directo a la persona interesada.
- **Cuota de envío:** Google limita los correos diarios que un script puede mandar (más bajo en cuentas gratuitas que en Google Workspace). Con el tope interno de 200 solicitudes al día es suficiente para un formulario de contacto. Si se queda corto, la solicitud igual queda en la hoja.
- **Anti-abuso:** campo trampa para bots, un mensaje por correo cada 60 s, tope diario, longitudes máximas por campo y protección contra fórmulas en la hoja.
- **Acuse para la persona interesada:** existe pero está apagado (`RESPUESTA_AUTOMATICA: false`) hasta que el instituto apruebe el texto.
- **Privacidad:** las solicitudes quedan en Google Sheets. Conviene que el aviso de privacidad lo contemple al actualizarse.
- **Si los correos no llegan a inscripciones@:** revisa spam en HostGator. Mientras se resuelve el proveedor de correo, la hoja es la fuente confiable de todas las solicitudes.
