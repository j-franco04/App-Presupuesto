/**
 * server.js — API del sistema de presupuestos
 * AB TECHNOLOGY BY, C.A.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const {
    Presupuesto, Config, Producto, Compra, conectar, obtenerConfig, siguienteNumero
} = require('./models');
const { generarPDF } = require('./pdf');
const { generarFactura } = require('./pdf-factura');

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

    const tipo = ['nota_entrega', 'factura'].includes(body.tipo) ? body.tipo : 'cotizacion';
    const esFactura = tipo === 'factura';

    // La factura siempre va en bolívares, como el talonario físico
    const moneda = esFactura ? 'Bs' : (['$', '€'].includes(body.moneda) ? body.moneda : '$');

    const estados = esFactura
        ? ['borrador', 'emitida', 'pagada', 'anulado']
        : tipo === 'nota_entrega'
            ? ['borrador', 'entregada', 'pagada', 'anulado']
            : ['borrador', 'enviado', 'aprobado', 'rechazado', 'anulado'];

    const formasPago = ['', 'credito', 'contado', 'efectivo', 'cheque', 'debito',
                        'tarjeta_credito', 'transferencia', 'otro'];

    /* En la factura no hay descuento: hay exento y ajustes, como en el formulario.
       Base imponible = subtotal - exento + ajustes  */
    const exento = esFactura ? Math.min(Math.max(0, num(body.exento)), bruto) : 0;
    const ajustes = esFactura ? num(body.ajustes) : 0;
    const baseFactura = r2(bruto - exento + ajustes);

    // El talonario escrito a mano trunca los céntimos; se respeta ese criterio.
    const modo = (cfg.factura && cfg.factura.redondeo) || 'truncar';
    const ajustar = n => modo === 'truncar' ? Math.trunc(n * 100) / 100 : r2(n);
    const ivaFactura = ajustar(baseFactura * (con_iva ? iva_porcentaje : 0) / 100);

    return {
        tipo,
        numero_factura: esFactura ? txt(body.numero_factura, 20) : '',
        numero_control: esFactura ? txt(body.numero_control, 20) : '',
        forma_pago: esFactura && formasPago.includes(body.forma_pago) ? body.forma_pago : '',
        referencia_pago: esFactura ? txt(body.referencia_pago, 60) : '',
        otro_pago: esFactura ? txt(body.otro_pago, 60) : '',
        exento, ajustes,
        base_imponible: esFactura ? baseFactura : subtotal,
        tasa_usada: esFactura ? Math.max(0, num(body.tasa_usada)) : 0,
        moneda_captura: esFactura && ['$', '€', 'Bs'].includes(body.moneda_captura) ? body.moneda_captura : 'Bs',
        ret_iva_monto:        esFactura ? Math.max(0, num(body.ret_iva_monto)) : 0,
        ret_iva_comprobante:  esFactura ? txt(body.ret_iva_comprobante, 40) : '',
        ret_iva_fecha:        esFactura && body.ret_iva_fecha ? parseFecha(body.ret_iva_fecha) : undefined,
        ret_islr_monto:       esFactura ? Math.max(0, num(body.ret_islr_monto)) : 0,
        ret_islr_porcentaje:  esFactura ? Math.max(0, num(body.ret_islr_porcentaje)) : 0,
        ret_islr_comprobante: esFactura ? txt(body.ret_islr_comprobante, 40) : '',
        ret_islr_fecha:       esFactura && body.ret_islr_fecha ? parseFecha(body.ret_islr_fecha) : undefined,
        fecha_cobro:          esFactura && body.fecha_cobro ? parseFecha(body.fecha_cobro) : undefined,
        trabajo_realizado: tipo === 'nota_entrega' ? txt(body.trabajo_realizado, 5000) : '',
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
        bruto,
        subtotal: esFactura ? bruto : subtotal,
        iva: esFactura ? ivaFactura : iva,
        total: esFactura ? ajustar(baseFactura + ivaFactura + exento) : total,
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
        if (b.prefijo_nota !== undefined) cfg.prefijo_nota = txt(b.prefijo_nota, 8).toUpperCase() || 'NE';

        if (b.sincronizacion) {
            cfg.sincronizacion = cfg.sincronizacion || {};
            const sc = b.sincronizacion;
            if (sc.url !== undefined) cfg.sincronizacion.url = txt(sc.url, 500);
            if (sc.url_tasa !== undefined) cfg.sincronizacion.url_tasa = txt(sc.url_tasa, 500);
            if (sc.apikey !== undefined) cfg.sincronizacion.apikey = txt(sc.apikey, 500);
            if (sc.proveedor !== undefined) cfg.sincronizacion.proveedor = txt(sc.proveedor, 80);
            if (sc.margen !== undefined) cfg.sincronizacion.margen = Math.max(0, num(sc.margen));
            if (sc.moneda !== undefined) cfg.sincronizacion.moneda = ['$', '€'].includes(sc.moneda) ? sc.moneda : '$';
            if (sc.incluye_iva !== undefined) cfg.sincronizacion.incluye_iva = !!sc.incluye_iva;
            cfg.markModified('sincronizacion');
        }

        if (b.factura) {
            cfg.factura = cfg.factura || {};
            if (b.factura.prefijo_control !== undefined) cfg.factura.prefijo_control = txt(b.factura.prefijo_control, 6);
            if (b.factura.eslogan !== undefined) cfg.factura.eslogan = txt(b.factura.eslogan, 120);
            if (b.factura.domicilio_1 !== undefined) cfg.factura.domicilio_1 = txt(b.factura.domicilio_1, 200);
            if (b.factura.domicilio_2 !== undefined) cfg.factura.domicilio_2 = txt(b.factura.domicilio_2, 200);
            if (b.factura.texto_imprenta !== undefined) cfg.factura.texto_imprenta = txt(b.factura.texto_imprenta, 1200);
            if (b.factura.leyenda !== undefined) cfg.factura.leyenda = txt(b.factura.leyenda, 120);
            if (b.factura.redondeo !== undefined) cfg.factura.redondeo = b.factura.redondeo === 'redondear' ? 'redondear' : 'truncar';
            if (b.factura.nota_pie !== undefined) cfg.factura.nota_pie = txt(b.factura.nota_pie, 400);
            cfg.markModified('factura');
        }
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

/* =========================================================
   CATÁLOGO DE PRODUCTOS
   ========================================================= */

/**
 * Interpreta un precio escrito de cualquier forma:
 * "€152,31"  "1.311,52"  "1,311.52"  "83.87"  ->  número
 */
function precioDeTexto(txtPrecio) {
    let t = String(txtPrecio).replace(/[^\d.,]/g, '').trim();
    if (!t) return 0;
    const tieneComa = t.includes(','), tienePunto = t.includes('.');

    if (tieneComa && tienePunto) {
        // El separador decimal es el último que aparece
        t = t.lastIndexOf(',') > t.lastIndexOf('.')
            ? t.replace(/\./g, '').replace(',', '.')
            : t.replace(/,/g, '');
    } else if (tieneComa) {
        // Una sola coma con 1 o 2 decimales = decimal; si no, son miles
        t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
    } else if (tienePunto && !/\.\d{1,2}$/.test(t)) {
        t = t.replace(/\./g, '');   // 1.311 = mil trescientos once
    }
    const n = parseFloat(t);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Une las líneas que traen solo el precio con el nombre de la línea anterior.
 * Los catálogos en cuadrícula se copian así: el nombre en un renglón y el
 * precio en el siguiente.
 */
function unirPreciosSueltos(texto) {
    const lineas = String(texto || '').split(/\r?\n/);
    const salida = [];

    lineas.forEach(l => {
        const limpia = l.trim();
        const soloPrecio = /^[€$]?\s*[\d][\d.,]*\s*(?:USD|usd|\$|€|Bs\.?)?$/.test(limpia) && /\d/.test(limpia);
        const anterior = salida.length ? salida[salida.length - 1].trim() : '';
        const anteriorTienePrecio = /[\d][\d.,]*\s*$/.test(anterior);

        if (soloPrecio && anterior && !anteriorTienePrecio) {
            salida[salida.length - 1] = anterior + '\t' + limpia;   // se pega al nombre
        } else if (limpia !== '') {
            salida.push(limpia);
        }
    });

    return salida.join('\n');
}

/** Convierte el texto pegado de la lista de precios en productos. */
function interpretarLista(texto, monedaDefecto, incluyeIva, proveedor, margen) {
    const filas = [];
    let categoria = 'General';

    unirPreciosSueltos(texto).split(/\r?\n/).forEach(linea => {
        const l = linea.replace(/\|/g, '\t').trim();
        if (!l || /^[-\s\t]+$/.test(l)) return;

        // Última cifra de la línea = precio
        const m = l.match(/([€$]?\s*[\d][\d.,]*)\s*$/);
        const nombre = (m ? l.slice(0, m.index) : l).replace(/\t+/g, ' ').replace(/\*+/g, '').trim();
        if (!nombre) return;

        if (!m) {                       // línea sin precio = título de categoría
            const primera = l.split('\t')[0].replace(/\*+/g, '').trim();
            if (primera && primera.length <= 60) categoria = primera;
            return;
        }

        const precio = precioDeTexto(m[1]);
        if (!precio) return;
        const moneda = m[1].includes('$') ? '$' : (m[1].includes('€') ? '€' : monedaDefecto);

        filas.push({
            nombre: nombre.slice(0, 300),
            categoria, precio, moneda,
            proveedor: String(proveedor || '').trim().slice(0, 80),
            margen: Math.max(0, Number(margen) || 0),
            incluye_iva: !!incluyeIva,
            unidad: 'Und', activo: true, orden: filas.length,
            actualizado: new Date()
        });
    });

    return filas;
}

api.get('/catalogo', async (req, res, next) => {
    try {
        const filtro = {};
        if (req.query.proveedor !== undefined) filtro.proveedor = req.query.proveedor;
        if (req.query.q) {
            const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filtro.$or = [{ nombre: rx }, { categoria: rx }, { proveedor: rx }];
        }
        res.json(await Producto.find(filtro).sort({ orden: 1, nombre: 1 }).limit(1000).lean());
    } catch (e) { next(e); }
});

/** Guarda el catálogo completo tal como quedó en pantalla. */
api.put('/catalogo', async (req, res, next) => {
    try {
        const lista = (Array.isArray(req.body.productos) ? req.body.productos : []).slice(0, 1000)
            .map((x, i) => ({
                nombre: txt(x.nombre, 300),
                categoria: txt(x.categoria, 80) || 'General',
                unidad: txt(x.unidad, 20) || 'Und',
                precio: Math.max(0, num(x.precio)),
                moneda: ['$', '€'].includes(x.moneda) ? x.moneda : '€',
                proveedor: txt(x.proveedor, 80),
                margen: Math.max(0, num(x.margen)),
                incluye_iva: !!x.incluye_iva,
                activo: x.activo !== false,
                orden: i,
                actualizado: new Date()
            }))
            .filter(x => x.nombre);

        await Producto.deleteMany({});
        if (lista.length) await Producto.insertMany(lista);
        res.json({ ok: true, total: lista.length });
    } catch (e) { next(e); }
});

/** Importa pegando la lista de precios (texto copiado de la web). */
api.post('/catalogo/importar', async (req, res, next) => {
    try {
        const proveedor = txt(req.body.proveedor, 80);
        const filas = interpretarLista(
            req.body.texto,
            req.body.moneda === '$' ? '$' : '€',
            req.body.incluye_iva,
            proveedor,
            req.body.margen
        );
        if (!filas.length) return res.status(400).json({ error: 'No se reconoció ningún producto en el texto pegado.' });

        const modo = ['reemplazar', 'actualizar'].includes(req.body.modo) ? req.body.modo : 'agregar';

        // "Reemplazar" solo borra lo del mismo proveedor: así no se pierde el resto
        if (modo === 'reemplazar') await Producto.deleteMany({ proveedor });

        let nuevos = 0, actualizados = 0;

        if (modo === 'actualizar') {
            for (const f of filas) {
                const existente = await Producto.findOne({ nombre: f.nombre, proveedor });
                if (existente) {
                    existente.precio = f.precio;
                    existente.moneda = f.moneda;
                    existente.incluye_iva = f.incluye_iva;
                    existente.categoria = f.categoria;
                    existente.actualizado = new Date();
                    await existente.save();
                    actualizados++;
                } else {
                    f.orden = await Producto.countDocuments();
                    await Producto.create(f);
                    nuevos++;
                }
            }
        } else {
            const desde = await Producto.countDocuments();
            filas.forEach((f, i) => { f.orden = desde + i; });
            await Producto.insertMany(filas);
            nuevos = filas.length;
        }

        res.json({ ok: true, importados: nuevos + actualizados, nuevos, actualizados });
    } catch (e) { next(e); }
});

/* ---------- Sincronización con la lista en línea de un proveedor ---------- */

const CLAVES_NOMBRE = ['nombre', 'name', 'titulo', 'title', 'producto', 'modelo', 'descripcion'];
const CLAVES_PRECIO = ['precio', 'price', 'precio_venta', 'precio_usd', 'pvp', 'monto', 'valor', 'costo'];
const CLAVES_CATEG  = ['categoria', 'category', 'tipo', 'seccion', 'marca'];

/** Busca en el primer registro qué columna corresponde a cada dato. */
function detectarCampo(fila, candidatos, numerico) {
    const claves = Object.keys(fila || {});
    for (const c of candidatos) {
        const k = claves.find(x => x.toLowerCase() === c);
        if (k && (numerico ? !isNaN(parseFloat(fila[k])) : String(fila[k] || '').trim() !== '')) return k;
    }
    // Segunda pasada: cualquier columna que contenga la palabra
    for (const c of candidatos) {
        const k = claves.find(x => x.toLowerCase().includes(c));
        if (k && (numerico ? !isNaN(parseFloat(fila[k])) : String(fila[k] || '').trim() !== '')) return k;
    }
    return '';
}

/**
 * Consulta la lista del proveedor probando las tres formas habituales de
 * presentar la clave. Devuelve el mensaje real del servidor si todas fallan,
 * que es lo único que permite saber qué está mal.
 */
async function consultarProveedor(url, apikey) {
    const formas = [];

    if (apikey) {
        formas.push(['clave + Bearer', url, { apikey, Authorization: 'Bearer ' + apikey }]);
        formas.push(['solo clave', url, { apikey }]);
        const sep = url.includes('?') ? '&' : '?';
        formas.push(['clave en la dirección', url + sep + 'apikey=' + encodeURIComponent(apikey), {}]);
    } else {
        formas.push(['sin clave', url, {}]);
    }

    const intentos = [];
    for (const [etiqueta, direccion, extra] of formas) {
        try {
            const r = await fetch(direccion, {
                headers: Object.assign({ Accept: 'application/json', 'Accept-Profile': 'public' }, extra)
            });
            if (r.ok) return { ok: true, datos: await r.json(), forma: etiqueta };

            const cuerpo = (await r.text()).slice(0, 300);
            let mensaje = cuerpo;
            try { const j = JSON.parse(cuerpo); mensaje = j.message || j.msg || j.error || j.hint || cuerpo; } catch (e) { /* texto plano */ }
            intentos.push(`${etiqueta}: ${r.status} ${mensaje}`);
        } catch (err) {
            intentos.push(`${etiqueta}: ${err.message}`);
        }
    }

    const ultimo = intentos[intentos.length - 1] || '';
    return {
        ok: false,
        estado: (ultimo.match(/: (\d{3}) /) || [])[1] || '',
        mensaje: ultimo.replace(/^[^:]+: \d{3} /, ''),
        intentos
    };
}

api.post('/catalogo/sincronizar', async (req, res, next) => {
    try {
        const cfg = await obtenerConfig();
        const sc = cfg.sincronizacion || {};
        const url = txt(req.body.url || sc.url, 500);
        const apikey = txt(req.body.apikey !== undefined ? req.body.apikey : sc.apikey, 500);
        if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Falta la dirección de la lista del proveedor.' });

        let datos;
        try {
            const intento = await consultarProveedor(url, apikey);
            if (!intento.ok) {
                return res.status(502).json({
                    error: `El proveedor respondió ${intento.estado}: ${intento.mensaje}`,
                    intentos: intento.intentos
                });
            }
            datos = intento.datos;
        } catch (err) {
            return res.status(502).json({ error: 'No se pudo consultar al proveedor: ' + err.message });
        }

        // Admite tanto un arreglo como {data:[...]} o {productos:[...]}
        if (!Array.isArray(datos)) datos = datos.data || datos.productos || datos.items || datos.results || [];
        if (!Array.isArray(datos) || !datos.length) {
            return res.status(400).json({ error: 'La lista del proveedor llegó vacía o en un formato que no reconozco.' });
        }

        const muestra = datos[0];
        const cNombre = txt(req.body.campo_nombre || sc.campo_nombre, 60) || detectarCampo(muestra, CLAVES_NOMBRE, false);
        const cPrecio = txt(req.body.campo_precio || sc.campo_precio, 60) || detectarCampo(muestra, CLAVES_PRECIO, true);
        const cCateg  = txt(req.body.campo_categoria || sc.campo_categoria, 60) || detectarCampo(muestra, CLAVES_CATEG, false);

        if (!cNombre || !cPrecio) {
            return res.status(400).json({
                error: 'No identifiqué las columnas de nombre y precio.',
                columnas: Object.keys(muestra).slice(0, 40)
            });
        }

        const proveedor = txt(req.body.proveedor || sc.proveedor, 80) || 'Proveedor';
        const margen = Math.max(0, num(req.body.margen !== undefined ? req.body.margen : sc.margen));
        const moneda = ['$', '€'].includes(req.body.moneda || sc.moneda) ? (req.body.moneda || sc.moneda) : '$';
        const incluyeIva = req.body.incluye_iva !== undefined ? !!req.body.incluye_iva : !!sc.incluye_iva;

        let nuevos = 0, actualizados = 0, saltados = 0;

        // Muchas listas traen una columna con las características del equipo
        const cSpecs = ['specs', 'especificaciones', 'detalle', 'descripcion_corta']
            .find(k => Object.keys(muestra).some(x => x.toLowerCase() === k));
        const claveSpecs = cSpecs ? Object.keys(muestra).find(x => x.toLowerCase() === cSpecs) : '';

        for (const fila of datos.slice(0, 2000)) {
            let nombre = txt(fila[cNombre], 300);
            if (claveSpecs && fila[claveSpecs] && cNombre !== claveSpecs) {
                const specs = txt(fila[claveSpecs], 160);
                if (specs && !nombre.toLowerCase().includes(specs.toLowerCase())) {
                    nombre = (nombre + ' — ' + specs).slice(0, 300);
                }
            }
            const precio = Math.max(0, num(fila[cPrecio]));
            if (!nombre || !precio) { saltados++; continue; }
            const categoria = txt(fila[cCateg], 80) || 'General';

            const existente = await Producto.findOne({ nombre, proveedor });
            if (existente) {
                existente.precio = precio;
                existente.categoria = categoria;
                existente.moneda = moneda;
                existente.incluye_iva = incluyeIva;
                existente.actualizado = new Date();
                await existente.save();
                actualizados++;
            } else {
                await Producto.create({
                    nombre, categoria, proveedor, margen, precio, moneda,
                    incluye_iva: incluyeIva, unidad: 'Und', activo: true,
                    orden: await Producto.countDocuments(), actualizado: new Date()
                });
                nuevos++;
            }
        }

        // Se recuerda la configuración que funcionó
        cfg.sincronizacion = {
            url, apikey, proveedor, margen, moneda, incluye_iva: incluyeIva,
            url_tasa: txt(req.body.url_tasa !== undefined ? req.body.url_tasa : sc.url_tasa, 500),
            campo_nombre: cNombre, campo_precio: cPrecio, campo_categoria: cCateg,
            ultima: new Date()
        };
        cfg.markModified('sincronizacion');
        await cfg.save();

        res.json({ ok: true, nuevos, actualizados, saltados, total: datos.length,
                   campos: { nombre: cNombre, precio: cPrecio, categoria: cCateg } });
    } catch (e) { next(e); }
});

/** Trae la tasa del día desde la lista en línea del proveedor. */
api.get('/tasa', async (req, res, next) => {
    try {
        const cfg = await obtenerConfig();
        const sc = cfg.sincronizacion || {};
        const url = txt(req.query.url || sc.url_tasa, 500);
        if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'No hay una dirección configurada para la tasa.' });

        const intento = await consultarProveedor(url, sc.apikey);
        if (!intento.ok) return res.status(502).json({ error: `El proveedor respondió ${intento.estado}: ${intento.mensaje}` });

        let datos = intento.datos;
        if (!Array.isArray(datos)) datos = datos.data || [datos];
        const fila = datos[0];
        if (!fila) return res.status(400).json({ error: 'La consulta no devolvió datos.' });

        // Busca la columna numérica que parezca una tasa
        const claves = Object.keys(fila);
        const candidata = ['tasa_dolar', 'tasa', 'dolar', 'precio_dolar', 'valor_dolar', 'bcv', 'valor']
            .map(c => claves.find(k => k.toLowerCase().includes(c)))
            .find(k => k && !isNaN(parseFloat(fila[k])) && parseFloat(fila[k]) > 0);

        if (!candidata) {
            return res.status(400).json({ error: 'No encontré la tasa en la respuesta.', columnas: claves.slice(0, 30) });
        }
        res.json({ tasa: Math.round(parseFloat(fila[candidata]) * 10000) / 10000, campo: candidata });
    } catch (e) { next(e); }
});

