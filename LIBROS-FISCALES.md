# Libros de IVA, retenciones y declaración

> **Esto no es asesoría fiscal.** El sistema organiza y calcula, pero la responsabilidad ante el SENIAT es tuya. Muéstrale este documento a tu contador antes de usar los libros para declarar.

---

## 1. Qué se construyó

Un botón nuevo en la barra superior, **Libros**, abre una pantalla con tres pestañas:

- **Ventas** — se arma solo con las facturas que cargas en el sistema.
- **Compras** — lo alimentas registrando las facturas que te dan tus proveedores.
- **Resumen** — los montos del período que deben coincidir con tu declaración.

Todo es mensual y se puede descargar en CSV para abrirlo en Excel, o imprimir.

---

## 2. Por qué el libro de ventas incluye facturas no cobradas

Pediste contabilizar solo las pagadas y lo hablamos: el débito fiscal del IVA nace cuando **emites** la factura, no cuando cobras. Si el libro salta de la factura 000010 a la 000012 porque la 000011 no te la han pagado, el correlativo queda roto y es lo primero que detecta una fiscalización.

La solución que quedó: el libro incluye todas las facturas del mes, y tu control de cobranza vive en la columna **Cobrada**, que es interna y no forma parte del libro legal. Así tienes las dos cosas.

Las facturas que marques como **anuladas** aparecen con montos en cero pero conservan su número, que es la forma correcta de registrarlas sin romper la secuencia.

---

## 3. Columnas de cada libro

Siguen los artículos 75 a 78 del Reglamento de la Ley del IVA.

**Libro de ventas:** fecha, número de factura, número de control, nombre o razón social del cliente, RIF, total de ventas incluyendo IVA, ventas exentas o no gravadas, base imponible, alícuota, débito fiscal, IVA retenido por el cliente y número del comprobante de retención.

**Libro de compras:** fecha, tipo de documento, número de factura, número de control, proveedor, RIF, total de compras incluyendo IVA, compras exentas, base imponible, alícuota y crédito fiscal.

Las **notas de crédito** que te emita un proveedor se restan automáticamente del crédito fiscal del mes; aparecen en rojo y con montos negativos.

---

## 4. Cómo registrar una compra

Libros → Compras → **Registrar compra**.

Escribe el total **con IVA incluido** y la alícuota: el sistema despeja la base imponible y el crédito fiscal solo. Si una parte es exenta, ponla en su campo y se descuenta antes del cálculo. Verás el resultado en el recuadro amarillo antes de guardar.

Para notas de crédito y débito aparece un campo extra donde indicas qué factura afectan.

---

## 5. Retenciones que te practican

Como **contribuyente ordinario** no eres agente de retención: no retienes a tus proveedores, pero tus clientes calificados como contribuyentes especiales sí te retienen a ti.

Eso se carga en la factura: abre la factura, despliega **Retenciones que me practicó el cliente** y llena los datos cuando recibas el comprobante.

- **IVA retenido.** El botón *Calcular 75%* sugiere el porcentaje general, pero siempre verifica contra el comprobante: puede ser 100% si el IVA no estaba discriminado o si la factura tenía algún defecto formal. Lo retenido se descuenta de tu cuota del mes.
- **ISLR retenido.** Queda como anticipo de tu impuesto anual. Guarda el porcentaje aplicado y el número del comprobante.

> La norma vigente de retenciones de IVA es la **Providencia SNAT/2025/000054** (Gaceta Oficial 43.171 del 16 de julio de 2025), en vigor desde el 1 de agosto de 2025, que derogó la vieja SNAT/2015/0049. Si tu contador todavía cita la 0049, vale la pena que lo sepa.

---

## 5b. La pestaña Retenciones

Libros → **Retenciones** muestra la relación de todo lo que te retuvieron en el mes, con el número de cada comprobante, y además tres acumulados:

- **ISLR retenido del mes**
- **ISLR acumulado del año** — este es el que le entregas a tu contador para la declaración anual de renta, porque es dinero que ya adelantaste al fisco
- **IVA retenido del año**

Se descarga en CSV igual que los libros. Guarda los comprobantes físicos: sin ellos no puedes descontar lo retenido.

### Porcentajes que te aplican

AB TECHNOLOGY BY es una **persona jurídica domiciliada**, así que según el artículo 9 del Decreto 1.808:

| Concepto | % que te retienen | Numeral |
|---|---|---|
| Servicios contratados o subcontratados | **2%** | 11 |
| Honorarios profesionales | **5%** | 1, literal b |
| Fletes y transporte | 3% | 5 |
| Arrendamiento de bienes muebles | 5% | 13 |

Lo más común en tu caso es el **2% por servicios contratados**. Algunos clientes clasifican el soporte técnico como honorarios profesionales y retienen 5%; ninguna de las dos es un error tuyo, depende de cómo lo registre el cliente.

**El ISLR se calcula sobre la base imponible, nunca sobre el total con IVA.** El selector de concepto en la factura rellena el porcentaje y el botón Calcular aplica la fórmula correcta. En tu factura de ejemplo: 44.127,66 × 2% = 882,55. Si alguien lo calculara sobre el total con IVA daría 1.023,76, que estaría mal.

El **sustraendo** (UT × % × 83,3334) solo aplica a personas naturales residentes, así que a ti no te afecta.

---

## 6. El resumen del período

La pestaña Resumen calcula:

```
Débito fiscal        (IVA de tus ventas)
− Crédito fiscal     (IVA de tus compras)
= Cuota tributaria
− IVA retenido       (lo que te retuvieron tus clientes)
= IVA a pagar
```

Si lo retenido supera la cuota, en vez de "IVA a pagar" verás **Excedente a trasladar**: ese saldo pasa al mes siguiente y se va descontando. Es una situación normal cuando la mayoría de tus clientes son contribuyentes especiales.

El ISLR retenido se muestra aparte porque no entra en el IVA: es anticipo de tu declaración anual de renta.

---

## 7. Datos de referencia vigentes

| Concepto | Valor | Fuente |
|---|---|---|
| Alícuota general del IVA | 16% | Ley del IVA |
| Alícuota reducida | 8% | Ley del IVA |
| Alícuota de bienes suntuarios | 31% | Ley del IVA |
| Retención general de IVA | 75% del impuesto causado | Providencia SNAT/2025/000054 |
| Retención de IVA en casos especiales | 100% | Providencia SNAT/2025/000054 |
| Unidad Tributaria | Bs 43,00 | G.O. 43.140 del 02/06/2025 |
| Sustraendo ISLR | UT × % retención × 83,3334 | Decreto 1.808 |
| ISLR honorarios, persona natural residente | 3% | Decreto 1.808 |
| ISLR honorarios, persona jurídica domiciliada | 5% | Decreto 1.808 |
| IGTF sobre pagos en divisas | 3% | Ley de IGTF |

---

## 8. Lo que el sistema todavía no hace

Te lo digo para que no te confíes:

- **No calcula el IGTF.** Si cobras en divisas en efectivo, Zelle o cripto, ese 3% hay que manejarlo aparte y tiene su propia declaración mensual.
- **No genera la Forma 30 ni el archivo TXT** del portal del SENIAT. Te da los montos para que los cargues o se los pases a tu contador.
- **No lleva el libro de inventarios** ni los libros del Código de Comercio.
- **No calcula el ISLR anual.** Solo acumula lo que te retuvieron como anticipo.

Si alguna de esas cosas te hace falta, se puede agregar. Dímelo.
