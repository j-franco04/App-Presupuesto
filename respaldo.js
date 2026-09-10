/**
 * respaldo.js — Copia de seguridad de la base de datos.
 *
 *   npm run respaldo
 *      Guarda todo (cotizaciones, notas, configuración, catálogo, contadores)
 *      en un archivo JSON dentro de la carpeta 'respaldos'.
 *
 *   node respaldo.js restaurar respaldos/respaldo-2026-09-10.json CONFIRMAR
 *      Borra lo que haya en la base y vuelve a cargar ese archivo.
 *      La palabra CONFIRMAR es obligatoria: evita restaurar por accidente.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { mongoose, conectar } = require('./models');

const COLECCIONES = ['presupuestos', 'ab_config', 'ab_contadores', 'ab_catalogo'];
const CARPETA = path.join(__dirname, 'respaldos');

async function respaldar() {
    if (!fs.existsSync(CARPETA)) fs.mkdirSync(CARPETA);

    const datos = { fecha: new Date().toISOString(), version: 2, colecciones: {} };
    let total = 0;

    for (const nombre of COLECCIONES) {
        const docs = await mongoose.connection.collection(nombre).find({}).toArray();
        datos.colecciones[nombre] = docs;
        total += docs.length;
        console.log(`   ${nombre}: ${docs.length} registros`);
    }

    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const archivo = path.join(CARPETA, `respaldo-${sello}.json`);
    fs.writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');

    const kb = (fs.statSync(archivo).size / 1024).toFixed(1);
    console.log(`\n✅ Respaldo guardado: ${archivo}  (${total} registros, ${kb} KB)`);
    console.log('   Guarda una copia fuera de esta computadora: correo, Drive o pendrive.');
}

async function restaurar(archivo) {
    if (!fs.existsSync(archivo)) throw new Error('No existe el archivo ' + archivo);
    const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (!datos.colecciones) throw new Error('El archivo no tiene el formato esperado.');

    console.log(`⚠️  Restaurando el respaldo del ${new Date(datos.fecha).toLocaleString()}`);

    for (const [nombre, docs] of Object.entries(datos.colecciones)) {
        const col = mongoose.connection.collection(nombre);
        await col.deleteMany({});
        if (docs.length) {
            // Las fechas vuelven a ser fechas, no texto
            docs.forEach(d => {
                ['fecha', 'actualizado'].forEach(c => { if (d[c]) d[c] = new Date(d[c]); });
            });
            await col.insertMany(docs);
        }
        console.log(`   ${nombre}: ${docs.length} registros restaurados`);
    }
    console.log('\n✅ Restauración terminada.');
}

(async () => {
    try {
        await conectar(process.env.MONGO_URI);

        if (process.argv[2] === 'restaurar') {
            const archivo = process.argv[3];
            if (!archivo) throw new Error('Indica el archivo: node respaldo.js restaurar respaldos/archivo.json CONFIRMAR');
            if (process.argv[4] !== 'CONFIRMAR') {
                throw new Error('Falta la palabra CONFIRMAR al final. Restaurar BORRA los datos actuales.');
            }
            await restaurar(archivo);
        } else {
            console.log('📦 Generando respaldo…');
            await respaldar();
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
})();