/** Proveedores cargados, para filtrar el catálogo. */
api.get('/proveedores', async (req, res, next) => {
    try {
        const lista = await Producto.aggregate([
            { $group: { _id: '$proveedor', cantidad: { $sum: 1 }, ultima: { $max: '$actualizado' } } },
            { $sort: { cantidad: -1 } }
        ]);
        res.json(lista.map(x => ({ proveedor: x._id || '', cantidad: x.cantidad, ultima: x.ultima })));
    } catch (e) { next(e); }
});

/* --- Listado con búsqueda, filtro y paginación --- */
api.get('/presupuestos', async (req, res, next) => {
    try {
        const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
        const limite = Math.min(100, Math.max(5, parseInt(req.query.limite, 10) || 20));
        const filtro = {};

        if (['nota_entrega', 'factura'].includes(req.query.tipo)) filtro.tipo = req.query.tipo;
        else if (req.query.tipo === 'cotizacion') filtro.tipo = { $nin: ['nota_entrega', 'factura'] };
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

        if (datos.tipo === 'factura') {
            // El folio del talonario manda: el sistema no lo inventa
            if (!datos.numero_factura) return res.status(400).json({ error: 'Escribe el número de factura del talonario.' });
            if (!datos.numero_control) return res.status(400).json({ error: 'Escribe el número de control del talonario.' });
            const repetida = await Presupuesto.findOne({ tipo: 'factura', numero_factura: datos.numero_factura });
            if (repetida) return res.status(409).json({ error: `Ya existe la factura N° ${datos.numero_factura}.` });
            datos.numero = datos.numero_factura;
        } else {
            datos.numero = datos.tipo === 'nota_entrega'
                ? await siguienteNumero(cfg.prefijo_nota || 'NE', 'nota_entrega')
                : await siguienteNumero(cfg.prefijo, 'cotizacion');
        }
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
        delete datos.origen;   // el origen se fija al convertir y no se modifica

        if (datos.tipo === 'factura') {
            if (!datos.numero_factura) return res.status(400).json({ error: 'Escribe el número de factura del talonario.' });
            const repetida = await Presupuesto.findOne({
                tipo: 'factura', numero_factura: datos.numero_factura, _id: { $ne: req.params.id }
            });
            if (repetida) return res.status(409).json({ error: `Ya existe la factura N° ${datos.numero_factura}.` });
            datos.numero = datos.numero_factura;
        }

        const p = await Presupuesto.findByIdAndUpdate(req.params.id, datos, { new: true });
        if (!p) return res.status(404).json({ error: 'No encontrado' });
        res.json(p);
    } catch (e) { next(e); }
});

