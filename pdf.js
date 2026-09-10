/**
 * pdf.js — Generación del PDF de la cotización
 * AB TECHNOLOGY BY, C.A.
 */
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/* ---------- Constantes de diseño ---------- */
const M = 40;                 // margen
const PW = 612;               // ancho carta
const CW = 532;               // ancho útil
const FIN = 572;              // borde derecho útil
const LIMITE = 692;           // y máximo para contenido antes de saltar de página
const TOPE = 58;              // y inicial en páginas siguientes

const NEGRO = '#1A1A1A';
const AMARILLO = '#FFC107';
const GRIS = '#6B7280';
const LINEA = '#E5E7EB';
const CEBRA = '#FAFAFA';

const COL = {
    desc:  { x: 46,  w: 240 },
    cant:  { x: 292, w: 42 },
    unid:  { x: 340, w: 52 },
    punit: { x: 398, w: 78 },
    tot:   { x: 482, w: 84 }
};

/* ---------- Utilidades ---------- */
function nf(n) {
    const s = (Number(n) || 0).toFixed(2);
    const [ent, dec] = s.split('.');
    return ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}
function money(n, mon) { return `${mon || '$'} ${nf(n)}`; }
function fecha(d) {
    const f = new Date(d || Date.now());
    const p = x => String(x).padStart(2, '0');
    return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()}`;
}
function sumarDias(d, dias) {
    const f = new Date(d || Date.now());
    f.setDate(f.getDate() + (Number(dias) || 0));
    return f;
}
function nombreMoneda(m) {
    if (m === '€' || m === 'EUR') return 'Euros';
    if (m === 'Bs' || m === 'Bs.') return 'Bolívares';
    return 'Dólares';
}
function rutaLogo() {
    const posibles = [
        path.join(__dirname, 'public', 'NLOGO.png'),
        path.join(__dirname, 'NLOGO.png')
    ];
    return posibles.find(p => fs.existsSync(p)) || null;
}

/* ---------- Bloques del documento ---------- */

function cabecera(doc, p, cfg) {
    const e = cfg.empresa || {};

    // Banda diagonal corporativa (derecha)
    doc.save();
    doc.moveTo(372, 0).lineTo(PW, 0).lineTo(PW, 118).lineTo(312, 118).fill(NEGRO);
    doc.moveTo(352, 0).lineTo(370, 0).lineTo(310, 118).lineTo(292, 118).fill(AMARILLO);
    doc.restore();

    // Logo sobre fondo blanco (así se ven bien sus dos colores)
    const logo = rutaLogo();
    if (logo) {
        try { doc.image(logo, M, 18, { width: 126 }); } catch (err) { /* logo ilegible */ }
    } else {
        doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(20).text('AB', M, 40);
    }

    // Datos de la empresa dentro de la banda negra
    let ty = 24;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5)
        .text(e.nombre || '', 390, ty, { width: 182, align: 'right' });
    ty += 13;
    doc.font('Helvetica').fontSize(7.5).fillColor('#E5E5E5');
    const lineas = [
        e.rif ? `RIF: ${e.rif}` : '',
        e.telefono || '',
        e.email || '',
        e.web || '',
        e.direccion || ''
    ].filter(Boolean);
    lineas.forEach(l => {
        const h = doc.heightOfString(l, { width: 182 });
        if (ty + h < 112) { doc.text(l, 390, ty, { width: 182, align: 'right' }); ty += h + 1; }
    });

    return 134;
}

function filaDato(doc, x, y, w, label, valor) {
    const txt = (valor === undefined || valor === null || valor === '') ? '—' : String(valor);
    doc.font('Helvetica').fontSize(9);
    const h = Math.max(doc.heightOfString(txt, { width: w - 76 }), 11);
    doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(7)
        .text(label, x + 8, y + 2, { width: 58, lineBreak: false });
    doc.fillColor(NEGRO).font('Helvetica').fontSize(9)
        .text(txt, x + 68, y, { width: w - 76 });
    return h + 5;
}

function tituloBloque(doc, x, y, w, texto) {
    doc.rect(x, y, w, 17).fill(NEGRO);
    doc.fillColor(AMARILLO).font('Helvetica-Bold').fontSize(8)
        .text(texto, x + 8, y + 5, { width: w - 16, lineBreak: false });
    return y + 17;
}

function bloqueDatos(doc, p, cfg, y) {
    const izqX = M, izqW = 300;
    const derX = 352, derW = 220;
    const c = p.cliente || {};

    // ----- Cliente -----
    let yi = tituloBloque(doc, izqX, y, izqW, 'DATOS DEL CLIENTE') + 6;
    yi += filaDato(doc, izqX, yi, izqW, 'CLIENTE', (c.nombre || 'CLIENTE GENERAL').toUpperCase());
    yi += filaDato(doc, izqX, yi, izqW, 'RIF / C.I.', c.rif);
    yi += filaDato(doc, izqX, yi, izqW, 'DIRECCIÓN', c.direccion);
    if (c.contacto) yi += filaDato(doc, izqX, yi, izqW, 'CONTACTO', c.contacto);
    yi += filaDato(doc, izqX, yi, izqW, 'TELÉFONO', c.telefono);
    if (c.email) yi += filaDato(doc, izqX, yi, izqW, 'CORREO', c.email);
    yi += 4;

    // ----- Documento -----
    const esNota = p.tipo === 'nota_entrega';
    let yd = tituloBloque(doc, derX, y, derW, esNota ? 'NOTA DE ENTREGA' : 'COTIZACIÓN') + 6;
    yd += filaDato(doc, derX, yd, derW, 'N° FOLIO', p.numero || 'S/N');
    yd += filaDato(doc, derX, yd, derW, 'FECHA', fecha(p.fecha));
    if (esNota) {
        if (p.origen && p.origen.numero) yd += filaDato(doc, derX, yd, derW, 'COTIZACIÓN', p.origen.numero);
    } else {
        yd += filaDato(doc, derX, yd, derW, 'VÁLIDA HASTA', fecha(sumarDias(p.fecha, p.validez_dias)));
    }
    yd += filaDato(doc, derX, yd, derW, 'MONEDA', `${p.moneda} (${nombreMoneda(p.moneda)})`);
    if (p.tasa_bcv > 0) yd += filaDato(doc, derX, yd, derW, 'TASA BCV', nf(p.tasa_bcv));
    yd += 4;

    const fin = Math.max(yi, yd);
    doc.lineWidth(0.7).strokeColor(LINEA);
    doc.rect(izqX, y, izqW, fin - y).stroke();
    doc.rect(derX, y, derW, fin - y).stroke();

    return fin + 20;
}

function encabezadoTabla(doc, y) {
    doc.rect(M, y, CW, 20).fill(NEGRO);
    doc.fillColor(AMARILLO).font('Helvetica-Bold').fontSize(7.5);
    doc.text('DESCRIPCIÓN', COL.desc.x, y + 6.5, { width: COL.desc.w, lineBreak: false });
    doc.text('CANT.', COL.cant.x, y + 6.5, { width: COL.cant.w, align: 'right', lineBreak: false });
    doc.text('UNIDAD', COL.unid.x, y + 6.5, { width: COL.unid.w, align: 'center', lineBreak: false });
    doc.text('P. UNITARIO', COL.punit.x, y + 6.5, { width: COL.punit.w, align: 'right', lineBreak: false });
    doc.text('TOTAL', COL.tot.x, y + 6.5, { width: COL.tot.w, align: 'right', lineBreak: false });
    return y + 20;
}

function tablaItems(doc, p, y) {
    y = encabezadoTabla(doc, y);
    const items = (p.items || []).filter(i => (i.producto || '').trim() !== '' || i.cantidad || i.precio);

    items.forEach((it, i) => {
        doc.font('Helvetica').fontSize(8.5);
        const texto = it.producto || '—';
        const alto = Math.max(doc.heightOfString(texto, { width: COL.desc.w }), 11) + 11;

        if (y + alto > LIMITE) {
            doc.addPage();
            y = encabezadoTabla(doc, TOPE);
        }

        if (i % 2 === 1) doc.rect(M, y, CW, alto).fill(CEBRA);

        const ty = y + 5.5;
        doc.fillColor(NEGRO).font('Helvetica').fontSize(8.5);
        doc.text(texto, COL.desc.x, ty, { width: COL.desc.w });
        doc.text(String(it.cantidad ?? 0), COL.cant.x, ty, { width: COL.cant.w, align: 'right', lineBreak: false });
        doc.fillColor(GRIS).text(it.unidad || 'Und', COL.unid.x, ty, { width: COL.unid.w, align: 'center', lineBreak: false });
        doc.fillColor(NEGRO).text(money(it.precio, p.moneda), COL.punit.x, ty, { width: COL.punit.w, align: 'right', lineBreak: false });
        doc.font('Helvetica-Bold').text(money((it.cantidad || 0) * (it.precio || 0), p.moneda), COL.tot.x, ty, { width: COL.tot.w, align: 'right', lineBreak: false });

        y += alto;
        doc.moveTo(M, y).lineTo(FIN, y).lineWidth(0.5).strokeColor(LINEA).stroke();
    });

    if (items.length === 0) {
        doc.fillColor(GRIS).font('Helvetica-Oblique').fontSize(9)
            .text('Sin ítems cargados.', COL.desc.x, y + 8);
        y += 26;
    }
    return y + 16;
}

function totales(doc, p, y) {
    const x = 330, w = 242;
    const etiqW = 128, valX = x + 132, valW = w - 140;
    const altoBloque = 100 + (p.tasa_bcv > 0 ? 16 : 0);

    if (y + altoBloque > LIMITE) { doc.addPage(); y = TOPE; }

    const fila = (label, valor, negrita) => {
        doc.fillColor(negrita ? NEGRO : GRIS)
            .font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
            .text(label, x + 4, y, { width: etiqW, align: 'right', lineBreak: false });
        doc.fillColor(NEGRO).font(negrita ? 'Helvetica-Bold' : 'Helvetica')
            .text(valor, valX, y, { width: valW, align: 'right', lineBreak: false });
        y += 15;
    };

    fila('Subtotal:', money(p.bruto, p.moneda));
    if (p.descuento_monto > 0) {
        const et = p.descuento_tipo === 'porcentaje'
            ? `Descuento (${nf(p.descuento_valor).replace(',00', '')}%):`
            : 'Descuento:';
        fila(et, '- ' + money(p.descuento_monto, p.moneda));
        fila('Base imponible:', money(p.subtotal, p.moneda), true);
    }
    if (p.con_iva) fila(`IVA (${nf(p.iva_porcentaje).replace(',00', '')}%):`, money(p.iva, p.moneda));

    y += 4;
    doc.rect(x, y, w, 26).fill(NEGRO);
    doc.fillColor(AMARILLO).font('Helvetica-Bold').fontSize(10)
        .text('TOTAL A PAGAR', x + 8, y + 8.5, { width: 100, lineBreak: false });
    doc.fontSize(11)
        .text(money(p.total, p.moneda), x + 108, y + 8, { width: w - 116, align: 'right', lineBreak: false });
    y += 30;

    if (p.tasa_bcv > 0) {
        doc.fillColor(GRIS).font('Helvetica').fontSize(8)
            .text(`Equivalente referencial: Bs. ${nf(p.total * p.tasa_bcv)}  (tasa ${nf(p.tasa_bcv)})`,
                x, y, { width: w, align: 'right' });
        y += 14;
    }
    return y + 14;
}

function bloqueTexto(doc, y, titulo, texto) {
    if (!texto) return y;
    doc.font('Helvetica').fontSize(8.5);
    const h = doc.heightOfString(texto, { width: CW - 16 });
    if (y + h + 30 > LIMITE) { doc.addPage(); y = TOPE; }
    doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(8).text(titulo, M, y);
    doc.fillColor('#333333').font('Helvetica').fontSize(8.5).text(texto, M, y + 11, { width: CW - 16 });
    return y + 11 + h + 10;
}

/**
 * Banda compacta de formas de pago.
 * Se ancla SIEMPRE al pie de la página, justo encima de la línea del footer,
 * para que no quede flotando en medio de la hoja ni empuje contenido.
 * Solo salta de página si de verdad no queda espacio libre.
 */
function altoMetodos(lista) {
    if (!lista.length) return 0;
    return 19 + Math.ceil(lista.length / 3) * 31;
}

function dibujarMetodos(doc, y, lista) {
    doc.rect(M, y, CW, 14).fill(NEGRO);
    doc.fillColor(AMARILLO).font('Helvetica-Bold').fontSize(6.8)
        .text('DATOS PARA EL PAGO', M + 8, y + 4, { width: 200, lineBreak: false });

    const ancho = (CW - 12) / 3;

    lista.forEach((m, i) => {
        const x = M + (i % 3) * (ancho + 6);
        const yy = y + 19 + Math.floor(i / 3) * 31;

        doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(7.2)
            .text(m.nombre || m.banco || m.tipo || 'Pago', x, yy, { width: ancho, height: 9, ellipsis: true });

        doc.fillColor('#333333').font('Helvetica').fontSize(7.2)
            .text(m.numero || m.detalle || '', x, yy + 8.5, { width: ancho, height: 9, ellipsis: true });

        const pie = [m.titular, m.documento].filter(Boolean).join(' · ') || (m.tipo || '');
        doc.fillColor(GRIS).font('Helvetica').fontSize(6.4)
            .text(pie, x, yy + 17, { width: ancho, height: 8, ellipsis: true });
    });
}

/**
 * Pie del documento: firmas (solo en notas de entrega) y formas de pago.
 * Los dos bloques viajan juntos y se anclan al final de la hoja, así nunca
 * quedan flotando en el medio ni se separan uno del otro.
 */
function pieDocumento(doc, p, y) {
    const lista = (p.metodos_pago || []).filter(Boolean).slice(0, 9);
    const altoPagos = altoMetodos(lista);
    const conFirmas = p.tipo === 'nota_entrega';
    const altoFirmas = conFirmas ? ALTO_FIRMAS : 0;
    const separacion = (altoFirmas && altoPagos) ? 8 : 0;
    const total = altoFirmas + separacion + altoPagos;
    if (!total) return y;

    // Si cabe en la hoja actual se ancla abajo; si hay que pasar de página,
    // se coloca arriba para no dejar una hoja casi en blanco.
    const tope = 734 - total;             // 10 pt por encima de la línea del pie
    let yy = tope;
    if (y > tope) { doc.addPage(); yy = TOPE; }
    if (altoFirmas) { dibujarFirmas(doc, yy); yy += altoFirmas + separacion; }
    if (altoPagos) dibujarMetodos(doc, yy, lista);
    return yy + altoPagos;
}

const ALTO_FIRMAS = 54;

function dibujarFirmas(doc, y) {
    const ancho = 240;

    [['ENTREGADO POR', 'AB TECHNOLOGY BY, C.A.'], ['RECIBIDO CONFORME', 'Nombre, C.I. y fecha']]
        .forEach((par, i) => {
            const x = M + i * 292;
            doc.moveTo(x, y + 32).lineTo(x + ancho, y + 32).lineWidth(0.7).strokeColor('#9A9A94').stroke();
            doc.fillColor(NEGRO).font('Helvetica-Bold').fontSize(7.5)
                .text(par[0], x, y + 37, { width: ancho, align: 'center' });
            doc.fillColor(GRIS).font('Helvetica').fontSize(6.8)
                .text(par[1], x, y + 47, { width: ancho, align: 'center' });
        });
}

function pies(doc, cfg) {
    const e = cfg.empresa || {};
    const r = doc.bufferedPageRange();
    for (let i = r.start; i < r.start + r.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        doc.moveTo(M, 744).lineTo(FIN, 744).lineWidth(0.5).strokeColor(LINEA).stroke();
        doc.fillColor(GRIS).font('Helvetica').fontSize(7)
            .text([e.nombre, e.rif ? 'RIF ' + e.rif : '', e.telefono].filter(Boolean).join('  ·  '),
                M, 750, { width: 380, lineBreak: false });
        doc.text(`Página ${i + 1} de ${r.count}`, 372, 750, { width: 200, align: 'right', lineBreak: false });
    }
    doc.flushPages();
}

/* ---------- Función principal ---------- */
function generarPDF(p, cfg, stream) {
    const doc = new PDFDocument({
        size: 'LETTER',
        margin: M,
        bufferPages: true,
        info: {
            Title: `${p.tipo === 'nota_entrega' ? 'Nota de entrega' : 'Cotización'} ${p.numero || ''}`,
            Author: (cfg.empresa && cfg.empresa.nombre) || 'AB TECHNOLOGY BY',
            Subject: `Documento para ${(p.cliente && p.cliente.nombre) || ''}`
        }
    });
    doc.pipe(stream);

    let y = cabecera(doc, p, cfg);
    y = bloqueDatos(doc, p, cfg, y);
    y = tablaItems(doc, p, y);
    y = totales(doc, p, y);

    const esNota = p.tipo === 'nota_entrega';

    if (esNota && p.trabajo_realizado) {
        y = bloqueTexto(doc, y, 'DETALLE DEL TRABAJO REALIZADO', p.trabajo_realizado);
    }

    const condiciones = [
        p.condiciones_pago ? `Condiciones de pago: ${p.condiciones_pago}` : '',
        (!esNota && p.tiempo_entrega) ? `Tiempo de entrega: ${p.tiempo_entrega}` : '',
        esNota
            ? ''
            : `Validez de la oferta: ${p.validez_dias || 0} días (hasta el ${fecha(sumarDias(p.fecha, p.validez_dias))}).`
    ].filter(Boolean).join('\n');

    y = bloqueTexto(doc, y, esNota ? 'CONDICIONES DE PAGO' : 'CONDICIONES COMERCIALES', condiciones);

    if (p.con_nota) {
        const plantilla = cfg.nota_bcv || '';
        y = bloqueTexto(doc, y, 'NOTA BCV', plantilla.replace('{moneda}', nombreMoneda(p.moneda)));
    }
    if (p.nota_extra) y = bloqueTexto(doc, y, 'COMENTARIOS ADICIONALES', p.nota_extra);

    y = pieDocumento(doc, p, y);

    pies(doc, cfg);
    doc.end();
    return doc;
}

module.exports = { generarPDF, nf, money };
