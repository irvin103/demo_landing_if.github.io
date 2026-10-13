<?php
/**
 * Backend del formulario "Resuelve tus dudas" del sitio del Instituto Fleming.
 *
 * Se sube al hosting de HostGator (p. ej. public_html/api/contacto.php) y
 * recibe el POST del formulario (assets/js/lead-form.js). Valida, aplica
 * límites anti-abuso, guarda la solicitud en un CSV privado (opcional) y
 * manda el correo a inscripciones@ a través de la API de Resend.
 *
 * La configuración (clave de Resend, correos, orígenes permitidos) vive en
 * un config.php FUERA de public_html; ver config.example.php y README.md.
 * Requiere PHP 7.4 o superior con las extensiones curl y mbstring.
 */

declare(strict_types=1);

date_default_timezone_set('America/Mexico_City');

// --- Configuración --------------------------------------------------------

function cargar_config(): array
{
    $defaults = [
        'RESEND_API_KEY'          => getenv('RESEND_API_KEY') ?: '',
        'RESEND_API_URL'          => 'https://api.resend.com/emails',
        'FROM_EMAIL'              => '',
        'TO_EMAIL'                => '',
        'ASUNTO'                  => 'Nueva solicitud de información desde el sitio web',
        'ALLOWED_ORIGINS'         => [],
        'SEND_CONFIRMATION'       => false,
        'LEADS_CSV'               => '',
        'RATE_DIR'                => sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'fleming-formulario',
        'SEGUNDOS_ENTRE_MENSAJES' => 60,  // por correo
        'LIMITE_POR_IP'           => 5,   // envíos por IP...
        'VENTANA_IP_SEGUNDOS'     => 600, // ...en esta ventana
        'LIMITE_DIARIO'           => 200,
    ];
    // Ruta del archivo de configuración: variable de entorno o, por defecto,
    // /home/<usuario>/fleming-formulario/config.php (fuera de public_html).
    $ruta = getenv('FLEMING_FORM_CONFIG') ?: dirname(__DIR__, 2) . '/fleming-formulario/config.php';
    $propia = is_file($ruta) ? require $ruta : [];
    return array_merge($defaults, is_array($propia) ? $propia : []);
}

const CAMPOS = [
    'nombre'         => 120,
    'telefono'       => 30,
    'email'          => 160,
    'mensaje'        => 3000,
    'programa'       => 120,
    'programaNombre' => 200,
    'nivel'          => 60,
    'pagina'         => 500,
    'empresa'        => 200, // campo trampa para bots
];

// --- Utilidades -----------------------------------------------------------

function responder(int $status, array $cuerpo): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($cuerpo, JSON_UNESCAPED_UNICODE);
    exit;
}

function aplicar_cors(array $config): bool
{
    $origen = $_SERVER['HTTP_ORIGIN'] ?? '';
    header('Vary: Origin');
    if ($origen === '') {
        return true; // petición sin Origin (p. ej. curl): no aplica CORS
    }
    if (!in_array($origen, $config['ALLOWED_ORIGINS'], true)) {
        return false;
    }
    header('Access-Control-Allow-Origin: ' . $origen);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
    return true;
}

function limpiar(array $entrada): array
{
    $datos = [];
    foreach (CAMPOS as $campo => $max) {
        $valor = isset($entrada[$campo]) && is_scalar($entrada[$campo]) ? (string) $entrada[$campo] : '';
        // Quita caracteres de control, salvo saltos de línea.
        $valor = preg_replace('/[^\P{C}\n]+/u', '', $valor) ?? '';
        $datos[$campo] = mb_substr(trim($valor), 0, $max);
    }
    return $datos;
}

function validar(array $d): string
{
    if (mb_strlen($d['nombre']) < 2) {
        return 'nombre';
    }
    if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
        return 'email';
    }
    $digitos = preg_replace('/\D/', '', $d['telefono']) ?? '';
    if ($digitos !== '' && strlen($digitos) < 10) {
        return 'telefono';
    }
    return '';
}

/*
 * Límites anti-abuso con archivos en RATE_DIR (funciona en hosting
 * compartido): un envío por correo cada N segundos, unos cuantos por IP en
 * una ventana (una IP puede ser la red de una escuela o de datos móviles,
 * compartida por muchas personas) y un tope diario. Solo cuentan los envíos
 * que sí salieron (registrar_envio).
 */
function archivo_correo(string $dir, string $email): string
{
    return $dir . '/rl_' . sha1('email:' . strtolower($email));
}

