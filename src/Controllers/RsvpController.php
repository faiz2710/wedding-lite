<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Router;
use App\Session;

class RsvpController
{
    public function store(): void
    {
        $name = trim((string)($_POST['name'] ?? ''));
        $attendance = trim((string)($_POST['attendance'] ?? ''));
        $guests = filter_var($_POST['guests'] ?? null, FILTER_VALIDATE_INT);
        $message = trim((string)($_POST['message'] ?? ''));

        $errors = [];

        if ($name === '') {
            $errors['name'] = 'Nama tamu wajib diisi.';
        } elseif (mb_strlen($name) > 100) {
            $errors['name'] = 'Nama maksimal 100 karakter.';
        }

        if ($attendance === '') {
            $errors['attendance'] = 'Silakan pilih konfirmasi kehadiran.';
        } elseif (!in_array($attendance, ['hadir', 'tidak_hadir'], true)) {
            $errors['attendance'] = 'Pilihan kehadiran tidak valid.';
        }

        if ($guests === false || $guests === null) {
            $errors['guests'] = 'Jumlah tamu harus berupa angka.';
        } elseif ($guests < 1) {
            $errors['guests'] = 'Jumlah tamu minimal 1 orang.';
        } elseif ($guests > 10) {
            $errors['guests'] = 'Jumlah tamu maksimal 10 orang.';
        }

        if ($message !== '' && mb_strlen($message) > 1000) {
            $errors['message'] = 'Pesan maksimal 1000 karakter.';
        }

        if (!empty($errors)) {
            Session::setOld($_POST);
            Session::setErrors($errors, 'default');
            Router::redirect('/#rsvp');
            return;
        }

        $db = Database::getConnection();
        $stmt = $db->prepare('
            INSERT INTO rsvps (name, attendance, guests, message, created_at, updated_at)
            VALUES (:name, :attendance, :guests, :message, datetime("now"), datetime("now"))
        ');

        $stmt->execute([
            ':name'       => $name,
            ':attendance' => $attendance,
            ':guests'     => $guests,
            ':message'    => $message !== '' ? $message : null,
        ]);

        Session::flash('rsvp_success', 'Terima kasih! Konfirmasi kehadiranmu berhasil dikirim.');
        Router::redirect('/#rsvp');
    }
}
