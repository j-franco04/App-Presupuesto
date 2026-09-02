# Cómo dejar la app funcionando sin comandos

## Antes de empezar: un problema serio en Render

Tu servidor de Render está conectado a **otra base de datos**, distinta a la que migraste.

| | Tu computadora (donde migraste) | Render |
|---|---|---|
| Clúster | `apppresupuestos.hohig76.mongodb.net` | `...tfyu7ho.mongodb.net` (Cluster0) |
| Usuario | `AppPresupuestos_db` | `javierfranco04_db_user` |
| replicaSet | `atlas-9diyfn-shard-0` | `atlas-nknmat-shard-0` |

Son dos clústeres diferentes. Si publicas así, la app abrirá una base distinta a la que tiene tus 11 cotizaciones ya convertidas.

**Averigua cuál tiene tus datos buenos.** En Atlas → **Browse Collections**, revisa la colección `presupuestos` de cada clúster:

- El clúster migrado tiene el campo `cliente` como un **objeto** (`cliente: {nombre: "...", rif: "..."}`) y además dos colecciones nuevas: `ab_config` y `ab_contadores`.
- El clúster sin migrar tiene `cliente` como **texto simple** (`cliente: "Nombre del cliente"`).

Después iguala las cadenas: copia el `MONGO_URI` de tu archivo `.env` local y pégalo en Render (Environment → Edit → MONGO_URI). Si el otro clúster también tiene cotizaciones que necesitas, avísame antes de tocar nada y las unimos.

> En Render puedes usar la cadena normal `mongodb+srv://`; allá el DNS sí funciona. La versión larga sin SRV úsala solo en tu PC.

**Y cambia otra vez la contraseña de Atlas.** En la captura que compartiste se veía completa. Atlas → Database Access → Edit → Edit Password. Actualízala en tu `.env` y en Render.

---

## 1. Publica el servidor (una sola vez)

1. Sube el código:
   ```bash
   git add .
   git commit -m "Version 2"
   git push
   ```
2. En Render → tu servicio → **Settings**, verifica:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Root Directory:** vacío
3. En **Environment** deben estar `MONGO_URI` (la corregida) y `API_KEY`. La variable `PORT` puedes borrarla; Render la asigna sola y el código ya la respeta.
4. Espera el despliegue y comprueba en el navegador que `https://TU-SERVICIO.onrender.com/health` responda `{"ok":true,...}`.

**Anota la dirección exacta de tu servicio.** En el código dejé `https://servidorpresupuestos.onrender.com`, deducida del nombre que vi. Si la tuya es otra, no importa: se cambia desde la app sin tocar código.

---

## 2. Ya la tienes como página web

Con eso listo, abre `https://TU-SERVICIO.onrender.com` en cualquier navegador, de cualquier equipo o teléfono. La primera vez entra a **Configuración → Conexión** y escribe la `API_KEY`. Ya está: es la misma app.

---

## 3. Instálala como programa de escritorio

Reemplaza `main.js` y `package.json`, y agrega los archivos nuevos `preload.js` y `conexion.html`. Después:

```bash
npm install
npm run build
```

En la carpeta `dist/` aparece **AB-Technology-Cotizaciones-Instalador-2.0.0.exe**. Ejecútalo y tendrás el acceso directo en el escritorio y en el menú inicio. Desde ahí se abre como cualquier programa: sin terminal, sin `npm start`, sin `npm run server`.

### Cómo funciona ahora
La aplicación de escritorio ya no carga la página desde el disco: abre directamente tu servidor publicado. Por eso no necesita comandos. Es la misma app que ves en el navegador, pero en su propia ventana, con su ícono y su acceso directo.

Al abrirla verás una pantalla negra de "Conectando…". Si el servidor no responde, aparece un botón para reintentar y otro para corregir la dirección. En el menú **Servidor → Cambiar dirección** puedes ponerla en cualquier momento; queda guardada en ese equipo.

### Para instalarla en otra PC
Copia el `.exe` y ejecútalo. Al abrirse, si la dirección por defecto no es la tuya, entra a **Servidor → Cambiar dirección**, escribe la de Render, y luego en **Configuración → Conexión** carga la `API_KEY`. Nada más: ni Node, ni instalar dependencias.

---

## 4. Lo que debes saber del plan gratuito de Render

El servicio se duerme tras 15 minutos sin uso, y la primera apertura del día puede tardar unos 50 segundos. Por eso la pantalla de carga avisa. Tienes tres caminos:

- **Aceptarlo.** Solo afecta a la primera apertura.
- **Mantenerlo despierto gratis.** Crea una cuenta en cron-job.org y programa una visita a `https://TU-SERVICIO.onrender.com/health` cada 10 minutos. El plan gratuito da 750 horas al mes, suficiente para tenerlo activo todo el mes.
- **Pagar el plan Starter** (unos 7 USD al mes) y olvidarte del tema.

---

## 5. Si prefieres trabajar sin internet

La app siempre necesita conexión, porque la base de datos está en MongoDB Atlas, que es un servicio en la nube. Si algún día quieres que funcione sin internet, hay que cambiar a una base local en el propio equipo; eso sería otra versión y los datos dejarían de compartirse entre computadoras. Dímelo si te interesa evaluarlo.
