const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 850,
        title: "AB TECHNOLOGY BY - Sistema de Presupuestos",
        icon: path.join(__dirname, 'NLOGO.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // En lugar de esperar a localhost, cargamos el archivo local directamente
    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Opcional: Quitar el menú superior para que parezca una app más limpia
    // mainWindow.setMenu(null);
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});