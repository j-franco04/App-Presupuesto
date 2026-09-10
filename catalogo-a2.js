/**
 * catalogo-a2.js — Carga la lista de precios de a2 Softway en el catálogo.
 *
 *   npm run catalogo             → agrega los productos de a2 que falten
 *   npm run catalogo -- borrar   → borra TODO el catálogo y lo carga de nuevo
 *
 * Fuente: https://a2.com.ve/productos/lista-de-precios/
 * Precios P.V.P. CON IVA INCLUIDO, en euros, publicados con fecha Jun 2024.
 * Verifica la página antes de cotizar: a2 los actualiza sin avisar.
 * También puedes actualizarlos desde la app: Configuración → Catálogo → Importar.
 */
require('dotenv').config();
const { mongoose, Producto, conectar } = require('./models');

const LISTA = [
    ['Aplicaciones', 'a2 Punto de Venta Configurable', 152.31],
    ['Aplicaciones', 'a2 VPos (requiere a2 Punto de Venta Configurable)', 288.55],
    ['Aplicaciones', 'a2 Android Commander (hasta 5 Móviles)', 333.50],
    ['Aplicaciones', 'a2 Android Commander (hasta 10 Móviles)', 478.50],
    ['Aplicaciones', 'a2 Android Commander (+ 10 Móviles)', 623.50],
    ['Aplicaciones', 'a2 Android Food (requiere a2 A&B)', 150.38],
    ['Aplicaciones', 'a2 Panel de Botones adicionales para a2 Pto de Venta Configurable', 86.66],
    ['Aplicaciones', 'a2 Punto de Venta Configurable Alimentos y Bebidas (1 Caja o 1 Toma de Comanda)', 83.87],
    ['Aplicaciones', 'a2 Comandas Alimentos y Bebidas', 83.87],
    ['Aplicaciones', 'a2 Administrativo Básico + 1 a2 Punto de Venta', 319.26],
    ['Aplicaciones', 'a2 Herramienta Administrativa Configurable', 630.70],
    ['Aplicaciones', 'a2 Herramienta Administrativa Configurable + 1 a2 Punto de Venta', 783.01],
    ['Aplicaciones', 'a2 Imprenta Digital (requiere a2 HAC – a2 Básico – a2 Punto de Venta)', 288.55],
    ['Aplicaciones', 'a2 Contabilidad', 358.46],
    ['Aplicaciones', 'a2 Nómina', 431.37],
    ['Aplicaciones', 'a2 Alimentos y Bebidas + 2 Puntos de Venta (1 Caja y 1 Toma de Comanda)', 300.75],
    ['Aplicaciones', 'a2 Hotel', 267.89],
    ['Aplicaciones', 'a2 Suite Alimentos y Bebidas (HAC + Pto + A&B + Contabilidad + Nómina)', 1311.52],
    ['Aplicaciones', 'a2 Suite Administrativa (HAC + Pto de Venta + Contabilidad + Nómina)', 1100.99],
    ['Aplicaciones', 'a2 Administrativo-Contable (HAC + Pto de Venta + Contabilidad)', 791.34],
    ['Aplicaciones', 'a2 Suite Hotel (HAC + Pto + Hotel + A&B + Contabilidad + Nómina)', 1594.86],
    ['Aplicaciones', 'a2 Restaurante (HAC + A&B)', 652.02],
    ['Aplicaciones', 'a2 Herramienta Administrativa Configurable + 1 a2 Punto de Venta + a2 Hotel', 893.27],
    ['Aplicaciones', 'a2 Herramienta Administrativa Configurable + 1 a2 Punto de Venta + a2 Nómina', 1032.21],
    ['Aplicaciones', 'a2 Herramienta Administrativa Configurable + 1 a2 Punto de Venta + a2 RMA', 751.17],
    ['Aplicaciones', 'a2 Módulo de Sucursales para una (1) Oficina Principal - Casa Matriz', 144.23],
    ['Aplicaciones', 'a2 Módulo de Sucursales para una (1) Sucursal', 81.41],
    ['Aplicaciones', 'a2 Módulo RMA (Garantías & Servicios)', 100.72],
    ['Aplicaciones', 'a2 Módulo de Compras Internacionales', 117.28],
    ['Aplicaciones', 'a2 Manager Punto de Ventas Hasta 3 Puntos de Ventas', 82.42],
    ['Aplicaciones', 'a2 Manager Punto de Ventas Hasta 6 Puntos de Ventas', 116.06],
    ['Aplicaciones', 'a2 Manager Punto de Ventas Hasta 9 Puntos de Ventas', 149.70],
    ['Aplicaciones', 'a2 Manager Punto de Ventas más de 9 Puntos de Ventas', 183.34],

    ['Renovaciones', 'Renovación de Licencia (Básico, Herramienta, Contabilidad, Nómina, Hotel y A&B)', 155.60],
    ['Renovaciones', 'Renovación de Licencia a2 Punto de Venta, a2 POS (A&B)', 33.94],
    ['Renovaciones', 'Renovación a2 Manager de Punto de Venta', 33.94],

    ['Actualizaciones', 'Actualización Manager Punto de Venta de 3 hasta 6 Puntos de Venta', 33.64],
    ['Actualizaciones', 'Actualización Manager Punto de Venta de 6 hasta 9 Puntos de Venta', 33.64],
    ['Actualizaciones', 'Actualización Manager Punto de Venta más de 9 Puntos de Venta', 33.64],
    ['Actualizaciones', 'Actualización a2 Administrativo Básico a a2 HAC + a2 Pto de Venta', 463.76]
];

(async () => {
    try {
        await conectar(process.env.MONGO_URI);
        const borrar = process.argv.includes('borrar');

        if (borrar) {
            const n = await Producto.deleteMany({});
            console.log(`🗑️  Catálogo anterior borrado (${n.deletedCount} productos).`);
        }

        const existentes = await Producto.countDocuments();
        let nuevos = 0, saltados = 0;

        for (let i = 0; i < LISTA.length; i++) {
            const [categoria, nombre, precio] = LISTA[i];
            const yaEsta = await Producto.findOne({ nombre });
            if (yaEsta) { saltados++; continue; }

            await Producto.create({
                nombre, categoria, precio,
                moneda: '€',
                incluye_iva: true,     // los precios de a2 ya traen el IVA
                unidad: 'Und',
                activo: true,
                orden: existentes + i
            });
            nuevos++;
        }

        console.log(`✅ Productos agregados: ${nuevos}`);
        if (saltados) console.log(`↔️  Ya existían (no se tocaron): ${saltados}`);
        console.log(`📦 Total en el catálogo: ${await Producto.countDocuments()}`);
        console.log('\n⚠️  Recuerda: son precios CON IVA incluido, en euros, fecha Jun 2024.');
        console.log('   Verifica la lista en https://a2.com.ve/productos/lista-de-precios/');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
})();
