<?php

declare(strict_types=1);

namespace App;

class Router
{
    private array $routes = [];

    public function get(string $path, callable|array $handler): void
    {
        $this->routes['GET'][$path] = $handler;
    }

    public function post(string $path, callable|array $handler): void
    {
        $this->routes['POST'][$path] = $handler;
    }

    public function dispatch(): void
    {
        Session::start();

        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';

        // Normalize trailing slashes
        if ($path !== '/' && str_ends_with($path, '/')) {
            $path = rtrim($path, '/');
        }

        $handler = $this->routes[$method][$path] ?? null;

        if ($handler === null) {
            http_response_code(404);
            echo '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h1>404 Not Found</h1><p><a href="/">Kembali ke Undangan</a></p></body></html>';
            Session::rotateFlash();
            return;
        }

        if (is_array($handler)) {
            [$class, $methodName] = $handler;
            $controller = new $class();
            $controller->$methodName();
        } elseif (is_callable($handler)) {
            $handler();
        }

        Session::rotateFlash();
    }

    public static function redirect(string $url): void
    {
        if (!headers_sent()) {
            header('Location: ' . $url);
        }
        Session::rotateFlash();
        if (PHP_SAPI !== 'cli') {
            exit;
        }
    }

    public static function render(string $view, array $data = []): void
    {
        extract($data);
        $viewFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'views' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $view) . '.php';
        if (!file_exists($viewFile)) {
            throw new \RuntimeException("View file not found: {$viewFile}");
        }
        require $viewFile;
    }
}