function archivo_ip(string $dir, string $ip): string
{
    return $dir . '/ip_' . sha1('ip:' . $ip);
}

/** Lee {inicio, n} de la ventana de una IP; vacía si ya expiró. */
function ventana_ip(array $config, string $archivo): array
{
    $v = is_file($archivo) ? json_decode((string) file_get_contents($archivo), true) : null;
    if (!is_array($v) || time() - (int) ($v['inicio'] ?? 0) >= (int) $config['VENTANA_IP_SEGUNDOS']) {
        return ['inicio' => time(), 'n' => 0];
    }
    return ['inicio' => (int) $v['inicio'], 'n' => (int) ($v['n'] ?? 0)];
}

function preparar_rate_dir(array $config): ?string
{
    $dir = $config['RATE_DIR'];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        error_log('[formulario-fleming] No se pudo crear RATE_DIR: ' . $dir);
        return null; // sin directorio no se limita, pero el formulario sigue funcionando
    }
    return $dir;
}

function limite_alcanzado(array $config, string $ip, string $email): bool
{
    $dir = preparar_rate_dir($config);
    if ($dir === null) {
        return false;
    }
    $correo = archivo_correo($dir, $email);
    if (is_file($correo) && time() - (int) filemtime($correo) < (int) $config['SEGUNDOS_ENTRE_MENSAJES']) {
        return true;
    }
    if (ventana_ip($config, archivo_ip($dir, $ip))['n'] >= (int) $config['LIMITE_POR_IP']) {
        return true;
    }
    $contador = $dir . '/dia_' . date('Y-m-d');
    return is_file($contador) && (int) file_get_contents($contador) >= (int) $config['LIMITE_DIARIO'];
}

function registrar_envio(array $config, string $ip, string $email): void
{
    $dir = preparar_rate_dir($config);
    if ($dir === null) {
        return;
    }
    touch(archivo_correo($dir, $email));
    $archivo = archivo_ip($dir, $ip);
    $v = ventana_ip($config, $archivo);
    file_put_contents($archivo, json_encode(['inicio' => $v['inicio'], 'n' => $v['n'] + 1]), LOCK_EX);

    $fp = fopen($dir . '/dia_' . date('Y-m-d'), 'c+');
    if ($fp === false) {
        return;
    }
    flock($fp, LOCK_EX);
    $enviados = (int) stream_get_contents($fp);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string) ($enviados + 1));
    flock($fp, LOCK_UN);
    fclose($fp);
}

// Evita que Excel interprete como fórmula un texto que empieza con = + - @.
function celda_segura(string $valor): string
{
    return preg_match('/^[=+\-@]/', $valor) ? "'" . $valor : $valor;
}

function guardar_csv(array $config, array $d): void
{
    $ruta = $config['LEADS_CSV'];
    if ($ruta === '') {
        return;
    }
    $nuevo = !is_file($ruta);
    $fp = @fopen($ruta, 'a');
    if ($fp === false) {
        error_log('[formulario-fleming] No se pudo abrir LEADS_CSV: ' . $ruta);
        return;
    }
    flock($fp, LOCK_EX);
    if ($nuevo) {
        fputcsv($fp, ['Fecha', 'Nombre', 'Teléfono', 'Correo', 'Programa', 'Nivel', 'Mensaje', 'Página']);
    }
    $fila = [
        date('Y-m-d H:i:s'), $d['nombre'], $d['telefono'], $d['email'],
        $d['programaNombre'] !== '' ? $d['programaNombre'] : $d['programa'],
        $d['nivel'], $d['mensaje'], $d['pagina'],
    ];
    fputcsv($fp, array_map('celda_segura', $fila));
    flock($fp, LOCK_UN);
    fclose($fp);
}

