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

    // 'cotizacion' = oferta previa | 'nota_entrega' = documento de cobro al terminar
    tipo: {
        type: String,
        enum: ['cotizacion', 'nota_entrega', 'factura'],
        default: 'cotizacion',
        index: true
    },

    estado: {
        type: String,
        enum: ['borrador', 'enviado', 'aprobado', 'rechazado', 'anulado',
               'entregada', 'pagada', 'emitida'],
        default: 'borrador',
        index: true
    },

    /* ----- Campos exclusivos de la FACTURA -----
       Se copian del talonario físico: el sistema no los inventa. */
    numero_factura: { type: String, default: '' },   // Ej: 000012
    numero_control: { type: String, default: '' },   // Ej: 00000012 (sin el prefijo)
    forma_pago: {
        type: String,
        enum: ['', 'credito', 'contado', 'efectivo', 'cheque', 'debito', 'tarjeta_credito', 'transferencia', 'otro'],
        default: ''
    },
    referencia_pago: { type: String, default: '' },
    otro_pago:       { type: String, default: '' },
    exento:          { type: Number, default: 0 },
    ajustes:         { type: Number, default: 0 },
    base_imponible:  { type: Number, default: 0 },
    tasa_usada:      { type: Number, default: 0 },   // tasa con la que se convirtió a Bs

    /* Retenciones que el CLIENTE le practica a esta factura.
       Como contribuyente ordinario no retiene: solo le retienen. */
    ret_iva_monto:       { type: Number, default: 0 },
    ret_iva_comprobante: { type: String, default: '' },
    ret_iva_fecha:       { type: Date },
    ret_islr_monto:       { type: Number, default: 0 },
    ret_islr_porcentaje:  { type: Number, default: 0 },
    ret_islr_comprobante: { type: String, default: '' },
    ret_islr_fecha:       { type: Date },
    fecha_cobro:          { type: Date },
    // Moneda en la que se escribieron los precios ('Bs', '$' o '€').
    // El documento SIEMPRE se guarda en bolívares; esto solo sirve para
    // volver a mostrar los montos en divisa al editar.
    moneda_captura:  { type: String, default: 'Bs' },

    // Solo para notas de entrega: detalle de los procesos ejecutados
    trabajo_realizado: { type: String, default: '' },

    // Cotización de la que proviene la nota (si viene de una)
    origen: {
        id: { type: String, default: '' },
        numero: { type: String, default: '' }
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
    prefijo_nota:   { type: String, default: 'NE' },

    // Sincronización del catálogo con la lista en línea de un proveedor
    sincronizacion: {
        url:            { type: String, default: '' },
        url_tasa:       { type: String, default: '' },   // lista con la tasa del día
        apikey:         { type: String, default: '' },
        proveedor:      { type: String, default: '' },
        margen:         { type: Number, default: 0 },
        moneda:         { type: String, default: '$' },
        incluye_iva:    { type: Boolean, default: false },
        campo_nombre:   { type: String, default: '' },   // vacío = detectar solo
        campo_precio:   { type: String, default: '' },
        campo_categoria:{ type: String, default: '' },
        ultima:         { type: Date }
    },

    // Datos que vienen preimpresos en el talonario físico
    factura: {
        prefijo_control: { type: String, default: '00' },
        eslogan:         { type: String, default: 'SOLUCIONES TECNOLOGICAS INTEGRALES' },
        domicilio_1:     { type: String, default: 'Domicilio Fiscal: Calle 107 con Av. 19B Casa N°19B-120. Barrio Pomona.' },
        domicilio_2:     { type: String, default: 'Maracaibo Edo. Zulia Telf.:(0412)-966.96.16' },
        texto_imprenta:  { type: String, default: '' },
        leyenda:         { type: String, default: 'COPIA ADMINISTRATIVA · SIN VALOR FISCAL' },
        // 'truncar' corta los céntimos sobrantes (como en tu talonario escrito a mano);
        // 'redondear' sube cuando pasa de medio céntimo.
        redondeo:        { type: String, enum: ['truncar', 'redondear'], default: 'truncar' },
        nota_pie:        { type: String, default: 'Documento de uso administrativo interno. El comprobante con validez fiscal es el original impreso del talonario autorizado.' }
    },
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
// Colección propia: en la base 'test' puede existir otra colección 'configs'
// de un proyecto distinto, con índices que no son de este sistema.
}, { minimize: false, collection: 'ab_config' });

