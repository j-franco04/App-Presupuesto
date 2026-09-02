/**
 * server.js — API del sistema de presupuestos
 * AB TECHNOLOGY BY, C.A.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const {
    Presupuesto, Config, conectar, obtenerConfig, siguienteNumero
} = require('./models');
const { generarPDF } = require('./pdf');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* =========================================================
   SEGURIDAD (opcional pero recomendada)
   Si defines API_KEY en el archivo .env, la API queda
   protegida. Si la dejas vacía, funciona abierta como antes.
   ========================================================= */
const API_KEY = (process.env.API_KEY || '').trim();

function auth(req, res, next) {
    if (!API_KEY) return next();
    const clave = req.get('x-api-key') || req.query.key || '';
    if (clave === API_KEY) return next();
    return res.status(401).json({ error: 'No autorizado. Revisa la clave de acceso en Configuración.' });
}

/* =========================================================
   UTILIDADES DE CÁLCULO
   El servidor SIEMPRE recalcula los montos: así el total
   guardado nunca puede ser manipulado ni quedar desfasado.
   ========================================================= */
const num = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
/** Convierte 'AAAA-MM-DD' a mediodía UTC para que la fecha no se corra un día. */
function parseFecha(v) {
    if (!v) return new Date();
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T12:00:00Z');
    const d = new Date(v);
    return isNaN(d.getTime()) ? new Date() : d;
}
const txt = (v, max = 500) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);

function normalizar(body, cfg) {
    const items = (Array.isArray(body.items) ? body.items : [])
        .map(i => {
            const cantidad = num(i.cantidad);
            const precio = num(i.precio);
            return {
                producto: txt(i.producto, 1000),
                unidad: txt(i.unidad, 20) || 'Und',
                cantidad, precio,
                total: r2(cantidad * precio)
            };
        })
        .filter(i => i.producto !== '' || i.cantidad !== 0 || i.precio !== 0);

    const bruto = r2(items.reduce((a, i) => a + i.cantidad * i.precio, 0));

    const descuento_tipo = body.descuento_tipo === 'monto' ? 'monto' : 'porcentaje';
    let descuento_valor = Math.max(0, num(body.descuento_valor));
    if (descuento_tipo === 'porcentaje') descuento_valor = Math.min(descuento_valor, 100);

    let descuento_monto = descuento_tipo === 'porcentaje'
        ? bruto * descuento_valor / 100
        : Math.min(descuento_valor, bruto);
    descuento_monto = r2(descuento_monto);

    const subtotal = r2(bruto - descuento_monto);
    const con_iva = !!body.con_iva;
    const iva_porcentaje = con_iva
        ? Math.max(0, Math.min(100, num(body.iva_porcentaje ?? cfg.iva_porcentaje ?? 16)))
        : 0;
    const iva = r2(subtotal * iva_porcentaje / 100);
    const total = r2(subtotal + iva);

    // Métodos de pago: se copian desde la configuración según los ids seleccionados
    const seleccion = Array.isArray(body.metodos_pago_ids) ? body.metodos_pago_ids.map(String) : [];
    const metodos_pago = (cfg.metodos_pago || [])
        .filter(m => seleccion.includes(String(m._id)))
        .map(m => ({
            origen_id: String(m._id),
            nombre: m.nombre, tipo: m.tipo, banco: m.banco,
            titular: m.titular, documento: m.documento,
            numero: m.numero, detalle: m.detalle
        }));

    const moneda = ['$', '€'].includes(body.moneda) ? body.moneda : '$';
    const estados = ['borrador', 'enviado', 'aprobado', 'rechazado', 'anulado'];

    return {
        estado: estados.includes(body.estado) ? body.estado : 'borrador',
        cliente: {
            nombre: txt(body.cliente && body.cliente.nombre, 200) || 'CLIENTE GENERAL',
            rif: txt(body.cliente && body.cliente.rif, 40),
            direccion: txt(body.cliente && body.cliente.direccion, 400),
            telefono: txt(body.cliente && body.cliente.telefono, 60),
            email: txt(body.cliente && body.cliente.email, 120),
            contacto: txt(body.cliente && body.cliente.contacto, 120)
        },
        moneda,
        tasa_bcv: Math.max(0, num(body.tasa_bcv)),
        items,
        descuento_tipo, descuento_valor, descuento_monto,
        con_iva, iva_porcentaje,
        bruto, subtotal, iva, total,
        validez_dias: Math.max(0, Math.min(365, parseInt(body.validez_dias, 10) || cfg.validez_dias || 15)),
        condiciones_pago: txt(body.condiciones_pago, 600),
        tiempo_entrega: txt(body.tiempo_entrega, 200),
        con_nota: !!body.con_nota,
        nota_extra: txt(body.nota_extra, 2000),
        metodos_pago,
        actualizado: new Date()
    };
}

