/**
 * main.js — Aplicación de escritorio AB TECHNOLOGY BY
 *
 * La app abre el sistema publicado en internet (Render). No necesita terminal
 * ni comandos: se instala y se usa. La dirección del servidor se puede cambiar
 * desde el menú "Servidor" y queda guardada en el equipo.
 */
const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Dirección que se usa la primera vez. Se puede cambiar desde el menú.
const SERVIDOR_POR_DEFECTO = 'https://servidorpresupuestos.onrender.com';

let ventana;
const archivoConfig = () => path.join(app.getPath('userData'), 'config.json');

function leerConfig() {
    try { return JSON.parse(fs.readFileSync(archivoConfig(), 'utf8')); } catch (e) { return {}; }
}
function guardarConfig(obj) {
    try { fs.writeFileSync(archivoConfig(), JSON.stringify(obj, null, 2)); } catch (e) { console.error(e); }
}
function servidor() {
    return String(leerConfig().servidor || SERVIDOR_POR_DEFECTO).replace(/\/+$/, '');
}

function pantallaLocal(estado, msg) {
    if (!ventana) return;
    ventana.loadFile(path.join(__dirname, 'conexion.html'), {
        query: { estado: estado, msg: msg || '', servidor: servidor() }
    });
}

function crearVentana() {
    ventana = new BrowserWindow({
        width: 1280,
        height: 880,
        minWidth: 1000,
        title: 'AB TECHNOLOGY BY — Sistema de Cotizaciones',
        icon: path.join(__dirname, 'icono.ico'),
        backgroundColor: '#141414',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    ventana.once('ready-to-show', () => ventana.show());
    pantallaLocal('cargando');

    // Los PDF y enlaces externos se abren en el navegador del sistema.
    ventana.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Si el servidor no responde, se muestra la pantalla de reintento.
    ventana.webContents.on('did-fail-load', (evento, codigo, descripcion, url, esPrincipal) => {
        if (!esPrincipal || codigo === -3) return;   // -3 = carga cancelada, no es un error real
        pantallaLocal('error', descripcion || ('Código ' + codigo));
    });

    ventana.on('closed', () => { ventana = null; });
}

/* ---------- Comunicación con la pantalla de conexión ---------- */
ipcMain.handle('servidor:leer', () => servidor());

ipcMain.handle('servidor:conectar', () => {
    if (ventana) ventana.loadURL(servidor());
});

ipcMain.handle('servidor:guardar', (evento, direccion) => {
    const limpia = String(direccion || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+/i.test(limpia)) return { ok: false, error: 'La dirección debe empezar por http:// o https://' };
    const cfg = leerConfig();
    cfg.servidor = limpia;
    guardarConfig(cfg);
    if (ventana) ventana.loadURL(limpia);
    return { ok: true };
});

/* ---------- Menú ---------- */
function construirMenu() {
    return Menu.buildFromTemplate([
        {
            label: 'Archivo',
            submenu: [
                { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => ventana && ventana.reload() },
                { type: 'separator' },
                { label: 'Salir', role: 'quit' }
            ]
        },
        {
            label: 'Servidor',
            submenu: [
                { label: 'Cambiar dirección del servidor…', click: () => pantallaLocal('config') },
                { label: 'Reconectar', click: () => ventana && ventana.loadURL(servidor()) },
                { type: 'separator' },
                { label: 'Abrir en el navegador', click: () => shell.openExternal(servidor()) }
            ]
        },
        {
            label: 'Ver',
            submenu: [
                { label: 'Acercar', role: 'zoomIn' },
                { label: 'Alejar', role: 'zoomOut' },
                { label: 'Tamaño normal', role: 'resetZoom' },
                { type: 'separator' },
                { label: 'Pantalla completa', role: 'togglefullscreen' },
                { label: 'Herramientas de desarrollo', accelerator: 'F12', role: 'toggleDevTools' }
            ]
        },
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Acerca de',
                    click: () => dialog.showMessageBox(ventana, {
                        type: 'info',
                        title: 'AB Technology Cotizaciones',
                        message: 'AB TECHNOLOGY BY — Sistema de Cotizaciones',
                        detail: 'Versión ' + app.getVersion() + '\nServidor: ' + servidor()
                    })
                }
            ]
        }
    ]);
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(construirMenu());
    crearVentana();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) crearVentana();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
