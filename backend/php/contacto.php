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

// --- Errores ----------------------------------------------------------------
// Nunca se muestran al visitante: romperían el JSON y revelarían rutas del
// servidor. Van a errores.log junto a config.php (fuera de public_html); si
// no, cPanel crearía un "error_log" público junto a este archivo.

function ruta_config(): string
{
    return getenv('FLEMING_FORM_CONFIG') ?: dirname(__DIR__, 2) . '/fleming-formulario/config.php';
}

ini_set('display_errors', '0');
ini_set('log_errors', '1');
if (is_dir(dirname(ruta_config())) && is_writable(dirname(ruta_config()))) {
    ini_set('error_log', dirname(ruta_config()) . '/errores.log');
}
// Cualquier excepción o error fatal (incluido un error de sintaxis en
// config.php) responde JSON en lugar de una página de error.
set_exception_handler(function (Throwable $e): void {
    error_log('[formulario-fleming] ' . get_class($e) . ': ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')');
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['ok' => false, 'error' => 'servidor']);
});

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
        'ERROR_LOG'               => '',
        'IP_HEADER'               => '',
        'SEGUNDOS_ENTRE_MENSAJES' => 60,  // por correo
        'LIMITE_POR_IP'           => 5,   // intentos por IP...
        'VENTANA_IP_SEGUNDOS'     => 600, // ...en esta ventana
        'LIMITE_DIARIO'           => 100, // el plan gratis de Resend permite 100 al día
    ];
    $ruta = ruta_config();
    $propia = is_file($ruta) ? require $ruta : [];
    $c = array_merge($defaults, is_array($propia) ? $propia : []);

    // Tipos esperados: un valor mal escrito en config.php no debe tumbar el script.
    foreach (['RESEND_API_KEY', 'RESEND_API_URL', 'FROM_EMAIL', 'TO_EMAIL', 'ASUNTO', 'LEADS_CSV', 'RATE_DIR', 'ERROR_LOG', 'IP_HEADER'] as $k) {
        $c[$k] = is_string($c[$k]) ? $c[$k] : '';
    }
    foreach (['SEGUNDOS_ENTRE_MENSAJES', 'LIMITE_POR_IP', 'VENTANA_IP_SEGUNDOS', 'LIMITE_DIARIO'] as $k) {
        $c[$k] = (int) $c[$k];
    }
    $c['ALLOWED_ORIGINS'] = is_array($c['ALLOWED_ORIGINS']) ? array_values(array_filter($c['ALLOWED_ORIGINS'], 'is_string')) : [];
    $c['SEND_CONFIRMATION'] = (bool) $c['SEND_CONFIRMATION'];

    if ($c['ERROR_LOG'] !== '') {
        ini_set('error_log', $c['ERROR_LOG']);
    }
    return $c;
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
    'campo_extra'    => 200, // campo trampa para bots (nombre sin significado para el autollenado)
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
        // Si el sitio real cae aquí, falta su dominio en ALLOWED_ORIGINS.
        error_log('[formulario-fleming] Origen no permitido: ' . mb_substr($origen, 0, 200));
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
        if ($campo !== 'mensaje') {
            // Campos de una línea: sin saltos (llegan al asunto del correo y al CSV).
            $valor = preg_replace('/\s+/u', ' ', $valor) ?? '';
        }
        // Quita caracteres de control, salvo saltos de línea.
        $valor = preg_replace('/[^\P{C}\n]+/u', '', $valor) ?? '';
        $datos[$campo] = mb_substr(trim($valor), 0, $max);
    }
    return $datos;
}

/** La página de origen solo se acepta si es del propio sitio (se lee en el correo). */
function pagina_del_sitio(array $config, string $url): string
{
    foreach ($config['ALLOWED_ORIGINS'] as $origen) {
        if ($url === $origen || strpos($url, $origen . '/') === 0) {
            return $url;
        }
    }
    return '';
}

/** Devuelve el campo inválido, o '' si todo está bien. */
function validar(array $d): string
{
    if (mb_strlen($d['nombre']) < 2) {
        return 'nombre';
    }
    if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) {
        return 'email';
    }
    if ($d['telefono'] !== '') {
        // Solo dígitos y separadores comunes; así tampoco puede ser una fórmula en el CSV.
        $digitos = preg_replace('/\D/', '', $d['telefono']) ?? '';
        if (!preg_match('/^[0-9 +().\-]+$/', $d['telefono']) || strlen($digitos) < 10) {
            return 'telefono';
        }
    }
    return '';
}

function programa_de(array $d): string
{
    return $d['programaNombre'] !== '' ? $d['programaNombre'] : $d['programa'];
}

