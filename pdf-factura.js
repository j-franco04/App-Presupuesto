/**
 * pdf-factura.js — Réplica digital del talonario físico de AB TECHNOLOGY BY, C.A.
 *
 * Reproduce el formulario campo por campo: encabezado, recuadros del cliente,
 * tabla de ítems, número de control, formas de pago y columna de totales.
 * Lleva marca de agua porque NO es un documento fiscal: el válido ante el
 * SENIAT es el original impreso del talonario autorizado.
 */
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/* ---------- Medidas del formulario ---------- */
const X0 = 24, X1 = 588;            // bordes izquierdo y derecho
const ANCHO = X1 - X0;              // 564
const NEGRO = '#000000';
const ROJO = '#CC0000';
const GRIS = '#555555';

// Columnas de la tabla de ítems
const C_CANT = 86, C_DESC = 400, C_PU = 500;
// Bloque inferior
const CORTE = 392;                  // separa forma de pago (izq) de totales (der)
const ETIQ = 522;                   // separa etiqueta de valor en los totales

const FILAS_ITEMS = 16;
const ALTO_FILA = 22;

/* ---------- Utilidades ---------- */
function nf(n) {
    const s = (Number(n) || 0).toFixed(2);
    const [e, d] = s.split('.');
    return e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
}
function rutaLogo() {
    return [path.join(__dirname, 'public', 'NLOGO.png'), path.join(__dirname, 'NLOGO.png')]
        .find(p => fs.existsSync(p)) || null;
}
function caja(doc, x, y, w, h, grosor) {
    doc.lineWidth(grosor || 1).strokeColor(NEGRO).rect(x, y, w, h).stroke();
}
function etiqueta(doc, texto, x, y, tam) {
    doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(tam || 8.5)
        .text(texto, x, y, { lineBreak: false });
}
function valor(doc, texto, x, y, ancho, tam) {
    doc.fillColor('#111111').font('Helvetica').fontSize(tam || 10)
        .text(String(texto || ''), x, y, { width: ancho, height: (tam || 10) + 3, ellipsis: true, lineBreak: false });
}
/** Círculo de selección, relleno si está marcado. */
function circulo(doc, x, y, marcado) {
    doc.lineWidth(0.9).strokeColor(NEGRO).circle(x, y, 3.6).stroke();
    if (marcado) doc.fillColor(NEGRO).circle(x, y, 2.2).fill();
}

/* ---------- Marca de agua ---------- */
function marcaAgua(doc, texto) {
    doc.save();
    doc.rotate(-48, { origin: [306, 396] });
    // Se achica hasta que entre en un solo renglón: así no se parte a la mitad
    let tam = 30;
    doc.font('Helvetica-Bold').fontSize(tam);
    while (doc.widthOfString(texto) > 620 && tam > 12) { tam -= 1; doc.fontSize(tam); }
    doc.fillColor('#9E9E9E').fillOpacity(0.18)
        .text(texto, -44, 396 - tam, { width: 700, align: 'center', lineBreak: false });
    doc.fillOpacity(1);
    doc.restore();
}