/* --- Cambiar solo el estado --- */
api.patch('/presupuestos/:id/estado', async (req, res, next) => {
    try {
        const estados = ['borrador', 'enviado', 'aprobado', 'rechazado', 'anulado', 'entregada', 'pagada', 'emitida'];
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
        orig.numero = orig.tipo === 'nota_entrega'
            ? await siguienteNumero(cfg.prefijo_nota || 'NE', 'nota_entrega')
            : await siguienteNumero(cfg.prefijo, 'cotizacion');
        orig.estado = 'borrador';
        orig.fecha = new Date();
        orig.actualizado = new Date();

        const copia = await Presupuesto.create(orig);
        res.status(201).json(copia);
    } catch (e) { next(e); }
});

/* --- Siguiente número de factura sugerido (a partir del último cargado) --- */
api.get('/siguiente-factura', async (req, res, next) => {
    try {
        const cfg = await obtenerConfig();
        const ultima = await Presupuesto.find({ tipo: 'factura' })
            .sort({ numero_factura: -1 }).limit(1).lean();

        const subir = (valor, largo) => {
            const n = parseInt(String(valor || '').replace(/\D/g, ''), 10);
            return Number.isFinite(n) ? String(n + 1).padStart(largo, '0') : '';
        };

        res.json({
            numero_factura: ultima.length ? subir(ultima[0].numero_factura, 6) : '',
            numero_control: ultima.length ? subir(ultima[0].numero_control, 8) : '',
            prefijo_control: (cfg.factura && cfg.factura.prefijo_control) || '00'
        });
    } catch (e) { next(e); }
});

