<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;

class Database
{
    private static ?PDO $pdo = null;

    public static function getConnection(?string $dbPath = null): PDO
    {
        if (self::$pdo === null) {
            $path = $dbPath ?? Config::get('DB_PATH', dirname(__DIR__) . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'database.sqlite');
            $dir = dirname($path);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }

            self::$pdo = new PDO('sqlite:' . $path, null, null, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);

            // High performance SQLite tuning for VPS
            self::$pdo->exec('PRAGMA journal_mode = WAL;');
            self::$pdo->exec('PRAGMA synchronous = NORMAL;');
            self::$pdo->exec('PRAGMA cache_size = 2000;');
            self::$pdo->exec('PRAGMA temp_store = MEMORY;');
            self::$pdo->exec('PRAGMA foreign_keys = ON;');

            self::initSchema(self::$pdo);
        }

        return self::$pdo;
    }

    public static function close(): void
    {
        self::$pdo = null;
    }

    private static function initSchema(PDO $pdo): void
    {
        $pdo->exec('
            CREATE TABLE IF NOT EXISTS rsvps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                attendance TEXT NOT NULL,
                guests INTEGER NOT NULL DEFAULT 1,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS wishes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_rsvps_created ON rsvps (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_rsvps_attendance ON rsvps (attendance);
        ');
    }
}
