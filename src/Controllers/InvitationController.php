<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Database;
use App\Router;

class InvitationController
{
    public function index(): void
    {
        $db = Database::getConnection();
        $stmt = $db->query('SELECT * FROM wishes ORDER BY created_at DESC LIMIT 30');
        $wishes = $stmt->fetchAll();

        Router::render('invitation', [
            'wishes' => $wishes,
        ]);
    }
}
