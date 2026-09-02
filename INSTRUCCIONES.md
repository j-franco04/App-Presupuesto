# Sistema de Cotizaciones AB TECHNOLOGY BY — Versión 2

Guía para aplicar los cambios paso a paso. Léela completa antes de empezar; toma unos 20 minutos.

---

## 1. Qué cambió y por qué

### Lo que se agregó
| Novedad | Detalle |
|---|---|
| **Datos completos del cliente** | Nombre, RIF/C.I., dirección fiscal, teléfono, correo y persona de contacto. Todo sale impreso en el PDF. |
| **Formas de pago administrables** | Se crean y editan desde la app (Configuración → Formas de pago): banco, tipo, número, titular, documento. En cada cotización marcas cuáles aparecen en el PDF. |
| **Datos de la empresa editables** | Razón social, RIF, teléfono, correo, web y dirección ya no están escritos dentro del código. |
| **Descuentos** | Por porcentaje o por monto fijo, con base imponible calculada aparte. |
| **IVA configurable** | La alícuota ya no está fija en 16%; se puede cambiar por cotización. |
| **Estados** | Borrador, Enviada, Aprobada, Rechazada y Anulada, con filtro en el archivo. |
| **Tasa BCV** | Campo opcional; si la cargas, el PDF muestra el equivalente referencial en bolívares. |
| **Validez, entrega y condiciones de pago** | Campos nuevos que se imprimen en el PDF. |
| **Buscador y paginación** | Búsqueda por cliente, RIF o folio; ya no se cargan todos los registros de golpe. |
| **Duplicar cotización** | Copia una cotización existente con un folio nuevo. |
| **Unidades por ítem** | Und, Serv, Hora, Mes, etc. |

### Errores que se corrigieron
1. **Totales frágiles.** La versión anterior leía los montos del texto que se veía en pantalla (`innerText.split(' ')[1]`). Si cambiabas el formato, se guardaban montos incorrectos o `NaN`. Ahora **el servidor recalcula todo** y ese resultado es el que se guarda.
2. **Folios repetidos.** El número salía de `countDocuments()`: si borrabas una cotización, la siguiente repetía el folio. Ahora hay un contador atómico por año → `AB-2026-0001`.
3. **PDF sin paginación.** Con más de ~15 ítems el contenido se salía de la hoja y se perdía. Ahora salta de página, repite el encabezado de la tabla y numera las páginas.
4. **Logo invisible en el PDF.** El logo se dibujaba encima de la franja negra, así que la "A" y el texto negro desaparecían. Ahora va sobre fondo blanco.
5. **API sin protección.** Cualquiera con la dirección de Render podía leer o borrar todas tus cotizaciones. Ahora existe `API_KEY`.
6. **Riesgo de inyección de HTML.** El historial insertaba el nombre del cliente con `innerHTML`. Si un nombre traía comillas o `<`, rompía la tabla. Ahora todo se inserta como texto.
7. **Fecha corrida un día.** Por la diferencia horaria (UTC vs. Venezuela) una fecha podía imprimirse un día antes. Corregido.
8. **`main.js` estaba en `.gitignore`.** El archivo principal de Electron quedaba fuera del repositorio. Corregido.
9. **Ícono del instalador.** Usaba `NLOGO.png`; Windows necesita `.ico`. Ahora usa `icono.ico`, que ya tenías.
10. **`database.db`.** Es un resto de una versión anterior en SQLite; ya no se usa. Puedes borrarlo.

### Sobre cambiar de lenguaje
**Mi recomendación es no cambiarlo.** Node + Express + MongoDB ya está funcionando, desplegado y tú lo conoces. El problema de la versión 1 no era el lenguaje, era la organización del código. Ahora está separado en cuatro archivos con una responsabilidad cada uno, que es lo que hace falta para crecer sin romper nada.

---

## 2. Estructura final del proyecto

```
presupuestos-app/
├── main.js               ← ventana de escritorio (Electron)
├── server.js             ← API: rutas y validaciones
├── models.js             ← estructura de la base de datos
├── pdf.js                ← diseño del PDF
├── migrar.js             ← se ejecuta UNA vez (datos viejos → formato nuevo)
├── package.json
├── .env                  ← tus claves (NO se sube a GitHub)
├── .env.example          ← plantilla de ejemplo
├── .gitignore
├── icono.ico             ← ícono del instalador de Windows
└── public/
    ├── index.html        ← la aplicación completa
    └── NLOGO.png         ← logo (lo usan la app y el PDF)
```

> **Importante:** `NLOGO.png` debe quedar dentro de `public/`. De ahí lo toman tanto la pantalla como el generador de PDF.

---

## 3. Paso a paso

### Paso 1 — Respalda lo que tienes
Copia tu carpeta actual completa a otro lado (por ejemplo `presupuestos-app-v1-respaldo`). Si algo sale mal, vuelves a ella.

En MongoDB Atlas entra a **Browse Collections → presupuestos** y verifica que tus registros estén ahí. El paso 5 los va a modificar.

### Paso 2 — Copia los archivos nuevos
Reemplaza estos archivos por los que te entrego: `main.js`, `server.js`, `package.json`, `.gitignore`.
Agrega los nuevos: `models.js`, `pdf.js`, `migrar.js`, `.env.example`, `INSTRUCCIONES.md`.
Crea la carpeta `public/` y coloca dentro `index.html` (el nuevo) y una copia de `NLOGO.png`.
Puedes borrar: el `index.html` viejo de la raíz y `database.db`.

