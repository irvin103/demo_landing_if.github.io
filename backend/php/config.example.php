<?php
/**
 * Configuración del formulario (copia de ejemplo, sin secretos).
 *
 * Copiar como config.php en una carpeta FUERA de public_html, por defecto:
 *   /home/<usuario>/fleming-formulario/config.php
 * (o indicar otra ruta con la variable de entorno FLEMING_FORM_CONFIG).
 * Nunca subir config.php con la clave real al repositorio.
 */
return [
    // Clave de API de Resend (resend.com → API Keys). Permiso: "Sending access".
    'RESEND_API_KEY' => 're_XXXXXXXXXXXXXXXXXXXXXXXX',

    // Remitente: debe ser de un dominio verificado en Resend.
    // Para probar antes de verificar el dominio: 'onboarding@resend.dev'
    // (en ese modo Resend solo entrega al correo de la cuenta de Resend).
    'FROM_EMAIL' => 'Sitio web Instituto Fleming <formulario@institutofleming.edu.mx>',

    // Quién recibe las solicitudes. Ojo: institutofleming.com NO existe;
    // el dominio del instituto es institutofleming.edu.mx.
    'TO_EMAIL' => 'inscripciones@institutofleming.edu.mx',

    // Sitios que pueden enviar al formulario (origen = esquema + dominio, sin ruta).
    'ALLOWED_ORIGINS' => [
        'https://starkgaming02.github.io',      // GitHub Pages
        'https://institutofleming.edu.mx',
        'https://www.institutofleming.edu.mx',
        // 'http://localhost:8080',             // solo para pruebas locales
    ],

    // Acuse automático para quien escribe. Activar cuando el instituto apruebe el texto.
    'SEND_CONFIRMATION' => false,

    // Respaldo de cada solicitud en CSV (fuera de public_html). '' = desactivado.
    'LEADS_CSV' => '/home/USUARIO/fleming-formulario/solicitudes.csv',

    // Carpeta para los límites anti-abuso (fuera de public_html). Obligatoria:
    // si no se puede crear o escribir, el formulario responde "configuracion".
    'RATE_DIR' => '/home/USUARIO/fleming-formulario/limites',

    // Log de errores (sin datos personales). Vacío = errores.log junto a este archivo.
    'ERROR_LOG' => '',

    // Solo si el sitio queda detrás de un proxy como Cloudflare: encabezado con
    // la IP real del visitante, p. ej. 'HTTP_CF_CONNECTING_IP'. Sin proxy debe
    // quedar vacío (cualquiera podría falsificar ese encabezado).
    'IP_HEADER' => '',

    // Anti-abuso: 1 envío por correo cada 60 s; 5 intentos por IP cada 10 min;
    // tope diario. El plan gratis de Resend permite 100 correos al día.
    'SEGUNDOS_ENTRE_MENSAJES' => 60,
    'LIMITE_POR_IP' => 5,
    'VENTANA_IP_SEGUNDOS' => 600,
    'LIMITE_DIARIO' => 100,
];
