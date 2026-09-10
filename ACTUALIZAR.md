# Cómo actualizar tu app a esta versión

Tiempo estimado: 20 minutos. Hazlo en este orden; si cambias el orden, la app de escritorio va a seguir mostrando la versión vieja.

---

## Resumen de lo que vas a hacer

1. Respaldar lo que tienes.
2. Copiar los archivos nuevos en tu carpeta.
3. Instalar dependencias.
4. Probar en tu computadora.
5. Publicar en Render (así se actualiza **la versión web**).
6. Cargar la lista de precios de a2.
7. Generar el instalador (así se actualiza **la versión de escritorio**).

---

## Paso 1 — Respalda

Con git (recomendado), en la terminal dentro de `C:\presupuestos-app`:

```bash
git add .
git commit -m "Respaldo antes de actualizar"
```

Si no usas git todavía, copia la carpeta completa a otro lado y ponle `presupuestos-app-respaldo`.

---

## Paso 2 — Copia los archivos

**Reemplaza estos** (sobrescribe los que ya tienes):

| Archivo | Dónde va |
|---|---|
| `models.js` | raíz |
| `server.js` | raíz |
| `pdf.js` | raíz |
| `main.js` | raíz |
| `package.json` | raíz |
| `index.html` | dentro de `public/` |

**Agrega estos, que son nuevos:**

| Archivo | Dónde va | Para qué sirve |
|---|---|---|
| `preload.js` | raíz | Puente seguro de la app de escritorio |
| `conexion.html` | raíz | Pantalla de conexión y reintento |
| `catalogo-a2.js` | raíz | Carga la lista de precios de a2 |

Verifica que la carpeta quede así:

```
presupuestos-app/
├── main.js  preload.js  conexion.html
├── server.js  models.js  pdf.js
├── migrar.js  catalogo-a2.js
├── package.json  .env  .gitignore  icono.ico
└── public/
    ├── index.html
    └── NLOGO.png
```

---

## Paso 3 — Instala dependencias

```bash
npm install
```

---

## Paso 4 — Prueba en tu computadora

```bash
npm run server
```

Abre `http://localhost:3000`. Deberías ver arriba del formulario dos pestañas nuevas: **Cotización** y **Nota de entrega**. Si aparecen, la actualización quedó bien.

No hace falta volver a migrar: las cotizaciones viejas se siguen leyendo tal cual.

Detén el servidor con `Ctrl+C` cuando termines de mirar.

---

## Paso 5 — Publica la versión web

```bash
git add .
git commit -m "Notas de entrega y catálogo de productos"
git push
```

Render detecta el cambio y vuelve a desplegar solo; tarda unos minutos. Cuando termine, abre `https://servidorpresupuestos.onrender.com` y confirma que aparecen las pestañas nuevas.

**Con esto la versión web ya quedó actualizada**, en cualquier computadora o teléfono. No hay que hacer nada más en cada equipo.

---

## Paso 6 — Carga la lista de precios de a2

Hazlo **desde la app publicada**, no desde tu PC. Así los productos entran seguro en la base de datos correcta.

1. Abre `https://servidorpresupuestos.onrender.com`.
2. Entra a **Configuración → Catálogo**.
3. En otra pestaña abre `https://a2.com.ve/productos/lista-de-precios/`, selecciona la tabla completa con el mouse y cópiala con `Ctrl+C`.
4. Pega en el recuadro grande de la app.
5. Deja las opciones así: **Reemplazar todo el catálogo**, moneda **€ Euros**, casilla **Precios con IVA incluido** marcada.
6. Pulsa **Importar**. Debe decir "Importados 40 productos".
7. Pulsa **Guardar catálogo**.

Cuando a2 cambie los precios, repites estos mismos pasos: copiar, pegar, importar en modo reemplazar.

También puedes agregar tus propios productos y servicios en esa misma pantalla, con el botón *+ Agregar producto*. Por ejemplo "Instalación de cámara Hikvision" a 35 $. A esos déjales la casilla IVA **desmarcada**, porque tus precios no lo incluyen.

> Si prefieres la terminal, existe `npm run catalogo`, que carga los 40 productos de a2. Pero cuidado: escribe en la base a la que apunte tu `.env` local, que debe ser la misma de Render.

---

## Paso 7 — Actualiza la versión de escritorio

```bash
npm run build
```

En `dist/` aparece **AB-Technology-Cotizaciones-Instalador-2.0.0.exe**. Ejecútalo e instala encima de la versión anterior.

Para las otras computadoras, copia ese mismo `.exe` y ejecútalo allá.

### Un detalle que te va a ahorrar trabajo a futuro

La app de escritorio abre el sistema publicado en Render. Eso significa que **de aquí en adelante, cuando yo cambie el formulario, el PDF o cualquier función, solo tienes que hacer `git push`**: todas las computadoras ven la versión nueva al abrir la app, sin reinstalar nada.

Solo hay que volver a generar el `.exe` cuando cambien `main.js`, `preload.js` o `conexion.html`, que es lo que va dentro del programa. Esta vez toca porque `main.js` cambió.

---

## Lo nuevo que vas a encontrar

### Notas de entrega
Arriba del formulario, dos pestañas: Cotización y Nota de entrega. En el archivo, cada cotización tiene un botón **→ Nota** que crea la nota de entrega copiando todo y la abre para que escribas el detalle del trabajo. La cotización original no se toca.

Las notas llevan su propia numeración (`NE-2026-0001`), estados propios (Entregada, Pagada) y en el PDF salen las líneas de firma "Entregado por" y "Recibido conforme".

### Catálogo de productos
Junto a *+ Agregar ítem* hay un botón **🔍 Buscar en el catálogo**. Escribes "hotel", "punto de venta" o "renovación" y la lista se filtra sola. Haces clic y el producto se carga en la línea.

**Sobre el IVA, que es lo delicado:** los precios de a2 son P.V.P. **con IVA incluido**. Si cotizas con IVA aparte y cargaras el precio tal cual, se lo estarías cobrando dos veces al cliente. La app lo resuelve: cuando tienes "Aplicar IVA" activado, descuenta el impuesto antes de cargar la línea. Un a2 Contabilidad de €358,46 entra como €309,02, y al sumarle el 16% vuelve a dar €358,46 exactos. Si no tienes IVA activado, carga el precio tal como está en la lista.

El buscador te avisa en amarillo cuál de los dos casos está aplicando, para que no quede duda.

**Un aviso sobre la moneda:** la lista de a2 está en euros. Si tu cotización está en dólares y agregas un producto en euros, la app te lo advierte pero **no convierte**. Revisa ese precio a mano o cambia la moneda de la cotización a euros.

---

## Si algo sale mal

| Síntoma | Solución |
|---|---|
| La app de escritorio muestra la versión vieja | Falta el `git push` del paso 5, o Render aún está desplegando |
| "El catálogo está vacío" | Falta el paso 6 |
| Al importar dice que no reconoció productos | Copiaste solo texto suelto; selecciona la tabla completa desde la web |
| Precios importados con valores raros | Revisa si quedó marcada la moneda correcta y vuelve a importar en modo reemplazar |
| Error al abrir cotizaciones viejas | `npm run migrar` |
