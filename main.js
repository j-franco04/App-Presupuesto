const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
    // 1. Iniciar el servidor de Node automáticamente (tu server.js)
    serverProcess = fork(path.join(__dirname, 'server.js'));

    // 2. Crear la ventana del navegador
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'NLOGO.png'), // Tu logo como icono
        webPreferences: {
            nodeIntegration: false
        }
    });

    // 3. Cargar la interfaz (esperamos un poco a que el server inicie)
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 1000);

    mainWindow.on('closed', () => {
        if (serverProcess) serverProcess.kill();
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});