/* --- Convertir una cotización o nota en factura --- */
api.post('/presupuestos/:id/facturar', async (req, res, next) => {
    try {
        const orig = await Presupuesto.findById(req.params.id).lean();
        if (!orig) return res.status(404).json({ error: 'No encontrado' });
        if (orig.tipo === 'factura') return res.status(400).json({ error: 'Este documento ya es una factura.' });

        const tasa = Math.max(0, num(req.body.tasa));
        if (orig.moneda !== 'Bs' && !tasa) {
            return res.status(400).json({ error: 'Indica la tasa para convertir los montos a bolívares.' });
        }
        const factor = orig.moneda === 'Bs' ? 1 : tasa;
        const monedaOrigen = orig.moneda;

        const numeroOrigen = orig.numero;
        delete orig._id; delete orig.__v;

        orig.tipo = 'factura';
        orig.origen = { id: String(req.params.id), numero: numeroOrigen || '' };
        orig.numero = '';
        orig.numero_factura = '';
        orig.numero_control = '';
        orig.estado = 'borrador';
        orig.fecha = new Date();
        orig.actualizado = new Date();
        orig.moneda_captura = ['$', '€'].includes(monedaOrigen) ? monedaOrigen : 'Bs';
        orig.moneda = 'Bs';
        orig.tasa_usada = factor;
        orig.validez_dias = 0;
        orig.trabajo_realizado = '';
        orig.metodos_pago = [];

        // Los precios pasan a bolívares con la tasa indicada
        orig.items = (orig.items || []).map(i => ({
            producto: i.producto,
            unidad: i.unidad || 'Und',
            cantidad: i.cantidad,
            precio: r2((i.precio || 0) * factor),
            total: r2((i.cantidad || 0) * (i.precio || 0) * factor)
        }));

        const bruto = r2(orig.items.reduce((a, i) => a + i.cantidad * i.precio, 0));
        orig.bruto = bruto;
        orig.subtotal = bruto;
        orig.exento = 0;
        orig.ajustes = 0;
        orig.descuento_tipo = 'porcentaje';
        orig.descuento_valor = 0;
        orig.descuento_monto = 0;
        orig.base_imponible = bruto;
        orig.iva = r2(bruto * (orig.con_iva ? (orig.iva_porcentaje || 0) : 0) / 100);
        orig.total = r2(bruto + orig.iva);

        const factura = await Presupuesto.create(orig);
        res.status(201).json(factura);
    } catch (e) { next(e); }
});

