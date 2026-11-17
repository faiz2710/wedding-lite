<?php

declare(strict_types=1);

// Built-in PHP server static file bypass
if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (is_file($file)) {
        return false;
    }
}

// Simple PSR-4 Autoloader
spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    $baseDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR;

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relativeClass = substr($class, $len);
    $file = $baseDir . str_replace('\\', DIRECTORY_SEPARATOR, $relativeClass) . '.php';

    if (file_exists($file)) {
        require $file;
    }
});

use App\Config;
use App\Router;
use App\Controllers\InvitationController;
use App\Controllers\RsvpController;
use App\Controllers\WishController;

// Load environment configuration
Config::load(dirname(__DIR__));

// Security Headers
header('X-Content-Type-Options: nosniff');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Routing
$router = new Router();

$router->get('/', [InvitationController::class, 'index']);
$router->post('/rsvp', [RsvpController::class, 'store']);
$router->post('/wishes', [WishController::class, 'store']);

$router->dispatch();
