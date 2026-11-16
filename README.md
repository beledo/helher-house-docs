# Helher House · Facturas y presupuestos

Aplicación privada para crear y guardar presupuestos y facturas. Incluye historial, clientes, exportación trimestral ZIP/CSV, orden de partidas y PDF con el logo corregido. Puede descargarse un presupuesto nuevo sin guardarlo antes.

## Desplegar en Hostinger

- Usá un sitio PHP/HTML dedicado a facturación, en un subdominio con HTTPS. El portal inmobiliario tiene su propio repositorio.
- PHP 8.3 o superior de 64 bits (probado con 8.4), MySQL o MariaDB y extensiones `pdo_mysql` y `zip`. Mantené PHP actualizado y activá HTTPS antes de instalar: la aplicación rechaza el acceso por HTTP.
- En hPanel, entrá en **Sitios web → Administrar → Avanzado → Git → Conectar con GitHub**. Dale acceso a Hostinger solo a este repositorio y seleccioná `main`. Usá la raíz del sitio de facturación, normalmente `public_html`, y dejá activado el despliegue automático.
- El repositorio se despliega directamente. No requiere un paso de compilación ni un ZIP de cada versión.

## Primera instalación

1. Creá una base MySQL dedicada y un usuario con permisos solo para esa base. Vas a necesitar el servidor, el nombre de la base, el usuario y su contraseña.
2. Desde SSH, en la raíz donde se desplegó este repositorio, ejecutá `php app/preparar-instalacion.php`. El comando crea un directorio privado con permisos `700` fuera de la raíz web y muestra una clave de instalación de un solo uso.
3. Abrí `/instalar.php` por HTTPS. Ingresá la clave temporal, los datos de MySQL y elegí una contraseña de acceso única de al menos 16 caracteres. La clave temporal deja de ser válida al terminar. No se requieren claves de API para generar PDF.
4. Abrí **Datos de Helher House** y guardá los datos fiscales y bancarios. Verificá el acceso, el guardado y la descarga con datos de prueba antes de emitir documentos.

Si el sitio se instala en una subcarpeta de otro sitio, fijá `HELHER_DATA_DIR` al mismo directorio privado absoluto en PHP y en SSH. La aplicación impide usar un directorio dentro de la raíz web. No subas ese directorio, las credenciales ni los respaldos a GitHub.

## Actualizar y conservar documentos

Los cambios de `main` actualizan el código. La configuración, los PDF y la base de datos son independientes del repositorio. La app comprueba y aplica las nuevas tablas de forma aditiva con la primera sesión autenticada.

Si ya usabas una versión PHP con datos en `app/data`: respaldá primero esa carpeta y la base. Conservá el archivo `config.php` y el directorio `pdf` juntos y llevalos al directorio privado de esta instalación con permisos restringidos. La aplicación deja de leer el almacenamiento bajo la raíz web. Verificá el historial antes de activar actualizaciones automáticas.

El historial del Site de ChatGPT no se copia con Git. La versión de Hostinger usa su propia base y requiere un traslado aparte si necesitás llevarte las facturas, clientes y archivos anteriores.