/* --- Convertir una cotización en nota de entrega --- */
api.post('/presupuestos/:id/convertir', async (req, res, next) => {
    try {
        const cfg = await obtenerConfig();
        const orig = await Presupuesto.findById(req.params.id).lean();
        if (!orig) return res.status(404).json({ error: 'No encontrado' });
        if (orig.tipo === 'nota_entrega') {
            return res.status(400).json({ error: 'Este documento ya es una nota de entrega.' });
        }

        const numeroOrigen = orig.numero;
        delete orig._id; delete orig.__v;

        orig.tipo = 'nota_entrega';
        orig.origen = { id: String(req.params.id), numero: numeroOrigen || '' };
        orig.numero = await siguienteNumero(cfg.prefijo_nota || 'NE', 'nota_entrega');
        orig.estado = 'borrador';
        orig.fecha = new Date();
        orig.actualizado = new Date();
        orig.validez_dias = 0;
        // El detalle de los procesos se escribe al editar la nota.
        orig.trabajo_realizado = '';

        const nota = await Presupuesto.create(orig);
        res.status(201).json(nota);
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

        const prefijoArchivo = p.tipo === 'factura' ? 'Factura'
            : p.tipo === 'nota_entrega' ? 'Nota-Entrega' : 'Cotizacion';
        const nombre = `${prefijoArchivo}-${(p.numero || 'SN').replace(/[^\w-]/g, '')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `${req.query.descargar === '1' ? 'attachment' : 'inline'}; filename="${nombre}"`);

        const config = cfg.toObject ? cfg.toObject() : cfg;
        if (p.tipo === 'factura') generarFactura(p, config, res);
        else generarPDF(p, config, res);
    } catch (e) {
        console.error('Error generando PDF:', e);
        if (!res.headersSent) res.status(500).send('Error generando el PDF');
    }
});

/* --- Clientes ya usados, para autocompletar --- */
api.get('/clientes', async (req, res, next) => {
    try {
        const lista = await Presupuesto.aggregate([
            { $match: { 'cliente.nombre': { $nin: ['', null, 'CLIENTE GENERAL'] } } },
            { $sort: { fecha: -1 } },
            { $group: {
                _id: { $toLower: '$cliente.nombre' },
                cliente: { $first: '$cliente' },
                ultima: { $first: '$fecha' },
                cantidad: { $sum: 1 }
            } },
            { $sort: { ultima: -1 } },
            { $limit: 400 }
        ]);
        res.json(lista.map(x => Object.assign({}, x.cliente, { cantidad: x.cantidad })));
    } catch (e) { next(e); }
});

/* =========================================================
   COMPRAS (alimentan el libro de compras)
   ========================================================= */
function normalizarCompra(b) {
    const fecha = parseFecha(b.fecha);

    // Si no se indica período, se usa el mes de la factura
    let pAnio = parseInt(b.periodo_anio, 10);
    let pMes = parseInt(b.periodo_mes, 10);
    if (!pAnio || !pMes || pMes < 1 || pMes > 12) {
        pAnio = fecha.getUTCFullYear();
        pMes = fecha.getUTCMonth() + 1;
    }

    const total = r2(num(b.total));
    const exento = r2(Math.min(Math.max(0, num(b.exento)), total));
    const alicuota = Math.max(0, Math.min(100, num(b.alicuota ?? 16)));

    // Si no se indica la base, se despeja del total: base = (total - exento) / (1 + alícuota)
    let base = num(b.base_imponible);
    if (!base) base = alicuota > 0 ? (total - exento) / (1 + alicuota / 100) : (total - exento);
    base = r2(base);

    const credito = r2(num(b.credito_fiscal) || base * alicuota / 100);

    return {
        fecha,
        periodo_anio: pAnio,
        periodo_mes: pMes,
        tipo_documento: ['factura', 'nota_credito', 'nota_debito', 'importacion'].includes(b.tipo_documento)
            ? b.tipo_documento : 'factura',
        numero_factura: txt(b.numero_factura, 40),
        numero_control: txt(b.numero_control, 40),
        documento_afectado: txt(b.documento_afectado, 40),
        proveedor: {
            nombre: txt(b.proveedor && b.proveedor.nombre, 200),
            rif: txt(b.proveedor && b.proveedor.rif, 40)
        },
        total, exento, base_imponible: base, alicuota, credito_fiscal: credito,
        iva_retenido: r2(Math.max(0, num(b.iva_retenido))),
        comprobante_retencion: txt(b.comprobante_retencion, 40),
        observacion: txt(b.observacion, 300)
    };
}

api.get('/compras', async (req, res, next) => {
    try {
        const filtro = {};
        if (req.query.desde || req.query.hasta) {
            filtro.fecha = {};
            if (req.query.desde) filtro.fecha.$gte = parseFecha(req.query.desde);
            if (req.query.hasta) filtro.fecha.$lte = parseFecha(req.query.hasta);
        }
        if (req.query.q) {
            const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filtro.$or = [{ 'proveedor.nombre': rx }, { 'proveedor.rif': rx }, { numero_factura: rx }];
        }
        const lista = await Compra.find(filtro).sort({ fecha: 1, numero_factura: 1 }).limit(2000).lean();
        res.json(lista);
    } catch (e) { next(e); }
});

api.post('/compras', async (req, res, next) => {
    try {
        const datos = normalizarCompra(req.body);
        if (!datos.proveedor.nombre) return res.status(400).json({ error: 'Escribe el nombre del proveedor.' });
        if (!datos.numero_factura) return res.status(400).json({ error: 'Escribe el número de la factura del proveedor.' });

        const anioFactura = datos.fecha.getUTCFullYear();
        if (anioFactura !== datos.periodo_anio) {
            return res.status(400).json({
                error: `La factura es del año ${anioFactura} y la estás declarando en ${datos.periodo_anio}. ` +
                       'El crédito fiscal debe quedar dentro del mismo ejercicio.'
            });
        }
        res.status(201).json(await Compra.create(datos));
    } catch (e) { next(e); }
});

api.put('/compras/:id', async (req, res, next) => {
    try {
        const c = await Compra.findByIdAndUpdate(req.params.id, normalizarCompra(req.body), { new: true });
        if (!c) return res.status(404).json({ error: 'No encontrada' });
        res.json(c);
    } catch (e) { next(e); }
});

api.delete('/compras/:id', async (req, res, next) => {
    try {
        const c = await Compra.findByIdAndDelete(req.params.id);
        if (!c) return res.status(404).json({ error: 'No encontrada' });
        res.json({ ok: true });
    } catch (e) { next(e); }
});

/* =========================================================
   LIBROS DE COMPRAS Y VENTAS (IVA)
   Artículos 75 a 78 del Reglamento de la Ley del IVA.
   El período es mensual y los totales deben coincidir con la
   declaración (Forma 30).
   ========================================================= */
function rangoMes(anio, mes) {
    const a = parseInt(anio, 10), m = parseInt(mes, 10);
    const desde = new Date(Date.UTC(a, m - 1, 1, 0, 0, 0));
    const hasta = new Date(Date.UTC(a, m, 1, 0, 0, 0));
    return { desde, hasta };
}

async function libroVentas(anio, mes) {
    {
        const { desde, hasta } = rangoMes(anio, mes);

        // El débito fiscal nace al emitir la factura: entran TODAS las emitidas,
        // salvo las anuladas, que se muestran aparte para no romper el correlativo.
        const facturas = await Presupuesto.find({
            tipo: 'factura',
            fecha: { $gte: desde, $lt: hasta }
        }).sort({ numero_factura: 1, fecha: 1 }).lean();

        const filas = facturas.map(f => {
            const anulada = f.estado === 'anulado';
            const signo = anulada ? 0 : 1;
            return {
                id: f._id,
                fecha: f.fecha,
                numero_factura: f.numero_factura || f.numero || '',
                numero_control: f.numero_control || '',
                cliente: (f.cliente && f.cliente.nombre) || '',
                rif: (f.cliente && f.cliente.rif) || '',
                total: r2((f.total || 0) * signo),
                exento: r2((f.exento || 0) * signo),
                base_imponible: r2((f.base_imponible || 0) * signo),
                alicuota: f.iva_porcentaje || 0,
                debito_fiscal: r2((f.iva || 0) * signo),
                iva_retenido: r2(f.ret_iva_monto || 0),
                comprobante_retencion: f.ret_iva_comprobante || '',
                islr_retenido: r2(f.ret_islr_monto || 0),
                islr_porcentaje: f.ret_islr_porcentaje || 0,
                islr_comprobante: f.ret_islr_comprobante || '',
                estado: f.estado || 'borrador',
                anulada,
                cobrada: f.estado === 'pagada' || !!f.fecha_cobro,
                fecha_cobro: f.fecha_cobro || null
            };
        });

        const sumar = clave => r2(filas.reduce((a, f) => a + (f[clave] || 0), 0));
        return {
            periodo: { anio: +anio, mes: +mes },
            filas,
            totales: {
                documentos: filas.length,
                anuladas: filas.filter(f => f.anulada).length,
                total: sumar('total'),
                exento: sumar('exento'),
                base_imponible: sumar('base_imponible'),
                debito_fiscal: sumar('debito_fiscal'),
                iva_retenido: sumar('iva_retenido'),
                islr_retenido: sumar('islr_retenido'),
                cobrado: r2(filas.filter(f => f.cobrada).reduce((a, f) => a + f.total, 0)),
                por_cobrar: r2(filas.filter(f => !f.cobrada && !f.anulada).reduce((a, f) => a + f.total, 0))
            }
        };
    }
}

async function libroCompras(anio, mes) {
    {
        const { desde, hasta } = rangoMes(anio, mes);

        const compras = await Compra.find({
            $or: [
                { periodo_anio: +anio, periodo_mes: +mes },
                // Compatibilidad con registros anteriores, que no tenían período
                { periodo_anio: { $exists: false }, fecha: { $gte: desde, $lt: hasta } }
            ]
        }).sort({ fecha: 1, numero_factura: 1 }).lean();

        // Las notas de crédito restan del crédito fiscal del período
        const filas = compras.map(c => {
            const signo = c.tipo_documento === 'nota_credito' ? -1 : 1;
            return {
                id: c._id,
                fecha: c.fecha,
                periodo_anio: c.periodo_anio || new Date(c.fecha).getUTCFullYear(),
                periodo_mes: c.periodo_mes || (new Date(c.fecha).getUTCMonth() + 1),
                // Factura de un mes anterior declarada en este período
                extemporanea: !!(c.periodo_anio && (
                    new Date(c.fecha).getUTCFullYear() !== c.periodo_anio ||
                    new Date(c.fecha).getUTCMonth() + 1 !== c.periodo_mes)),
                tipo_documento: c.tipo_documento,
                numero_factura: c.numero_factura,
                numero_control: c.numero_control,
                documento_afectado: c.documento_afectado,
                proveedor: c.proveedor.nombre,
                rif: c.proveedor.rif,
                total: r2(c.total * signo),
                exento: r2(c.exento * signo),
                base_imponible: r2(c.base_imponible * signo),
                alicuota: c.alicuota,
                credito_fiscal: r2(c.credito_fiscal * signo),
                iva_retenido: r2(c.iva_retenido * signo),
                comprobante_retencion: c.comprobante_retencion,
                observacion: c.observacion
            };
        });

        const sumar = clave => r2(filas.reduce((a, f) => a + (f[clave] || 0), 0));
        return {
            periodo: { anio: +anio, mes: +mes },
            filas,
            totales: {
                documentos: filas.length,
                total: sumar('total'),
                exento: sumar('exento'),
                base_imponible: sumar('base_imponible'),
                credito_fiscal: sumar('credito_fiscal'),
                iva_retenido: sumar('iva_retenido')
            }
        };
    }
}

function validarPeriodo(req, res) {
    const { desde } = rangoMes(req.query.anio, req.query.mes);
    if (isNaN(desde.getTime())) { res.status(400).json({ error: 'Indica mes y año.' }); return false; }
    return true;
}

api.get('/libros/ventas', async (req, res, next) => {
    try {
        if (!validarPeriodo(req, res)) return;
        res.json(await libroVentas(req.query.anio, req.query.mes));
    } catch (e) { next(e); }
});

api.get('/libros/compras', async (req, res, next) => {
    try {
        if (!validarPeriodo(req, res)) return;
        res.json(await libroCompras(req.query.anio, req.query.mes));
    } catch (e) { next(e); }
});

/**
 * Relación de retenciones que le practicaron en el período, más el
 * acumulado de ISLR del año, que es el anticipo de la declaración anual.
 */
api.get('/libros/retenciones', async (req, res, next) => {
    try {
        if (!validarPeriodo(req, res)) return;
        const anio = parseInt(req.query.anio, 10), mes = parseInt(req.query.mes, 10);
        const { desde, hasta } = rangoMes(anio, mes);
        const inicioAnio = new Date(Date.UTC(anio, 0, 1));
        const finAnio = new Date(Date.UTC(anio + 1, 0, 1));

        const conRetencion = {
            tipo: 'factura',
            estado: { $ne: 'anulado' },
            $or: [{ ret_iva_monto: { $gt: 0 } }, { ret_islr_monto: { $gt: 0 } }]
        };

        const [delMes, delAnio] = await Promise.all([
            Presupuesto.find(Object.assign({ fecha: { $gte: desde, $lt: hasta } }, conRetencion))
                .sort({ fecha: 1 }).lean(),
            Presupuesto.find(Object.assign({ fecha: { $gte: inicioAnio, $lt: finAnio } }, conRetencion))
                .select('ret_islr_monto ret_iva_monto fecha').lean()
        ]);

        const filas = delMes.map(f => ({
            id: f._id,
            fecha: f.fecha,
            numero_factura: f.numero_factura || f.numero || '',
            cliente: (f.cliente && f.cliente.nombre) || '',
            rif: (f.cliente && f.cliente.rif) || '',
            base_imponible: r2(f.base_imponible || 0),
            iva: r2(f.iva || 0),
            iva_retenido: r2(f.ret_iva_monto || 0),
            iva_comprobante: f.ret_iva_comprobante || '',
            iva_fecha: f.ret_iva_fecha || null,
            islr_porcentaje: f.ret_islr_porcentaje || 0,
            islr_retenido: r2(f.ret_islr_monto || 0),
            islr_comprobante: f.ret_islr_comprobante || '',
            islr_fecha: f.ret_islr_fecha || null
        }));

        const sumar = (lista, clave) => r2(lista.reduce((a, f) => a + (f[clave] || 0), 0));

        // Acumulado mes a mes del ISLR, para ver cómo va el anticipo del año
        const porMes = Array.from({ length: 12 }, () => 0);
        delAnio.forEach(f => { porMes[new Date(f.fecha).getUTCMonth()] += (f.ret_islr_monto || 0); });

        res.json({
            periodo: { anio, mes },
            filas,
            totales: {
                documentos: filas.length,
                iva_retenido: sumar(filas, 'iva_retenido'),
                islr_retenido: sumar(filas, 'islr_retenido')
            },
            anual: {
                islr_retenido: r2(porMes.reduce((a, b) => a + b, 0)),
                iva_retenido: r2(delAnio.reduce((a, f) => a + (f.ret_iva_monto || 0), 0)),
                islr_por_mes: porMes.map(r2)
            }
        });
    } catch (e) { next(e); }
});

/** Resumen del período: lo que va en la declaración. */
api.get('/libros/resumen', async (req, res, next) => {
    try {
        if (!validarPeriodo(req, res)) return;
        const anio = req.query.anio, mes = req.query.mes;
        const [v, c] = await Promise.all([libroVentas(anio, mes), libroCompras(anio, mes)]);

        const debito = v.totales.debito_fiscal;
        const credito = c.totales.credito_fiscal;
        const cuota = r2(debito - credito);
        const retenido = v.totales.iva_retenido;

        res.json({
            periodo: { anio: +anio, mes: +mes },
            ventas: v.totales,
            compras: c.totales,
            declaracion: {
                debito_fiscal: debito,
                credito_fiscal: credito,
                cuota_tributaria: cuota,
                iva_retenido_descontable: retenido,
                // Si lo retenido supera la cuota, queda un excedente que se arrastra
                a_pagar: r2(Math.max(0, cuota - retenido)),
                excedente_retenciones: r2(Math.max(0, retenido - cuota)),
                islr_retenido_anticipo: v.totales.islr_retenido
            }
        });
    } catch (e) { next(e); }
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
        if (err.code === 11000) {
            console.error('❌ Choque de colecciones en la base de datos:', err.message);
            console.error('   Revisa que models.js tenga las opciones collection: ab_config y ab_contadores.');
        } else {
            console.error('❌ No se pudo iniciar el servidor:', err.message);
        }
        process.exit(1);
    });
