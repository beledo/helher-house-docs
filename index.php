<?php
declare(strict_types=1);
require_once __DIR__ . '/app/bootstrap.php';
hh_require_auth(); hh_headers();
header('Content-Type: text/html; charset=utf-8');
$template = file_get_contents(__DIR__ . '/app/template.html');
echo str_replace(['{{CSRF}}','{{BASE}}'],[hh_e(hh_csrf()),hh_e(hh_base())],$template);