/* ---------------------------------------------------------------
   4b. COMPRAS (libro de compras del IVA)
   Artículo 75 del Reglamento de la Ley del IVA.
   --------------------------------------------------------------- */
const CompraSchema = new mongoose.Schema({
    fecha:          { type: Date, required: true, index: true },
    tipo_documento: { type: String, enum: ['factura', 'nota_credito', 'nota_debito', 'importacion'], default: 'factura' },
    numero_factura: { type: String, default: '' },
    numero_control: { type: String, default: '' },
    // Para notas de crédito o débito: documento que afectan
    documento_afectado: { type: String, default: '' },

    proveedor: {
        nombre: { type: String, default: '' },
        rif:    { type: String, default: '' }
    },

    // Montos, siempre en bolívares
    total:          { type: Number, default: 0 },   // incluye IVA
    exento:         { type: Number, default: 0 },   // exentas, exoneradas o no sujetas
    base_imponible: { type: Number, default: 0 },
    alicuota:       { type: Number, default: 16 },
    credito_fiscal: { type: Number, default: 0 },   // IVA soportado

    // Retención de IVA practicada por el comprador (no aplica a ordinarios,
    // se conserva la columna porque el formato del libro la exige)
    iva_retenido:          { type: Number, default: 0 },
    comprobante_retencion: { type: String, default: '' },

    observacion: { type: String, default: '' },
    creado:      { type: Date, default: Date.now }
}, { collection: 'ab_compras' });

CompraSchema.index({ fecha: 1, numero_factura: 1 });

/* ---------------------------------------------------------------
   5. CATÁLOGO DE PRODUCTOS (lista de precios a2 y lo que agregues)
   --------------------------------------------------------------- */
const ProductoSchema = new mongoose.Schema({
    nombre:      { type: String, default: '', index: true },
    categoria:   { type: String, default: 'General' },
    // Proveedor del que viene el precio ('' = propio)
    proveedor:   { type: String, default: '', index: true },
    // Margen sobre el precio del proveedor al pasarlo a una cotización
    margen:      { type: Number, default: 0 },
    unidad:      { type: String, default: 'Und' },
    precio:      { type: Number, default: 0 },
    moneda:      { type: String, default: '€' },
    // Los precios publicados por a2 son P.V.P. con IVA incluido.
    incluye_iva: { type: Boolean, default: false },
    activo:      { type: Boolean, default: true },
    orden:       { type: Number, default: 0 },
    actualizado: { type: Date, default: Date.now }
}, { collection: 'ab_catalogo' });

/* ---------------------------------------------------------------
   6. CONTADOR DE NUMERACIÓN (evita folios repetidos)
   --------------------------------------------------------------- */
const ContadorSchema = new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 0 }
}, { collection: 'ab_contadores' });

const Presupuesto = mongoose.model('Presupuesto', PresupuestoSchema);
const Producto    = mongoose.model('Producto', ProductoSchema);
const Compra      = mongoose.model('Compra', CompraSchema);
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
async function siguienteNumero(prefijo = 'AB', tipo = 'cotizacion') {
    const anio = new Date().getFullYear();
    const clave = tipo === 'nota_entrega' ? 'nota' : 'presupuesto';
    const id = `${clave}-${anio}`;

    // Si el contador del año no existe, arranca desde la cantidad ya guardada.
    const existe = await Contador.findById(id);
    if (!existe) {
        const filtro = tipo === 'nota_entrega'
            ? { tipo: 'nota_entrega' }
            : { tipo: { $ne: 'nota_entrega' } };
        filtro.fecha = { $gte: new Date(`${anio}-01-01T00:00:00Z`) };
        const cuantos = await Presupuesto.countDocuments(filtro);
        try { await Contador.create({ _id: id, seq: cuantos }); } catch (e) { /* otra petición lo creó */ }
    }

    const c = await Contador.findByIdAndUpdate(id, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return `${prefijo || 'AB'}-${anio}-${String(c.seq).padStart(4, '0')}`;
}

module.exports = {
    mongoose, Presupuesto, Config, Contador, Producto, Compra,
    conectar, obtenerConfig, siguienteNumero
};
