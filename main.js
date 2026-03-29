const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
    // Iniciamos el proceso del servidor
    serverProcess = fork(path.join(__dirname, 'server.js'));

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

    // Intentar cargar hasta que el servidor responda
    const loadApp = () => {
        mainWindow.loadURL('http://localhost:3000').catch(() => {
            setTimeout(loadApp, 500); 
        });
    };

    loadApp();

    mainWindow.on('closed', () => {
        if (serverProcess) serverProcess.kill();
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (serverProcess) serverProcess.kill();
        app.quit();
    }
});