### Paso 3 — Agrega la clave de acceso al `.env`
Abre tu archivo `.env` y agrega una línea nueva al final (deja `MONGO_URI` como está):

```
API_KEY=AB-2026-pon-aqui-una-clave-larga-inventada
```

Esa misma clave la vas a cargar después dentro de la app.

> Si dejas `API_KEY` vacía, todo funciona igual pero cualquiera que conozca tu dirección de Render puede leer y borrar tus cotizaciones. Te recomiendo ponerla.

### Paso 4 — Instala las dependencias
Abre la terminal dentro de la carpeta del proyecto:

```bash
npm install
```

### Paso 5 — Convierte los datos viejos (una sola vez)
La versión 1 guardaba el cliente como un simple texto; ahora es un conjunto de campos. Este comando hace la conversión:

```bash
npm run migrar
```

Debe mostrar algo como:
```
✅ Conectado a MongoDB Atlas
📄 Presupuestos encontrados: 12
✅ Registros actualizados: 12
💳 Forma de pago inicial creada (Banesco). Revísala en Configuración.
🎉 Migración terminada.
```

Si no lo ejecutas, las cotizaciones viejas darán error al abrirse. Repetirlo no hace daño.

### Paso 6 — Prueba en tu computadora
En una terminal:
```bash
npm run server
```
Debe decir `🚀 Servidor AB Technology en el puerto 3000`. Abre `http://localhost:3000` en el navegador: ahí está la aplicación completa.

En **otra** terminal, para ver la versión de escritorio:
```bash
npm start
```

### Paso 7 — Publica en Render
1. Sube los cambios a GitHub:
   ```bash
   git add .
   git commit -m "Version 2: datos de cliente, formas de pago, PDF nuevo"
   git push
   ```
2. En el panel de Render, entra a tu servicio → **Environment** y agrega la variable `API_KEY` con exactamente el mismo valor que pusiste en tu `.env`.
3. Render vuelve a desplegar solo. Cuando termine, revisa que `https://tu-servicio.onrender.com/health` responda `{"ok":true,...}`.

> **Ojo con el plan gratuito de Render:** el servicio se duerme tras 15 minutos sin uso y la primera petición puede tardar 50 segundos. Si la app arranca lenta, es eso. Se resuelve con el plan pago o con un servicio que haga ping cada 10 minutos.

### Paso 8 — Configura la app
Abre la aplicación y entra a **Configuración**:

1. **Conexión** → escribe la dirección de tu servicio de Render y la clave de acceso (`API_KEY`). Pulsa *Probar conexión*.
2. **Empresa** → completa razón social, RIF, teléfono, correo, web y dirección. Esto es lo que sale en el encabezado del PDF.
3. **Valores por defecto** → prefijo del folio, IVA, validez, moneda y condiciones de pago habituales. Se cargan solos en cada cotización nueva.
4. **Formas de pago** → revisa la cuenta Banesco que quedó cargada (agrega el titular) y añade las demás: pago móvil, Zelle, efectivo, etc.
5. Pulsa **Guardar configuración**.

### Paso 9 — Genera el instalador
```bash
npm run build
```
El `.exe` queda en la carpeta `dist/`.

---

## 4. Cómo se usa el día a día

1. Completa los datos del cliente (solo el nombre es indispensable).
2. Carga los ítems. **Enter** en el precio agrega una línea nueva.
3. Marca IVA, descuento, nota BCV y las formas de pago que quieras mostrar.
4. **Ctrl + S** o el botón amarillo para guardar.
5. En el archivo de abajo: **PDF**, **Editar**, **Duplicar**, **Borrar** o cambiar el estado desde la lista desplegable.

---

## 5. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| "Sin conexión" en la barra superior | Render dormido o dirección mal escrita | Espera 1 minuto; revisa Configuración → Conexión |
| "No autorizado" | La clave de la app no coincide con `API_KEY` de Render | Vuelve a escribirla en Configuración → Conexión |
| Cotizaciones viejas dan error | Falta la migración | `npm run migrar` |
| El PDF sale sin logo | `NLOGO.png` no está en `public/` | Copia el archivo ahí y vuelve a desplegar |
| `MONGO_URI` no definida | Falta el `.env` o la variable en Render | Revisa el paso 3 y el paso 7 |
| El instalador no toma el ícono | Falta `icono.ico` en la raíz | Cópialo y ejecuta `npm run build` de nuevo |

---

## 6. Seguridad

- Me compartiste tu archivo `.env` con la cadena de conexión de MongoDB. Por precaución, cambia la contraseña del usuario en **Atlas → Database Access → Edit → Edit Password** y actualiza `MONGO_URI` en tu `.env` y en Render.
- En **Atlas → Network Access**, si tienes `0.0.0.0/0` (acceso desde cualquier IP), déjalo solo mientras uses Render; es lo que exige su plan gratuito, pero por eso la contraseña debe ser larga.
- El `.env` nunca debe subirse a GitHub. Ya está en `.gitignore`.

---

## 7. Ideas para la siguiente versión

- Catálogo de productos y de clientes frecuentes (para no volver a escribirlos).
- Envío del PDF por correo o WhatsApp desde la misma app.
- Conversión de cotización aprobada en nota de entrega o factura.
- Reportes: monto cotizado vs. aprobado por mes.
- Usuarios con contraseña, si más personas van a usar el sistema.
- Tasa BCV cargada automáticamente desde una fuente en línea.