function e(string $texto): string
{
    return htmlspecialchars($texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function cuerpo_correo(array $d): array
{
    $programa = $d['programaNombre'] !== '' ? $d['programaNombre'] : ($d['programa'] !== '' ? $d['programa'] : '(no indicó)');
    $filas = [
        'Nombre'              => $d['nombre'],
        'Correo'              => $d['email'],
        'Teléfono'            => $d['telefono'] !== '' ? $d['telefono'] : '(no lo dejó)',
        'Programa de interés' => $programa,
        'Página'              => $d['pagina'],
    ];
    $mensaje = $d['mensaje'] !== '' ? $d['mensaje'] : 'Quiero más información, contáctenme.';

    $texto = '';
    $html = '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">';
    foreach ($filas as $etiqueta => $valor) {
        $texto .= $etiqueta . ': ' . $valor . "\n";
        $html .= '<tr><td style="padding:4px 12px 4px 0;color:#555"><b>' . e($etiqueta) . '</b></td>'
            . '<td style="padding:4px 0">' . e($valor) . '</td></tr>';
    }
    $html .= '</table>'
        . '<p style="font-family:Arial,sans-serif;font-size:14px"><b>Mensaje:</b><br>' . nl2br(e($mensaje)) . '</p>'
        . '<p style="font-family:Arial,sans-serif;font-size:12px;color:#777">Responde a este correo para contestarle directamente.</p>';
    $texto .= "\nMensaje:\n" . $mensaje . "\n\nResponde a este correo para contestarle directamente.";
    return ['texto' => $texto, 'html' => $html];
}

/** Envía por la API de Resend. Devuelve true si Resend aceptó el correo. */
function enviar_resend(array $config, array $payload, string $idempotencia): bool
{
    $ch = curl_init($config['RESEND_API_URL']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $config['RESEND_API_KEY'],
            'Content-Type: application/json',
            'Idempotency-Key: ' . $idempotencia,
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
    ]);
    $respuesta = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($status >= 200 && $status < 300) {
        return true;
    }
    error_log('[formulario-fleming] Resend respondió ' . $status . ': ' . ($error !== '' ? $error : (string) $respuesta));
    return false;
}

// --- Petición -------------------------------------------------------------

$config = cargar_config();

if (!aplicar_cors($config)) {
    responder(403, ['ok' => false, 'error' => 'origen']);
}
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($metodo === 'OPTIONS') {
    http_response_code(204);
    exit;
}
$configurado = $config['RESEND_API_KEY'] !== '' && $config['FROM_EMAIL'] !== '' && $config['TO_EMAIL'] !== '';
if ($metodo === 'GET') {
    // Comprobación rápida del despliegue (no revela la configuración).
    responder(200, ['ok' => true, 'servicio' => 'formulario-fleming', 'configurado' => $configurado]);
}
if ($metodo !== 'POST') {
    responder(405, ['ok' => false, 'error' => 'metodo']);
}
if (!$configurado) {
    error_log('[formulario-fleming] Falta configuración (RESEND_API_KEY, FROM_EMAIL o TO_EMAIL).');
    responder(500, ['ok' => false, 'error' => 'configuracion']);
}

$crudo = file_get_contents('php://input', false, null, 0, 20000);
$entrada = json_decode($crudo === false ? '' : $crudo, true);
if (!is_array($entrada)) {
    responder(400, ['ok' => false, 'error' => 'formato']);
}

$datos = limpiar($entrada);
if ($datos['empresa'] !== '') {
    responder(200, ['ok' => true]); // bot: se responde "ok" sin hacer nada
}
$error = validar($datos);
if ($error !== '') {
    responder(400, ['ok' => false, 'error' => $error]);
}
$ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
if (limite_alcanzado($config, $ip, $datos['email'])) {
    responder(429, ['ok' => false, 'error' => 'limite']);
}

// Se guarda antes de enviar: si el correo falla, la solicitud no se pierde.
guardar_csv($config, $datos);

$cuerpo = cuerpo_correo($datos);
$programa = $datos['programaNombre'] !== '' ? $datos['programaNombre'] : $datos['programa'];
$enviado = enviar_resend($config, [
    'from'     => $config['FROM_EMAIL'],
    'to'       => [$config['TO_EMAIL']],
    'reply_to' => $datos['email'],
    'subject'  => $config['ASUNTO'] . ($programa !== '' ? ' (' . $programa . ')' : ''),
    'html'     => $cuerpo['html'],
    'text'     => $cuerpo['texto'],
], hash('sha256', $datos['email'] . '|' . $datos['mensaje'] . '|' . date('Y-m-d H:i')));

if (!$enviado) {
    responder(502, ['ok' => false, 'error' => 'envio']);
}
registrar_envio($config, $ip, $datos['email']);

if ($config['SEND_CONFIRMATION']) {
    enviar_resend($config, [
        'from'     => $config['FROM_EMAIL'],
        'to'       => [$datos['email']],
        'reply_to' => $config['TO_EMAIL'],
        'subject'  => 'Recibimos tu mensaje, Instituto Fleming',
        'text'     => 'Hola ' . $datos['nombre'] . ",\n\nGracias por escribirnos. Recibimos tu mensaje y te contactaremos pronto.\n\nInstituto Fleming",
    ], hash('sha256', 'acuse|' . $datos['email'] . '|' . date('Y-m-d H:i')));
}

responder(200, ['ok' => true]);
