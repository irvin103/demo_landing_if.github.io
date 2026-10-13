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

    // Carpeta para los límites anti-abuso (fuera de public_html).
    'RATE_DIR' => '/home/USUARIO/fleming-formulario/limites',

    // Anti-abuso: 1 envío por correo cada 60 s; 5 por IP cada 10 min; tope diario.
    'SEGUNDOS_ENTRE_MENSAJES' => 60,
    'LIMITE_POR_IP' => 5,
    'VENTANA_IP_SEGUNDOS' => 600,
    'LIMITE_DIARIO' => 200,
];
