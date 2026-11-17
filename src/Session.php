<?php

declare(strict_types=1);

namespace App;

class Session
{
    private static bool $started = false;

    public static function start(): void
    {
        if (self::$started || session_status() === PHP_SESSION_ACTIVE) {
            self::$started = true;
            return;
        }

        if (!headers_sent()) {
            @ini_set('session.use_strict_mode', '1');
            @ini_set('session.cookie_httponly', '1');
            @ini_set('session.cookie_samesite', 'Lax');
            @session_start();
        }
        self::$started = true;

        // Initialize flash storage
        if (!isset($_SESSION['_flash_next'])) {
            $_SESSION['_flash_next'] = [];
        }
        if (!isset($_SESSION['_flash_current'])) {
            $_SESSION['_flash_current'] = [];
        }
    }

    public static function flash(string $key, mixed $value): void
    {
        self::start();
        $_SESSION['_flash_next'][$key] = $value;
    }

    public static function getFlash(string $key, mixed $default = null): mixed
    {
        self::start();
        return $_SESSION['_flash_current'][$key] ?? $default;
    }

    public static function hasFlash(string $key): bool
    {
        self::start();
        return isset($_SESSION['_flash_current'][$key]);
    }

    public static function setOld(array $data): void
    {
        self::flash('_old_input', $data);
    }

    public static function old(string $key, mixed $default = ''): mixed
    {
        $old = self::getFlash('_old_input', []);
        // Support dot notation like wishes.name or array access
        if (str_contains($key, '.')) {
            $parts = explode('.', $key);
            $curr = $old;
            foreach ($parts as $p) {
                if (is_array($curr) && isset($curr[$p])) {
                    $curr = $curr[$p];
                } else {
                    return $default;
                }
            }
            return $curr;
        }
        return $old[$key] ?? $default;
    }

    public static function setErrors(array $errors, string $bag = 'default'): void
    {
        self::start();
        $allBags = self::getFlash('_errors', []);
        $allBags[$bag] = $errors;
        self::flash('_errors', $allBags);
    }

    public static function getErrors(string $bag = 'default'): array
    {
        $allBags = self::getFlash('_errors', []);
        return $allBags[$bag] ?? [];
    }

    public static function hasErrors(string $bag = 'default'): bool
    {
        $errors = self::getErrors($bag);
        return !empty($errors);
    }

    public static function getError(string $key, string $bag = 'default'): ?string
    {
        $errors = self::getErrors($bag);
        return $errors[$key] ?? null;
    }

    public static function csrfToken(): string
    {
        self::start();
        if (empty($_SESSION['_csrf_token'])) {
            $_SESSION['_csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['_csrf_token'];
    }

    public static function validateCsrf(?string $token): bool
    {
        self::start();
        if (empty($_SESSION['_csrf_token']) || empty($token)) {
            return false;
        }
        return hash_equals($_SESSION['_csrf_token'], $token);
    }

    /**
     * Call at the end of each request to advance flash messages
     */
    public static function rotateFlash(): void
    {
        self::start();
        $_SESSION['_flash_current'] = $_SESSION['_flash_next'] ?? [];
        $_SESSION['_flash_next'] = [];
    }
}
