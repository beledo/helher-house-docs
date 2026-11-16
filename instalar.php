<?php
declare(strict_types=1);
require_once __DIR__ . '/app/page.php';
if (is_file(HH_CONFIG)) {header('Location: '.hh_base().'entrar.php');exit;}
$keyFile=HH_DATA.'/install-key.php';
if(is_file(__DIR__.'/app/data/config.php')){
    http_response_code(503);hh_page('Instalación existente','Mové la configuración y los PDF al directorio privado antes de actualizar. Conservá la base de datos anterior.','');exit;
}
if(!is_file($keyFile)){
    http_response_code(503);hh_page('Preparar instalación','La instalación requiere una clave generada en el servidor.','<p>Ejecutá <code>php app/preparar-instalacion.php</code> por SSH y volvé a abrir esta página.</p>');exit;
}
hh_session();$error='';
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
    $lock=null;
    try{
        hh_check_csrf(hh_post('csrf'));
        if(PHP_VERSION_ID<80300 || PHP_INT_SIZE<8 || !extension_loaded('pdo_mysql') || !extension_loaded('zip'))throw new HttpError(400,'Activá PHP 8.3 o superior de 64 bits y las extensiones pdo_mysql y zip en Hostinger.');
        $lock=fopen(HH_DATA.'/install-lock.php','c+');
        if(!$lock||!flock($lock,LOCK_EX))throw new RuntimeException('No se pudo bloquear la instalación.');
        if(is_file(HH_CONFIG))throw new HttpError(409,'La aplicación ya está instalada. Entrá con tu contraseña.');
        if(!is_file($keyFile))throw new HttpError(503,'La clave de instalación ya no está disponible.');
        $expected=require $keyFile;
        $key=trim(hh_post('install_key'));
        if(!hh_verify_attempt(static fn():bool=>is_string($expected)&&strlen($key)===48&&hash_equals($expected,hash('sha256',$key))))throw new HttpError(400,'La clave de instalación no coincide.');
        $config=['db_host'=>trim(hh_post('db_host')),'db_name'=>trim(hh_post('db_name')),'db_user'=>trim(hh_post('db_user')),'db_password'=>hh_post('db_password'),'password_hash'=>hh_new_password(hh_post('password'),hh_post('confirm'))];
        if(!$config['db_name']||!$config['db_user']||!$config['db_password'])throw new HttpError(400,'Completá el nombre, el usuario y la contraseña de la base de datos de Hostinger.');
        if((!is_dir(HH_DATA.'/pdf')&&!mkdir(HH_DATA.'/pdf',0700))||!is_writable(HH_DATA.'/pdf'))throw new HttpError(400,'PHP no puede escribir en el directorio privado de PDF. Revisá el propietario y los permisos.');
        try{$db=hh_connect($config);}
        catch(Throwable $e){throw new HttpError(400,'No se pudo conectar con MySQL. Copiá los nombres completos que da Hostinger, incluido el prefijo u123…, y comprobá la contraseña y el servidor.');}
        $existing=(int)$db->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('hh_documents','hh_sequences','hh_company','hh_clients')")->fetchColumn();
        if($existing){
            foreach(['hh_documents','hh_sequences','hh_company','hh_clients'] as $table){
                $exists=hh_query($db,'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?',[$table])->fetchColumn();
                if($exists&&(int)$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn()>0)throw new HttpError(400,'Esta base de datos ya contiene documentos o ajustes de Helher House. Elegí una base nueva para instalar y conservá la configuración anterior para acceder a los datos existentes.');
            }
        }
        hh_migrate($db);
        hh_write_config($config);if(is_file($keyFile))unlink($keyFile);
        hh_sign_in($config['password_hash']);
        header('Location: '.hh_base());exit;
    }catch(HttpError $e){$error=$e->getMessage();http_response_code($e->status);}
    catch(Throwable $e){error_log('Helher House: falló la instalación ('.get_class($e).').');$error='No se pudo completar la instalación. Comprobá los permisos privados y que el usuario MySQL pueda crear tablas.';http_response_code(503);}
    finally{if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}}
}
function old(string $key,string $default=''):string{return hh_e(hh_post($key)?:$default);}
$form='<form method="post"><input type="hidden" name="csrf" value="'.hh_e(hh_csrf()).'"><label>Clave de instalación<input name="install_key" type="password" autocomplete="off" required maxlength="100"></label><p class="field-hint">Generala en el servidor con php app/preparar-instalacion.php.</p><div class="section-heading"><span class="section-index">01</span><h2>Base de datos de Hostinger</h2></div><label>Servidor MySQL<input name="db_host" autocomplete="off" required maxlength="100" value="'.old('db_host','localhost').'"></label><label>Nombre completo de la base de datos<input name="db_name" autocomplete="off" required maxlength="100" placeholder="u123456789_helher" value="'.old('db_name').'"></label><label>Usuario completo de la base de datos<input name="db_user" autocomplete="off" required maxlength="100" placeholder="u123456789_helher" value="'.old('db_user').'"></label><label>Contraseña de la base de datos<input type="password" name="db_password" autocomplete="off" required maxlength="1024"></label><div class="section-heading"><span class="section-index">02</span><h2>Tu acceso a la aplicación</h2></div><label>Elegí una contraseña de acceso<input type="password" name="password" autocomplete="new-password" required minlength="16" maxlength="72"></label><label>Repetí la contraseña de acceso<input type="password" name="confirm" autocomplete="new-password" required minlength="16" maxlength="72"></label><p class="field-hint">Esta es la contraseña que vas a usar desde el ordenador o el móvil. Al menos 16 caracteres.</p><button class="button primary" type="submit">Instalar y entrar</button></form><p class="field-hint">El instalador crea las tablas automáticamente. No hace falta importar un archivo SQL.</p>';
hh_page('Instalar en Hostinger','Creá una base MySQL en Hostinger y completá estos datos. La instalación se hace una sola vez.',$form,$error);