/* =========================================================
   RUTAS
   ========================================================= */
const api = express.Router();

/* --- Configuración de la empresa --- */
api.get('/config', async (req, res, next) => {
    try { res.json(await obtenerConfig()); } catch (e) { next(e); }
});

api.put('/config', async (req, res, next) => {
    try {
        const b = req.body || {};
        const cfg = await obtenerConfig();

        if (b.empresa) {
            cfg.empresa.nombre = txt(b.empresa.nombre, 150);
            cfg.empresa.rif = txt(b.empresa.rif, 40);
            cfg.empresa.telefono = txt(b.empresa.telefono, 80);
            cfg.empresa.email = txt(b.empresa.email, 120);
            cfg.empresa.direccion = txt(b.empresa.direccion, 300);
            cfg.empresa.web = txt(b.empresa.web, 120);
        }
        if (b.prefijo !== undefined) cfg.prefijo = txt(b.prefijo, 8).toUpperCase() || 'AB';
        if (b.iva_porcentaje !== undefined) cfg.iva_porcentaje = Math.max(0, Math.min(100, num(b.iva_porcentaje)));
        if (b.validez_dias !== undefined) cfg.validez_dias = Math.max(0, Math.min(365, parseInt(b.validez_dias, 10) || 15));
        if (b.moneda_defecto !== undefined) cfg.moneda_defecto = ['$', '€'].includes(b.moneda_defecto) ? b.moneda_defecto : '$';
        if (b.condiciones_pago_defecto !== undefined) cfg.condiciones_pago_defecto = txt(b.condiciones_pago_defecto, 600);
        if (b.tiempo_entrega_defecto !== undefined) cfg.tiempo_entrega_defecto = txt(b.tiempo_entrega_defecto, 200);
        if (b.nota_bcv !== undefined) cfg.nota_bcv = txt(b.nota_bcv, 1000);

        if (Array.isArray(b.metodos_pago)) {
            cfg.metodos_pago = b.metodos_pago.slice(0, 20).map((m, i) => ({
                _id: m._id && String(m._id).match(/^[a-f0-9]{24}$/i) ? m._id : undefined,
                nombre: txt(m.nombre, 100),
                tipo: txt(m.tipo, 40) || 'Transferencia',
                banco: txt(m.banco, 100),
                titular: txt(m.titular, 120),
                documento: txt(m.documento, 40),
                numero: txt(m.numero, 120),
                detalle: txt(m.detalle, 200),
                activo: m.activo !== false,
                orden: i
            }));
        }

        await cfg.save();
        res.json(cfg);
    } catch (e) { next(e); }
});

/* --- Listado con búsqueda, filtro y paginación --- */
api.get('/presupuestos', async (req, res, next) => {
    try {
        const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
        const limite = Math.min(100, Math.max(5, parseInt(req.query.limite, 10) || 20));
        const filtro = {};

        if (req.query.estado) filtro.estado = req.query.estado;
        if (req.query.q) {
            const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filtro.$or = [{ 'cliente.nombre': rx }, { numero: rx }, { 'cliente.rif': rx }];
        }

        const [lista, totalDocs] = await Promise.all([
            Presupuesto.find(filtro).sort({ fecha: -1 }).skip((pagina - 1) * limite).limit(limite).lean(),
            Presupuesto.countDocuments(filtro)
        ]);

        res.json({ lista, totalDocs, pagina, paginas: Math.ceil(totalDocs / limite) || 1 });
    } catch (e) { next(e); }
});

/* --- Crear --- */
api.post('/presupuestos', async (req, res, next) => {
    try {
        const cfg = await obtenerConfig();
        const datos = normalizar(req.body, cfg);
        if (!datos.items.length) return res.status(400).json({ error: 'Agrega al menos un ítem.' });

        datos.numero = await siguienteNumero(cfg.prefijo);
        datos.fecha = parseFecha(req.body.fecha);

        const nuevo = await Presupuesto.create(datos);
        res.status(201).json(nuevo);
    } catch (e) { next(e); }
});