/** IP del visitante. IP_HEADER solo se usa si el sitio está detrás de ese proxy (p. ej. Cloudflare). */
function ip_cliente(array $config): string
{
    if ($config['IP_HEADER'] !== '') {
        $ip = trim(explode(',', (string) ($_SERVER[$config['IP_HEADER']] ?? ''))[0]);
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/*
 * Límites anti-abuso con archivos en RATE_DIR (funciona en hosting
 * compartido): un envío por correo cada N segundos, unos cuantos intentos por
 * IP en una ventana (una IP puede ser la red de una escuela o de datos
 * móviles, compartida por muchas personas) y un tope diario.
 *
 * Se revisa y se aparta el lugar ANTES de enviar, bajo un mismo candado, para
 * que peticiones simultáneas no se cuelen. Por IP y por día cuentan los
 * intentos (también los que Resend rechaza: si Resend falla, nadie puede
 * llenar el CSV sin límite). El apartado por correo se libera si el envío
 * falla, para que la persona pueda reintentar enseguida.
 */
function archivo_correo(string $dir, string $email): string
{
    return $dir . '/rl_' . sha1('email:' . strtolower($email));
}

function archivo_ip(string $dir, string $ip): string
{
    return $dir . '/ip_' . sha1('ip:' . $ip);
}

function preparar_rate_dir(array $config): ?string
{
    $dir = $config['RATE_DIR'];
    if ($dir === '' || (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) || !is_writable($dir)) {
        return null;
    }
    return $dir;
}

function escribir(string $ruta, string $contenido): void
{
    if (@file_put_contents($ruta, $contenido) === false) {
        throw new RuntimeException('No se pudo escribir ' . basename($ruta) . ' en RATE_DIR');
    }
}

/** Lee {inicio, n} de la ventana de una IP; vacía si ya expiró. */
function ventana_ip(array $config, string $archivo): array
{
    $v = is_file($archivo) ? json_decode((string) @file_get_contents($archivo), true) : null;
    if (!is_array($v) || time() - (int) ($v['inicio'] ?? 0) >= $config['VENTANA_IP_SEGUNDOS']) {
        return ['inicio' => time(), 'n' => 0];
    }
    return ['inicio' => (int) $v['inicio'], 'n' => (int) ($v['n'] ?? 0)];
}

/** Borra de vez en cuando los archivos de límites de días anteriores. */
function purgar_viejos(string $dir): void
{
    if (random_int(1, 50) !== 1) {
        return;
    }
    foreach (glob($dir . '/*') ?: [] as $archivo) {
        if (preg_match('/^(rl|ip|dia)_/', basename($archivo)) && time() - (int) @filemtime($archivo) > 2 * 86400) {
            @unlink($archivo);
        }
    }
}

/** true si había lugar y quedó apartado; false si se alcanzó algún límite. */
function apartar_envio(array $config, string $dir, string $ip, string $email): bool
{
    $candado = @fopen($dir . '/.candado', 'c');
    if ($candado === false || !flock($candado, LOCK_EX)) {
        throw new RuntimeException('No se pudo bloquear RATE_DIR');
    }
    try {
        $correo = archivo_correo($dir, $email);
        if (is_file($correo) && time() - (int) filemtime($correo) < $config['SEGUNDOS_ENTRE_MENSAJES']) {
            return false;
        }
        $archivo_ip = archivo_ip($dir, $ip);
        $v = ventana_ip($config, $archivo_ip);
        if ($v['n'] >= $config['LIMITE_POR_IP']) {
            return false;
        }
        $archivo_dia = $dir . '/dia_' . date('Y-m-d');
        $hoy = is_file($archivo_dia) ? (int) @file_get_contents($archivo_dia) : 0;
        if ($hoy >= $config['LIMITE_DIARIO']) {
            return false;
        }

        escribir($correo, (string) time());
        escribir($archivo_ip, (string) json_encode(['inicio' => $v['inicio'], 'n' => $v['n'] + 1]));
        escribir($archivo_dia, (string) ($hoy + 1));
        if ($hoy + 1 === $config['LIMITE_DIARIO'] || $hoy + 1 === intdiv($config['LIMITE_DIARIO'] * 4, 5)) {
            error_log('[formulario-fleming] Aviso: van ' . ($hoy + 1) . ' de ' . $config['LIMITE_DIARIO'] . ' envíos permitidos hoy.');
        }
        purgar_viejos($dir);
        return true;
    } finally {
        flock($candado, LOCK_UN);
        fclose($candado);
    }
}

function liberar_correo(string $dir, string $email): void
{
    @unlink(archivo_correo($dir, $email));
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
    // Tiene datos personales: solo el dueño de la cuenta puede leerlo (600).
    $mascara = umask(0077);
    $fp = @fopen($ruta, 'a');
    umask($mascara);
    if ($fp === false) {
        error_log('[formulario-fleming] No se pudo abrir LEADS_CSV.');
        return;
    }
    flock($fp, LOCK_EX);
    if (fstat($fp)['size'] === 0) {
        fwrite($fp, "\xEF\xBB\xBF"); // BOM: Excel muestra bien los acentos
        fputcsv($fp, ['Fecha', 'Nombre', 'Teléfono', 'Correo', 'Programa', 'Nivel', 'Mensaje', 'Página'], ',', '"', '');
    }
    // El teléfono ya solo trae dígitos y separadores: se guarda tal cual (sin
    // apóstrofo delante de un "+52").
    $fila = [
        date('Y-m-d H:i:s'), celda_segura($d['nombre']), $d['telefono'], celda_segura($d['email']),
        celda_segura(programa_de($d)), celda_segura($d['nivel']), celda_segura($d['mensaje']), celda_segura($d['pagina']),
    ];
    if (fputcsv($fp, $fila, ',', '"', '') === false) {
        error_log('[formulario-fleming] No se pudo escribir en LEADS_CSV.');
    }
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function e(string $texto): string
{
    return htmlspecialchars($texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function cuerpo_correo(array $d): array
{
    $programa = programa_de($d) !== '' ? programa_de($d) : '(no indicó)';
    $filas = [
        'Nombre'              => $d['nombre'],
        'Correo'              => $d['email'],
        'Teléfono'            => $d['telefono'] !== '' ? $d['telefono'] : '(no lo dejó)',
        'Programa de interés' => $programa,
        'Página'              => $d['pagina'] !== '' ? $d['pagina'] : '(no indicada)',
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

/** Envía por la API de Resend. true solo si Resend aceptó el correo y devolvió su id. */
function enviar_resend(array $config, array $payload): bool
{
    $json = (string) json_encode($payload, JSON_UNESCAPED_UNICODE);
    $ch = curl_init($config['RESEND_API_URL']);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $config['RESEND_API_KEY'],
            'Content-Type: application/json',
            // Un reintento idéntico en el mismo minuto no duplica el correo.
            'Idempotency-Key: ' . hash('sha256', $json . '|' . date('Y-m-d H:i')),
        ],
        CURLOPT_POSTFIELDS     => $json,
    ]);
    $respuesta = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    $r = is_string($respuesta) ? json_decode($respuesta, true) : null;
    if ($status >= 200 && $status < 300 && is_array($r) && is_string($r['id'] ?? null)) {
        return true;
    }
    // Sin el cuerpo de la respuesta: puede traer correos (datos personales).
    $tipo = $error !== '' ? $error : (is_array($r) && is_string($r['name'] ?? null) ? $r['name'] : 'respuesta inesperada');
    error_log('[formulario-fleming] Resend respondió ' . $status . ': ' . $tipo);
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
$dir_limites = preparar_rate_dir($config);
if ($metodo === 'GET') {
    // Comprobación rápida del despliegue (no revela la configuración).
    responder(200, ['ok' => true, 'servicio' => 'formulario-fleming', 'configurado' => $configurado, 'limites' => $dir_limites !== null]);
}
if ($metodo !== 'POST') {
    responder(405, ['ok' => false, 'error' => 'metodo']);
}
if (!$configurado || $dir_limites === null) {
    error_log('[formulario-fleming] Falta configuración: ' . (!$configurado ? 'RESEND_API_KEY, FROM_EMAIL o TO_EMAIL.' : 'RATE_DIR no existe o no se puede escribir.'));
    responder(500, ['ok' => false, 'error' => 'configuracion']);
}

$crudo = file_get_contents('php://input', false, null, 0, 20000);
$entrada = json_decode($crudo === false ? '' : $crudo, true);
if (!is_array($entrada)) {
    responder(400, ['ok' => false, 'error' => 'formato']);
}

$datos = limpiar($entrada);
if ($datos['campo_extra'] !== '') {
    // Bot: se responde "ok" sin enviar. Se registra (sin datos personales)
    // por si alguna vez lo activa una persona real.
    error_log('[formulario-fleming] Campo trampa activado; solicitud descartada.');
    responder(200, ['ok' => true]);
}
$campo_invalido = validar($datos);
if ($campo_invalido !== '') {
    responder(400, ['ok' => false, 'error' => $campo_invalido]);
}
$datos['pagina'] = pagina_del_sitio($config, $datos['pagina']);

if (!apartar_envio($config, $dir_limites, ip_cliente($config), $datos['email'])) {
    responder(429, ['ok' => false, 'error' => 'limite']);
}

// Se guarda antes de enviar: si el correo falla, la solicitud no se pierde.
guardar_csv($config, $datos);

$cuerpo = cuerpo_correo($datos);
$programa = programa_de($datos);
$enviado = enviar_resend($config, [
    'from'     => $config['FROM_EMAIL'],
    'to'       => [$config['TO_EMAIL']],
    'reply_to' => $datos['email'],
    'subject'  => $config['ASUNTO'] . ($programa !== '' ? ' (' . $programa . ')' : ''),
    'html'     => $cuerpo['html'],
    'text'     => $cuerpo['texto'],
]);

if (!$enviado) {
    liberar_correo($dir_limites, $datos['email']);
    responder(502, ['ok' => false, 'error' => 'envio']);
}

if ($config['SEND_CONFIRMATION']) {
    // Texto fijo, sin nada de lo que escribió el visitante: así nadie puede
    // usar el formulario para mandar su propio texto a otra persona.
    enviar_resend($config, [
        'from'     => $config['FROM_EMAIL'],
        'to'       => [$datos['email']],
        'reply_to' => $config['TO_EMAIL'],
        'subject'  => 'Recibimos tu mensaje, Instituto Fleming',
        'text'     => "Hola:\n\nGracias por escribirnos. Recibimos tu mensaje y te contactaremos pronto.\n\nInstituto Fleming",
    ]);
}

responder(200, ['ok' => true]);
