const express = require('express');
const mongoose = require('mongoose'); // Reemplaza sqlite3
const cors = require('cors');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado a MongoDB Atlas'))
    .catch(err => console.error('❌ Error de conexión:', err));

// --- 2. MODELO DE DATOS (Esquema único) ---
const PresupuestoSchema = new mongoose.Schema({
    numero: String,
    cliente: String,
    subtotal: Number,
    iva: Number,
    total: Number,
    con_iva: Boolean,
    moneda: String,
    con_nota: Boolean,
    nota_extra: String,
    fecha: { type: Date, default: Date.now },
    items: [{
        producto: String,
        cantidad: Number,
        precio: Number
    }]
});

const Presupuesto = mongoose.model('Presupuesto', PresupuestoSchema);

// --- 3. RUTAS API ---

// GUARDAR NUEVO
app.post('/presupuesto', async (req, res) => {
    try {
        const count = await Presupuesto.countDocuments();
        const numero = "AB-" + String(count + 1).padStart(4, '0');
        
        const nuevo = new Presupuesto({ ...req.body, numero });
        await nuevo.save();
        res.json({ id: nuevo._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ACTUALIZAR
app.put('/presupuesto/:id', async (req, res) => {
    try {
        await Presupuesto.findByIdAndUpdate(req.params.id, req.body);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LISTAR TODOS
app.get('/presupuestos', async (req, res) => {
    const lista = await Presupuesto.find().sort({ fecha: -1 });
    res.json(lista);
});

// OBTENER UNO SOLO
app.get('/presupuesto/:id', async (req, res) => {
    const p = await Presupuesto.findById(req.params.id);
    if (!p) return res.status(404).json({ error: "No encontrado" });
    res.json(p);
});

// ELIMINAR
app.delete('/presupuesto/:id', async (req, res) => {
    await Presupuesto.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

// --- 4. GENERACIÓN DE PDF ---
app.get('/presupuesto/:id/pdf', async (req, res) => {
    try {
        const p = await Presupuesto.findById(req.params.id);
        if (!p) return res.status(404).send("Error: El presupuesto no existe.");

        const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
        res.setHeader('Content-Type', 'application/pdf');
        doc.pipe(res);

        // Lógica de Logo (Mantenemos tu lógica de .EXE vs VS Code)
        let logoPath = path.join(process.env.NODE_ENV === 'development' || !process.resourcesPath ? __dirname : process.resourcesPath, 'NLOGO.png');

        // CABECERA (Diseño AB Technology)
        doc.save();
        doc.fillOpacity(0.7);
        doc.moveTo(0, 0).lineTo(450, 0).lineTo(300, 110).lineTo(0, 110).fill('#1A1A1A');
        doc.moveTo(450, 0).lineTo(612, 0).lineTo(612, 110).lineTo(200, 110).fill('#ffbf00');
        doc.restore();

        // LOGO
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 0, 0, { width: 160 });
        }
        
        doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
           .text("AB TECHNOLOGY BY, C.A.", 170, 35)
           .text("RIF: J-506865270", 170, 47)
           .text("TELF: +58 4129669616", 170, 59);

        doc.fillColor('#1A1A1A').fontSize(14).font('Helvetica-Bold').text("COTIZACIÓN", 400, 35, { align: 'right' });
        doc.fontSize(10).text(p.numero || 'S/N', 400, 52, { align: 'right' });
        doc.fontSize(8).font('Helvetica').text(`Fecha: ${p.fecha.toLocaleDateString()}`, 400, 65, { align: 'right' });

        doc.moveDown(8).fontSize(9).font('Helvetica-Bold').text("CLIENTE:");
        doc.fontSize(11).font('Helvetica').text((p.cliente || 'S/N').toUpperCase());

        // TABLA DE ITEMS
        let y = 210;
        doc.rect(40, y, 532, 18).fill('#1A1A1A');
        doc.fillColor('#FFC107').fontSize(9).font('Helvetica-Bold').text("DESCRIPCIÓN", 50, y + 5);
        doc.text("CANT.", 380, y + 5).text("P. UNIT.", 440, y + 5).text("TOTAL", 510, y + 5);
        
        y += 25;
        doc.fillColor('#1A1A1A').font('Helvetica').fontSize(8.5);
        
        p.items.forEach(item => {
            const h = doc.heightOfString(item.producto, { width: 310 });
            doc.text(item.producto, 50, y, { width: 310 });
            doc.text(item.cantidad.toString(), 380, y);
            doc.text(`${p.moneda} ${(item.precio || 0).toFixed(2)}`, 440, y);
            doc.text(`${p.moneda} ${(item.cantidad * item.precio || 0).toFixed(2)}`, 510, y);
            y += Math.max(h, 18) + 8;
            doc.moveTo(40, y - 4).lineTo(572, y - 4).strokeColor('#EEE').stroke();
        });

        // TOTALES
        y += 10;
        doc.fontSize(9).font('Helvetica-Bold').text("SUBTOTAL:", 380, y);
        doc.font('Helvetica').text(`${p.moneda} ${(p.subtotal || 0).toFixed(2)}`, 500, y);
        if (p.con_iva) {
            y += 15;
            doc.text("IVA (16%):", 380, y);
            doc.text(`${p.moneda} ${(p.iva || 0).toFixed(2)}`, 500, y);
        }
        y += 20;
        doc.rect(375, y - 5, 197, 22).fill('#1A1A1A');
        doc.fillColor('#FFC107').font('Helvetica-Bold').text("TOTAL A PAGAR:", 385, y + 2);
        doc.text(`${p.moneda} ${(p.total || 0).toFixed(2)}`, 500, y + 2);

        // PIE DE PÁGINA (Tus datos bancarios)
        const footerY = 700;
        doc.rect(40, footerY, 532, 1).fill('#DDD');
        doc.fillColor('#444').fontSize(7).font('Helvetica-Bold').text("BANESCO (CORRIENTE)", 40, footerY + 10);
        doc.font('Helvetica').text(`0134-0086-58-0861267364 | V-19679228`, 40, footerY + 20);
        
        doc.end();
    } catch (err) {
        res.status(500).send("Error generando PDF");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor AB Technology en puerto ${PORT}`));