/* --- Leer uno --- */
api.get('/presupuestos/:id', async (req, res, next) => {
    try {
        const p = await Presupuesto.findById(req.params.id).lean();
        if (!p) return res.status(404).json({ error: 'No encontrado' });
        res.json(p);
    } catch (e) { next(e); }
});

/* --- Actualizar --- */
api.put('/presupuestos/:id', async (req, res, next) => {
    try {
        const cfg = await obtenerConfig();
        const datos = normalizar(req.body, cfg);
        if (!datos.items.length) return res.status(400).json({ error: 'Agrega al menos un ítem.' });
        if (req.body.fecha) datos.fecha = parseFecha(req.body.fecha);

        const p = await Presupuesto.findByIdAndUpdate(req.params.id, datos, { new: true });
        if (!p) return res.status(404).json({ error: 'No encontrado' });
        res.json(p);
    } catch (e) { next(e); }
});

/* --- Cambiar solo el estado --- */
api.patch('/presupuestos/:id/estado', async (req, res, next) => {
    try {
        const estados = ['borrador', 'enviado', 'aprobado', 'rechazado', 'anulado'];
        if (!estados.includes(req.body.estado)) return res.status(400).json({ error: 'Estado inválido' });
        const p = await Presupuesto.findByIdAndUpdate(
            req.params.id, { estado: req.body.estado, actualizado: new Date() }, { new: true }
        );
        if (!p) return res.status(404).json({ error: 'No encontrado' });
        res.json(p);
    } catch (e) { next(e); }
});

/* --- Duplicar --- */
api.post('/presupuestos/:id/duplicar', async (req, res, next) => {
    try {
        const cfg = await obtenerConfig();
        const orig = await Presupuesto.findById(req.params.id).lean();
        if (!orig) return res.status(404).json({ error: 'No encontrado' });

        delete orig._id; delete orig.__v;
        orig.numero = await siguienteNumero(cfg.prefijo);
        orig.estado = 'borrador';
        orig.fecha = new Date();
        orig.actualizado = new Date();

        const copia = await Presupuesto.create(orig);
        res.status(201).json(copia);
    } catch (e) { next(e); }
});

/* --- Eliminar --- */
api.delete('/presupuestos/:id', async (req, res, next) => {
    try {
        const p = await Presupuesto.findByIdAndDelete(req.params.id);
        if (!p) return res.status(404).json({ error: 'No encontrado' });
        res.json({ ok: true });
    } catch (e) { next(e); }
});

/* --- PDF --- */
api.get('/presupuestos/:id/pdf', async (req, res, next) => {
    try {
        const [p, cfg] = await Promise.all([
            Presupuesto.findById(req.params.id).lean(),
            obtenerConfig()
        ]);
        if (!p) return res.status(404).send('El presupuesto no existe.');

        const nombre = `Cotizacion-${(p.numero || 'SN').replace(/[^\w-]/g, '')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `${req.query.descargar === '1' ? 'attachment' : 'inline'}; filename="${nombre}"`);

        generarPDF(p, cfg.toObject ? cfg.toObject() : cfg, res);
    } catch (e) {
        console.error('Error generando PDF:', e);
        if (!res.headersSent) res.status(500).send('Error generando el PDF');
    }
});

/* --- Resumen para el panel --- */
api.get('/resumen', async (req, res, next) => {
    try {
        const datos = await Presupuesto.aggregate([
            { $group: { _id: '$estado', cantidad: { $sum: 1 }, monto: { $sum: '$total' } } }
        ]);
        res.json(datos);
    } catch (e) { next(e); }
});

app.use('/api', auth, api);

/* --- Salud del servicio (útil para Render) --- */
app.get('/health', (req, res) => res.json({ ok: true, hora: new Date() }));

/* --- Manejo central de errores --- */
app.use((err, req, res, next) => {
    console.error('❌', err.message);
    if (err.name === 'CastError') return res.status(400).json({ error: 'Identificador inválido' });
    res.status(500).json({ error: err.message || 'Error interno' });
});

/* =========================================================
   ARRANQUE
   ========================================================= */
const PORT = process.env.PORT || 3000;

conectar(process.env.MONGO_URI)
    .then(async () => {
        await obtenerConfig();
        app.listen(PORT, () => {
            console.log(`🚀 Servidor AB Technology en el puerto ${PORT}`);
            if (!API_KEY) console.log('⚠️  API sin clave: define API_KEY en .env para protegerla.');
        });
    })
    .catch(err => {
        console.error('❌ No se pudo conectar a MongoDB:', err.message);
        process.exit(1);
    });
