<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/domain.php';
$db=hh_connect(hh_config());$total=0;
do{$count=hh_purge($db,hh_now());$total+=$count;}while($count===100);
echo 'Documentos vencidos eliminados: '.$total.PHP_EOL;