/* ---------- Bloques ---------- */
function encabezado(doc, cfg) {
    const e = cfg.empresa || {};
    const f = cfg.factura || {};
    const y = 24, h = 88;

    doc.lineWidth(1.2).strokeColor(NEGRO).roundedRect(X0, y, ANCHO, h, 6).stroke();

    // Recuadro del logo
    caja(doc, X0 + 6, y + 5, 74, 56, 1);
    const logo = rutaLogo();
    if (logo) {
        try { doc.image(logo, X0 + 10, y + 12, { fit: [66, 42], align: 'center', valign: 'center' }); }
        catch (err) { /* logo ilegible */ }
    }

    const cx = X0 + 86, cw = ANCHO - 92;
    doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(19)
        .text(e.nombre || 'AB TECHNOLOGY BY, C.A.', cx, y + 7, { width: cw, align: 'center' });
    doc.font('Helvetica-BoldOblique').fontSize(10.5)
        .text(f.eslogan || '', cx, y + 31, { width: cw, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8.5)
        .text(`RIF.: ${e.rif || ''}`, X0 + 6, y + 68, { width: 110, lineBreak: false });

    doc.font('Helvetica-Bold').fontSize(7.8)
        .text(f.domicilio_1 || '', cx + 20, y + 62, { width: cw - 20, align: 'center' })
        .text(f.domicilio_2 || '', cx + 20, y + 72, { width: cw - 20, align: 'center' });

    return y + h;
}

function fechaYNumero(doc, p, cfg, y) {
    const f = new Date(p.fecha || Date.now());
    const dia = String(f.getDate()).padStart(2, '0');
    const mes = String(f.getMonth() + 1).padStart(2, '0');
    const anio = String(f.getFullYear()).slice(2);

    const anchoCelda = 56, hCab = 11, hVal = 17;
    ['DIA', 'MES', 'AÑO'].forEach((t, i) => {
        const x = X0 + i * anchoCelda;
        caja(doc, x, y, anchoCelda, hCab, 0.9);
        caja(doc, x, y + hCab, anchoCelda, hVal, 0.9);
        doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(7.5)
            .text(t, x, y + 3, { width: anchoCelda, align: 'center', lineBreak: false });
        doc.font('Helvetica').fontSize(11)
            .text([dia, mes, anio][i], x, y + hCab + 4, { width: anchoCelda, align: 'center', lineBreak: false });
    });

    doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(14)
        .text('FACTURA', 330, y + 6, { lineBreak: false });
    doc.fontSize(12).text('N°', 412, y + 7, { lineBreak: false });
    doc.fillColor(ROJO).font('Helvetica-Bold').fontSize(15)
        .text(p.numero_factura || '', 432, y + 5, { width: 150, lineBreak: false });

    return y + hCab + hVal + 3;
}

function datosCliente(doc, p, y) {
    const c = p.cliente || {};

    // Nombre y/o Razón Social
    caja(doc, X0, y, ANCHO, 38);
    etiqueta(doc, 'Nombre y/o Razón Social:', X0 + 5, y + 5);
    valor(doc, (c.nombre || '').toUpperCase(), X0 + 135, y + 4, ANCHO - 142, 11);
    y += 38;

    // Domicilio Fiscal (dos renglones)
    caja(doc, X0, y, ANCHO, 46);
    etiqueta(doc, 'Domicilio Fiscal:', X0 + 5, y + 5);
    doc.fillColor('#111111').font('Helvetica').fontSize(10)
        .text(c.direccion || '', X0 + 95, y + 4, { width: ANCHO - 102, height: 36, ellipsis: true });
    y += 46;

    // RIF / C.I. y Teléfono
    caja(doc, X0, y, ANCHO, 26);
    doc.lineWidth(1).moveTo(CORTE, y).lineTo(CORTE, y + 26).stroke();
    etiqueta(doc, 'RIF/C.I.:', X0 + 5, y + 8);
    valor(doc, c.rif, X0 + 55, y + 7, CORTE - X0 - 62, 10.5);
    etiqueta(doc, 'TELF.:', CORTE + 6, y + 8);
    valor(doc, c.telefono, CORTE + 44, y + 7, X1 - CORTE - 50, 10.5);

    return y + 26 + 4;
}

function tablaItems(doc, p, y) {
    const hCab = 18;
    caja(doc, X0, y, ANCHO, hCab);
    [C_CANT, C_DESC, C_PU].forEach(x => doc.moveTo(x, y).lineTo(x, y + hCab).stroke());

    doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(9);
    doc.text('CANT.', X0, y + 5, { width: C_CANT - X0, align: 'center', lineBreak: false });
    doc.text('DESCRIPCIÓN', C_CANT, y + 5, { width: C_DESC - C_CANT, align: 'center', lineBreak: false });
    doc.text('P / U', C_DESC, y + 5, { width: C_PU - C_DESC, align: 'center', lineBreak: false });
    doc.text('TOTAL', C_PU, y + 5, { width: X1 - C_PU, align: 'center', lineBreak: false });
    y += hCab;

    const items = (p.items || []).slice(0, FILAS_ITEMS);

    for (let i = 0; i < FILAS_ITEMS; i++) {
        const yy = y + i * ALTO_FILA;
        caja(doc, X0, yy, ANCHO, ALTO_FILA, 0.7);
        [C_CANT, C_DESC, C_PU].forEach(x => {
            doc.lineWidth(0.7).moveTo(x, yy).lineTo(x, yy + ALTO_FILA).stroke();
        });

        const it = items[i];
        if (!it) continue;

        doc.fillColor('#111111').font('Helvetica').fontSize(9.5);
        doc.text(String(it.cantidad ?? ''), X0, yy + 6, { width: C_CANT - X0, align: 'center', lineBreak: false });
        doc.fontSize(9).text(it.producto || '', C_CANT + 5, yy + 6,
            { width: C_DESC - C_CANT - 10, height: 12, ellipsis: true, lineBreak: false });
        doc.fontSize(9.5);
        doc.text(nf(it.precio), C_DESC, yy + 6, { width: C_PU - C_DESC - 5, align: 'right', lineBreak: false });
        doc.text(nf((it.cantidad || 0) * (it.precio || 0)), C_PU, yy + 6,
            { width: X1 - C_PU - 5, align: 'right', lineBreak: false });
    }

    return y + FILAS_ITEMS * ALTO_FILA;
}

function bloqueInferior(doc, p, cfg, y) {
    const f = cfg.factura || {};
    const alto = 122;

    /* ----- Izquierda: control y formas de pago ----- */
    caja(doc, X0, y, CORTE - X0, alto);

    // N° DE CONTROL
    const hCtrl = 22;
    doc.lineWidth(1).moveTo(X0, y + hCtrl).lineTo(CORTE, y + hCtrl).stroke();
    doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(9.5)
        .text(`N° DE CONTROL ${f.prefijo_control || '00'}`, X0 + 5, y + 7, { lineBreak: false });
    doc.fillColor(ROJO).font('Helvetica-Bold').fontSize(9)
        .text('—', X0 + 128, y + 7, { lineBreak: false });
    doc.fontSize(12.5)
        .text(p.numero_control || '', X0 + 148, y + 5, { width: 150, lineBreak: false });

    // FORMA DE PAGO
    let yy = y + hCtrl + 5;
    doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(8.5)
        .text('FORMA DE PAGO', X0 + 5, yy, { lineBreak: false });
    yy += 14;

    const fp = p.forma_pago || '';
    doc.font('Helvetica').fontSize(8);
    const fila1 = [['CRÉDITO', 'credito', X0 + 5], ['CONTADO', 'contado', X0 + 78],
                   ['EFECTIVO', 'efectivo', X0 + 158], ['CHEQUE', 'cheque', X0 + 240]];
    fila1.forEach(([txt, clave, x]) => {
        doc.fillColor(NEGRO).text(txt, x, yy, { lineBreak: false });
        circulo(doc, x + doc.widthOfString(txt) + 7, yy + 4, fp === clave);
    });
    yy += 17;

    const fila2 = [['Tarj. de Débito', 'debito', X0 + 5], ['Tarj. de Crédito', 'tarjeta_credito', X0 + 108]];
    fila2.forEach(([txt, clave, x]) => {
        doc.fillColor(NEGRO).text(txt, x, yy, { lineBreak: false });
        circulo(doc, x + doc.widthOfString(txt) + 7, yy + 4, fp === clave);
    });
    doc.text('Otro:', X0 + 220, yy, { lineBreak: false });
    circulo(doc, X0 + 243, yy + 4, fp === 'otro');
    doc.lineWidth(0.6).moveTo(X0 + 250, yy + 9).lineTo(CORTE - 6, yy + 9).stroke();
    if (fp === 'otro') valor(doc, p.otro_pago, X0 + 252, yy, CORTE - X0 - 260, 8);
    yy += 17;

    doc.fillColor(NEGRO).font('Helvetica').fontSize(8)
        .text('Transferencia', X0 + 5, yy, { lineBreak: false });
    circulo(doc, X0 + 58, yy + 4, fp === 'transferencia');
    doc.text('N° de Ref.:', X0 + 70, yy, { lineBreak: false });
    doc.lineWidth(0.6).moveTo(X0 + 120, yy + 9).lineTo(CORTE - 6, yy + 9).stroke();
    valor(doc, p.referencia_pago, X0 + 123, yy, CORTE - X0 - 132, 8.5);

    /* ----- Derecha: columna de totales ----- */
    const filas = [
        ['Sub - Total Bs.', nf(p.subtotal)],
        ['Total Base Imponible Bs.', nf(p.base_imponible)],
        ['Total Exento Bs.', p.exento ? nf(p.exento) : ''],
        ['Ajustes      Bs.', p.ajustes ? nf(p.ajustes) : ''],
        [`I.V.A ${p.iva_porcentaje || 0}%   Bs.`, p.con_iva ? nf(p.iva) : ''],
        ['TOTAL A PAGAR Bs.', nf(p.total)]
    ];
    const hFila = alto / filas.length;

    filas.forEach((fila, i) => {
        const yy2 = y + i * hFila;
        caja(doc, CORTE, yy2, X1 - CORTE, hFila, 0.9);
        doc.lineWidth(0.9).moveTo(ETIQ, yy2).lineTo(ETIQ, yy2 + hFila).stroke();

        const ultima = i === filas.length - 1;
        doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(ultima ? 8.8 : 8.4)
            .text(fila[0], CORTE + 4, yy2 + hFila / 2 - 4, { width: ETIQ - CORTE - 8, align: 'right', lineBreak: false });
        doc.fillColor('#111111').font(ultima ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5)
            .text(fila[1], ETIQ + 3, yy2 + hFila / 2 - 5, { width: X1 - ETIQ - 7, align: 'right', lineBreak: false });
    });

    return y + alto;
}

function pieLegal(doc, cfg, p, y) {
    const f = cfg.factura || {};

    if (f.texto_imprenta) {
        doc.fillColor('#333333').font('Helvetica').fontSize(4.6)
            .text(f.texto_imprenta, X0, y + 3, { width: ANCHO, align: 'center', height: 14, lineGap: 0.4, ellipsis: true });
    }

    const yy = y + 20;
    doc.lineWidth(0.6).strokeColor('#999999').moveTo(X0, yy).lineTo(X1, yy).stroke();
    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(6.6)
        .text(f.leyenda || '', X0, yy + 5, { width: ANCHO, align: 'center', height: 9, lineBreak: false });
    doc.font('Helvetica').fontSize(5.9)
        .text(f.nota_pie || '', X0, yy + 15, { width: ANCHO, align: 'center', height: 9, ellipsis: true });

    if (p.tasa_usada > 0) {
        doc.fontSize(5.9).fillColor('#777777')
            .text(`Montos convertidos a bolívares con tasa ${nf(p.tasa_usada)}.`,
                X0, yy + 25, { width: ANCHO, align: 'center', height: 9, lineBreak: false });
    }
}

/* ---------- Función principal ---------- */
function generarFactura(p, cfg, stream) {
    const doc = new PDFDocument({
        size: 'LETTER',
        margin: 24,
        bufferPages: true,
        info: {
            Title: `Factura ${p.numero_factura || ''} (copia administrativa)`,
            Author: (cfg.empresa && cfg.empresa.nombre) || 'AB TECHNOLOGY BY',
            Subject: 'Copia administrativa sin valor fiscal'
        }
    });
    doc.pipe(stream);
    doc.page.margins.bottom = 0;   // el formulario ocupa una hoja exacta

    marcaAgua(doc, (cfg.factura && cfg.factura.leyenda) || 'SIN VALOR FISCAL');

    let y = encabezado(doc, cfg);
    y = fechaYNumero(doc, p, cfg, y + 2);
    y = datosCliente(doc, p, y);
    y = tablaItems(doc, p, y);
    y = bloqueInferior(doc, p, cfg, y + 2);
    pieLegal(doc, cfg, p, y);

    doc.end();
    return doc;
}

module.exports = { generarFactura, nf };
