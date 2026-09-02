/**
 * preload.js — Puente seguro entre la pantalla de conexión y la aplicación.
 * Solo expone tres funciones; el resto del sistema queda aislado.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ab', {
    leerServidor:   () => ipcRenderer.invoke('servidor:leer'),
    conectar:       () => ipcRenderer.invoke('servidor:conectar'),
    guardarServidor: (direccion) => ipcRenderer.invoke('servidor:guardar', direccion)
});
