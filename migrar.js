/**
 * migrar.js — Convierte los presupuestos guardados con la versión 1
 * al nuevo formato (cliente como objeto, estados, unidades, etc.)
 * y crea la configuración inicial de la empresa.
 *
 * Se ejecuta UNA sola vez:   npm run migrar
 * Es seguro repetirlo: no vuelve a tocar lo ya convertido.
 */
require('dotenv').config();
const { mongoose, Config, conectar } = require('./models');

(async () => {
    try {
        await conectar(process.env.MONGO_URI);
        const col = mongoose.connection.collection('presupuestos');

        const docs = await col.find({}).toArray();
        console.log(`📄 Presupuestos encontrados: ${docs.length}`);

        let convertidos = 0;
        for (const d of docs) {
            const set = {};

            if (typeof d.cliente === 'string' || d.cliente === undefined || d.cliente === null) {
                set.cliente = {
                    nombre: (typeof d.cliente === 'string' && d.cliente.trim()) || 'CLIENTE GENERAL',
                    rif: '', direccion: '', telefono: '', email: '', contacto: ''
                };
            }
            if (!d.estado) set.estado = 'enviado';
            if (d.bruto === undefined) set.bruto = d.subtotal || 0;
            if (d.descuento_tipo === undefined) { set.descuento_tipo = 'porcentaje'; set.descuento_valor = 0; set.descuento_monto = 0; }
            if (d.iva_porcentaje === undefined) set.iva_porcentaje = d.con_iva ? 16 : 0;
            if (d.validez_dias === undefined) set.validez_dias = 15;
            if (d.tasa_bcv === undefined) set.tasa_bcv = 0;
            if (d.condiciones_pago === undefined) set.condiciones_pago = '';
            if (d.tiempo_entrega === undefined) set.tiempo_entrega = '';
            if (!Array.isArray(d.metodos_pago)) set.metodos_pago = [];
            if (Array.isArray(d.items)) {
                set.items = d.items.map(i => ({
                    producto: i.producto || '',
                    unidad: i.unidad || 'Und',
                    cantidad: Number(i.cantidad) || 0,
                    precio: Number(i.precio) || 0,
                    total: (Number(i.cantidad) || 0) * (Number(i.precio) || 0)
                }));
            }

            if (Object.keys(set).length) {
                await col.updateOne({ _id: d._id }, { $set: set });
                convertidos++;
            }
        }
        console.log(`✅ Registros actualizados: ${convertidos}`);

        // --- Configuración inicial ---
        let cfg = await Config.findById('config');
        if (!cfg) cfg = new Config({ _id: 'config' });

        if (!cfg.metodos_pago || cfg.metodos_pago.length === 0) {
            cfg.metodos_pago = [{
                nombre: 'Banesco (Cuenta Corriente)',
                tipo: 'Transferencia',
                banco: 'Banesco',
                titular: '',
                documento: 'V-19679228',
                numero: '0134-0086-58-0861267364',
                detalle: '',
                activo: true,
                orden: 0
            }];
            console.log('💳 Forma de pago inicial creada (Banesco). Revísala en Configuración.');
        }
        await cfg.save();
        console.log('✅ Configuración lista.');

        await mongoose.disconnect();
        console.log('🎉 Migración terminada.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error en la migración:', err.message);
        process.exit(1);
    }
})();
