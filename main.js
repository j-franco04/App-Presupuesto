const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

let ventana;

function crearVentana() {
    ventana = new BrowserWindow({
        width: 1280,
        height: 880,
        minWidth: 1000,
        title: 'AB TECHNOLOGY BY — Sistema de Cotizaciones',
        icon: path.join(__dirname, 'icono.ico'),
        backgroundColor: '#EFEEEA',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    ventana.loadFile(path.join(__dirname, 'public', 'index.html'));

    // Los PDF y enlaces externos se abren en el navegador del sistema,
    // no en una ventana vacía de la aplicación.
    ventana.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    ventana.on('closed', () => { ventana = null; });
}

const menu = Menu.buildFromTemplate([
    {
        label: 'Archivo',
        submenu: [
            { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => ventana && ventana.reload() },
            { type: 'separator' },
            { label: 'Salir', role: 'quit' }
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
    }
]);

app.whenReady().then(() => {
    Menu.setApplicationMenu(menu);
    crearVentana();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) crearVentana();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
