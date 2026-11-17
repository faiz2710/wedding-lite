<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Router;
use App\Session;

class WishController
{
    public function store(): void
    {
        $rawWishes = $_POST['wishes'] ?? [];
        $name = is_array($rawWishes) ? trim((string)($rawWishes['name'] ?? '')) : '';
        $message = is_array($rawWishes) ? trim((string)($rawWishes['message'] ?? '')) : '';

        $errors = [];

        if ($name === '') {
            $errors['name'] = 'Nama wajib diisi.';
        } elseif (mb_strlen($name) > 100) {
            $errors['name'] = 'Nama maksimal 100 karakter.';
        }

        if ($message === '') {
            $errors['message'] = 'Ucapan tidak boleh kosong.';
        } elseif (mb_strlen($message) > 500) {
            $errors['message'] = 'Ucapan maksimal 500 karakter.';
        }

        if (!empty($errors)) {
            Session::setOld($_POST);
            Session::setErrors($errors, 'wishes');
            Router::redirect('/#wishes');
            return;
        }

        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO wishes (name, message, created_at, updated_at)
            VALUES (:name, :message, datetime("now"), datetime("now"))
        ');

        $stmt->execute([
            ':name'    => $name,
            ':message' => $message,
        ]);

        Session::flash('wishes_success', 'Terima kasih! Ucapan dan doamu berhasil dikirim.');
        Router::redirect('/#wishes');
    }
}
