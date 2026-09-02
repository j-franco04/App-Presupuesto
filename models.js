/**
 * models.js — Esquemas de base de datos (MongoDB / Mongoose)
 * AB TECHNOLOGY BY, C.A.
 */
const mongoose = require('mongoose');

/* ---------------------------------------------------------------
   1. ÍTEMS DEL PRESUPUESTO
   --------------------------------------------------------------- */
const ItemSchema = new mongoose.Schema({
    producto: { type: String, default: '' },
    unidad:   { type: String, default: 'Und' },
    cantidad: { type: Number, default: 0 },
    precio:   { type: Number, default: 0 },
    total:    { type: Number, default: 0 }
}, { _id: false });

/* ---------------------------------------------------------------
   2. MÉTODOS DE PAGO
   Se guardan en la configuración (editables desde la app) y se
   copia una "foto" de los seleccionados dentro de cada presupuesto,
   para que un PDF antiguo no cambie si luego editas una cuenta.
   --------------------------------------------------------------- */
const MetodoPagoSchema = new mongoose.Schema({
    nombre:    { type: String, default: '' },   // Ej: "Banesco Corriente"
    tipo:      { type: String, default: 'Transferencia' }, // Transferencia, Pago Móvil, Zelle, Efectivo, Binance, Otro
    banco:     { type: String, default: '' },
    titular:   { type: String, default: '' },
    documento: { type: String, default: '' },   // RIF o C.I. del titular
    numero:    { type: String, default: '' },   // Nº de cuenta, teléfono o correo
    detalle:   { type: String, default: '' },   // Texto libre adicional
    activo:    { type: Boolean, default: true },
    orden:     { type: Number, default: 0 }
});

const MetodoPagoSnapshot = new mongoose.Schema({
    origen_id: String,
    nombre: String, tipo: String, banco: String,
    titular: String, documento: String, numero: String, detalle: String
}, { _id: false });

/* ---------------------------------------------------------------
   3. PRESUPUESTO
   --------------------------------------------------------------- */
const PresupuestoSchema = new mongoose.Schema({
    numero: { type: String, index: true },
    estado: {
        type: String,
        enum: ['borrador', 'enviado', 'aprobado', 'rechazado', 'anulado'],
        default: 'borrador',
        index: true
    },

    cliente: {
        nombre:    { type: String, default: '' },
        rif:       { type: String, default: '' },
        direccion: { type: String, default: '' },
        telefono:  { type: String, default: '' },
        email:     { type: String, default: '' },
        contacto:  { type: String, default: '' }
    },

    moneda:   { type: String, default: '$' },
    tasa_bcv: { type: Number, default: 0 },   // 0 = no mostrar equivalente en Bs.

    items: [ItemSchema],

    // Descuento global
    descuento_tipo:  { type: String, enum: ['porcentaje', 'monto'], default: 'porcentaje' },
    descuento_valor: { type: Number, default: 0 },
    descuento_monto: { type: Number, default: 0 },

    // Impuesto
    con_iva:        { type: Boolean, default: false },
    iva_porcentaje: { type: Number, default: 16 },

    // Montos (SIEMPRE calculados en el servidor)
    bruto:    { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    iva:      { type: Number, default: 0 },
    total:    { type: Number, default: 0 },

    // Condiciones
    validez_dias:     { type: Number, default: 15 },
    condiciones_pago: { type: String, default: '' },
    tiempo_entrega:   { type: String, default: '' },
    con_nota:         { type: Boolean, default: false },
    nota_extra:       { type: String, default: '' },

    metodos_pago: [MetodoPagoSnapshot],

    fecha:       { type: Date, default: Date.now, index: true },
    actualizado: { type: Date, default: Date.now }
});

PresupuestoSchema.index({ 'cliente.nombre': 'text', numero: 'text' });

/* ---------------------------------------------------------------
   4. CONFIGURACIÓN DE LA EMPRESA (documento único)
   --------------------------------------------------------------- */
const ConfigSchema = new mongoose.Schema({
    _id: { type: String, default: 'config' },
    empresa: {
        nombre:    { type: String, default: 'AB TECHNOLOGY BY, C.A.' },
        rif:       { type: String, default: 'J-506865270' },
        telefono:  { type: String, default: '+58 412-9669616' },
        email:     { type: String, default: '' },
        direccion: { type: String, default: '' },
        web:       { type: String, default: '' }
    },
    prefijo:        { type: String, default: 'AB' },
    iva_porcentaje: { type: Number, default: 16 },
    validez_dias:   { type: Number, default: 15 },
    moneda_defecto: { type: String, default: '$' },
    condiciones_pago_defecto: { type: String, default: '50% de anticipo y 50% contra entrega.' },
    tiempo_entrega_defecto:   { type: String, default: '' },
    nota_bcv: {
        type: String,
        default: 'Los pagos realizados en Bolívares se rigen por la tasa oficial del Banco Central de Venezuela (BCV) vigente al momento del pago, calculada sobre la base de {moneda}.'
    },
    metodos_pago: [MetodoPagoSchema]
}, { minimize: false, collection: 'ab_config' });

/* ---------------------------------------------------------------
   5. CONTADOR DE NUMERACIÓN (evita folios repetidos)
   --------------------------------------------------------------- */
const ContadorSchema = new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 0 }
}, { collection: 'ab_contadores' });

const Presupuesto = mongoose.model('Presupuesto', PresupuestoSchema);
const Config      = mongoose.model('Config', ConfigSchema);
const Contador    = mongoose.model('Contador', ContadorSchema);

/* ---------------------------------------------------------------
   Helpers
   --------------------------------------------------------------- */
async function conectar(uri) {
    if (!uri) throw new Error('Falta la variable MONGO_URI en el archivo .env');
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('✅ Conectado a MongoDB Atlas');
}

/** Devuelve (y crea si hace falta) el documento de configuración. */
async function obtenerConfig() {
    let cfg = await Config.findById('config');
    if (!cfg) cfg = await Config.create({ _id: 'config' });
    return cfg;
}

/**
 * Genera el siguiente número de forma atómica: AB-2026-0001
 * Nunca se repite aunque borres presupuestos o guardes dos a la vez.
 */
async function siguienteNumero(prefijo = 'AB') {
    const anio = new Date().getFullYear();
    const id = `presupuesto-${anio}`;

    // Si el contador del año no existe, arranca desde la cantidad ya guardada.
    const existe = await Contador.findById(id);
    if (!existe) {
        const cuantos = await Presupuesto.countDocuments({
            fecha: { $gte: new Date(`${anio}-01-01T00:00:00Z`) }
        });
        try { await Contador.create({ _id: id, seq: cuantos }); } catch (e) { /* otra petición lo creó */ }
    }

    const c = await Contador.findByIdAndUpdate(id, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return `${prefijo || 'AB'}-${anio}-${String(c.seq).padStart(4, '0')}`;
}

module.exports = {
    mongoose, Presupuesto, Config, Contador,
    conectar, obtenerConfig, siguienteNumero
};
