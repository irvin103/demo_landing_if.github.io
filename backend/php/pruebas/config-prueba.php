<?php
return [
    'RESEND_API_KEY' => 're_prueba_123',
    'RESEND_API_URL' => 'http://host.docker.internal:8092/emails',
    'FROM_EMAIL' => 'Sitio web Instituto Fleming <formulario@institutofleming.edu.mx>',
    'TO_EMAIL' => 'inscripciones@institutofleming.edu.mx',
    'ALLOWED_ORIGINS' => ['http://localhost:8080'],
    'SEND_CONFIRMATION' => false,
    'LEADS_CSV' => '/tmp/solicitudes.csv',
    'RATE_DIR' => '/tmp/limites',
    'ERROR_LOG' => '/tmp/errores.log',
    // Permite simular varias IP desde las pruebas.
    'IP_HEADER' => 'HTTP_X_PRUEBA_IP',
    'SEGUNDOS_ENTRE_MENSAJES' => 60,
    'LIMITE_DIARIO' => 100,
];
