const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS presupuestos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT, cliente TEXT, subtotal REAL, iva REAL, total REAL, 
        con_iva INTEGER, moneda TEXT, con_nota INTEGER, nota_extra TEXT, fecha TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, presupuesto_id INTEGER, 
        producto TEXT, cantidad INTEGER, precio REAL
    )`);
});

// GUARDAR NUEVO
app.post('/presupuesto', (req, res) => {
    const { cliente, subtotal, iva, total, con_iva, moneda, con_nota, nota_extra, items } = req.body;
    db.get("SELECT COUNT(*) as count FROM presupuestos", (err, row) => {
        const numero = "AB-" + String(row.count + 1).padStart(4, '0');
        db.run(`INSERT INTO presupuestos (numero, cliente, subtotal, iva, total, con_iva, moneda, con_nota, nota_extra, fecha) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
            [numero, cliente, subtotal, iva, total, con_iva ? 1 : 0, moneda, con_nota ? 1 : 0, nota_extra], function(err) {
                const pId = this.lastID;
                const stmt = db.prepare(`INSERT INTO items (presupuesto_id, producto, cantidad, precio) VALUES (?, ?, ?, ?)`);
                items.forEach(item => stmt.run(pId, item.producto, item.cantidad, item.precio));
                stmt.finalize();
                res.json({ id: pId });
            });
    });
});

// ACTUALIZAR EXISTENTE
app.put('/presupuesto/:id', (req, res) => {
    const id = req.params.id;
    const { cliente, subtotal, iva, total, con_iva, moneda, con_nota, nota_extra, items } = req.body;
    db.run(`UPDATE presupuestos SET cliente=?, subtotal=?, iva=?, total=?, con_iva=?, moneda=?, con_nota=?, nota_extra=? WHERE id=?`,
        [cliente, subtotal, iva, total, con_iva ? 1 : 0, moneda, con_nota ? 1 : 0, nota_extra, id], (err) => {
            db.run(`DELETE FROM items WHERE presupuesto_id = ?`, [id], () => {
                const stmt = db.prepare(`INSERT INTO items (presupuesto_id, producto, cantidad, precio) VALUES (?, ?, ?, ?)`);
                items.forEach(item => stmt.run(id, item.producto, item.cantidad, item.precio));
                stmt.finalize();
                res.json({ ok: true });
            });
        });
});

app.get('/presupuestos', (req, res) => {
    db.all("SELECT * FROM presupuestos ORDER BY id DESC", (err, rows) => res.json(rows));
});

app.get('/presupuesto/:id', (req, res) => {
    db.get("SELECT * FROM presupuestos WHERE id = ?", [req.params.id], (err, p) => {
        db.all("SELECT * FROM items WHERE presupuesto_id = ?", [req.params.id], (err, items) => res.json({ ...p, items }));
    });
});

app.delete('/presupuesto/:id', (req, res) => {
    db.run(`DELETE FROM presupuestos WHERE id = ?`, [req.params.id], () => res.json({ ok: true }));
});

// PDF CON DISEÑO ACTUALIZADO (TRANSPARENCIAS)
app.get('/presupuesto/:id/pdf', (req, res) => {
    db.get("SELECT * FROM presupuestos WHERE id = ?", [req.params.id], (err, p) => {
        db.all("SELECT * FROM items WHERE presupuesto_id = ?", [req.params.id], (err, items) => {
            const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);

            // --- CABECERA TRANSVERSAL CON 70% OPACIDAD ---
            doc.save();
            doc.fillOpacity(0.7); // Aplicar transparencia del 70%

            // Mitad Izquierda (Gris Oscuro de la A)
            doc.moveTo(0, 0)
               .lineTo(450, 0)
               .lineTo(300, 110)
               .lineTo(0, 110)
               .fill('#1A1A1A');

            // Mitad Derecha (Amarillo de la B)
            doc.moveTo(450, 0)
               .lineTo(612, 0)
               .lineTo(612, 110)
               .lineTo(200, 110)
               .fill('#ffbf00');
            
            doc.restore(); // Volver a opacidad normal (100%) para el texto

            // --- LOGO DE FONDO (MARCA DE AGUA) ---
            // Centrado verticalmente, tirado a la izquierda, 80% transparencia
            try {
                doc.save();
                doc.fillOpacity(0.2); // 80% de transparencia (opacidad 0.2)
                doc.image('NLOGO.png', 280, 450, { width: 340 }); 
                doc.restore();
            } catch (e) {}

            // LOGO CABECERA (Opacidad 100%)
            try { doc.image('NLOGO.png', 0, 0, { width: 160 }); } catch (e) {}

            // DATOS CABECERA
            doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
               .text("AB TECHNOLOGY BY, C.A.", 170, 35)
               .text("RIF: J-506865270", 170, 47)
               .text("TELF: +58 4129669616", 170, 59, { link: 'https://wa.me/584129669616' });

            doc.fillColor('#1A1A1A').fontSize(14).font('Helvetica-Bold').text("COTIZACIÓN", 400, 35, { align: 'right' });
            doc.fontSize(10).text(p.numero, 400, 52, { align: 'right' });
            doc.fontSize(8).font('Helvetica').text(`Fecha: ${p.fecha}`, 400, 65, { align: 'right' });

            // CLIENTE
            doc.fillColor('#1A1A1A').moveDown(8).fontSize(9).font('Helvetica-Bold').text("CLIENTE:");
            doc.fontSize(11).font('Helvetica').text(p.cliente.toUpperCase());

            // TABLA
            let y = 210;
            doc.rect(40, y, 532, 18).fill('#1A1A1A');
            doc.fillColor('#FFC107').fontSize(9).font('Helvetica-Bold').text("DESCRIPCIÓN", 50, y + 5);
            doc.text("CANT.", 380, y + 5).text("P. UNIT.", 440, y + 5).text("TOTAL", 510, y + 5);
            
            y += 25;
            doc.fillColor('#1A1A1A').font('Helvetica').fontSize(8.5);
            items.forEach(item => {
                const h = doc.heightOfString(item.producto, { width: 310 });
                doc.text(item.producto, 50, y, { width: 310 });
                doc.text(item.cantidad, 380, y);
                doc.text(`${p.moneda} ${item.precio.toFixed(2)}`, 440, y);
                doc.text(`${p.moneda} ${(item.cantidad * item.precio).toFixed(2)}`, 510, y);
                y += Math.max(h, 18) + 8;
                doc.moveTo(40, y - 4).lineTo(572, y - 4).strokeColor('#EEE').stroke();
            });

            // Totales
            y += 10;
            doc.fontSize(9).font('Helvetica-Bold').text("SUBTOTAL:", 380, y);
            doc.font('Helvetica').text(`${p.moneda} ${p.subtotal.toFixed(2)}`, 500, y);
            if (p.con_iva) {
                y += 15;
                doc.text("IVA (16%):", 380, y);
                doc.text(`${p.moneda} ${p.iva.toFixed(2)}`, 500, y);
            }
            y += 20;
            doc.rect(375, y - 5, 197, 22).fill('#1A1A1A');
            doc.fillColor('#FFC107').font('Helvetica-Bold').text("TOTAL A PAGAR:", 385, y + 2);
            doc.text(`${p.moneda} ${p.total.toFixed(2)}`, 500, y + 2);

            // Notas
            y += 40;
            if (p.con_nota) {
                doc.fillColor('#1A1A1A').fontSize(8).font('Helvetica-Bold').text("TASA OFICIAL:", 40, y);
                doc.font('Helvetica').text(`Se maneja la tasa oficial del banco central de Venezuela (${p.moneda === '$' ? 'Dólar' : 'Euro'}) a la fecha del pago.`, 40, y + 12);
                y += 35;
            }
            if (p.nota_extra) {
                doc.fillColor('#1A1A1A').fontSize(8).font('Helvetica-Bold').text("NOTAS ADICIONALES:", 40, y);
                doc.font('Helvetica').text(p.nota_extra, 40, y + 12, { width: 500 });
            }

            // PIE DE PÁGINA (Datos Bancarios)
            const footerY = 700;
            doc.rect(40, footerY, 532, 1).fill('#DDD');
            doc.fillColor('#444').fontSize(7).font('Helvetica-Bold').text("BANESCO (CORRIENTE)", 40, footerY + 10);
            doc.font('Helvetica').text(`0134-0086-58-0861267364 | V-19679228`, 40, footerY + 20);
            doc.text(`Pago Móvil: 0412-9669616 | V-19679228`, 40, footerY + 30);
            
            doc.font('Helvetica-Bold').text("DIVISAS / INTERNACIONAL", 300, footerY + 10);
            doc.font('Helvetica').text(`Zelle: Carlos Correa | 201 647-8602`, 300, footerY + 20);
            doc.text(`Binance ID: 201717550 | javier.franco04@gmail.com`, 300, footerY + 30);

            doc.end();
        });
    });
});

app.listen(3000, () => console.log("Servidor AB Technology BY Activo"));