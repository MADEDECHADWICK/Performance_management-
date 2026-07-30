import PDFDocument from 'pdfkit';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { storeGeneratedUploadBuffer } from '../config/uploads';

type InvoiceDbClient = Prisma.TransactionClient | typeof prisma;

type InvoiceForPdf = {
  invoiceNumber: string;
  title: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountOutstanding: number;
  dueDate: Date | null;
  issuedAt: Date | null;
  notes: string | null;
  client: { clientName: string; contactEmail?: string | null; contactPhone?: string | null; address?: string | null };
  job: { jobName: string; jobCode?: string | null };
  lines: Array<{ description: string; quantity: number; unitPrice: number; lineAmount: number }>;
  footer: string;
};

const roundCurrency = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const sanitizeGeneratedFileName = (value: string) =>
  String(value || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

const BRAND = {
  darkBlue: '#0f172a',
  orange: '#f97316',
  slate: '#475569',
  lightSlate: '#94a3b8',
  white: '#ffffff',
  rowAlt: '#f1f5f9',
  border: '#e2e8f0',
};

const drawInvoicePdf = (doc: PDFKit.PDFDocument, inv: InvoiceForPdf) => {
  const M = 50;
  const PAGE_W = 595.28;
  const RIGHT = PAGE_W - M;
  const CONTENT_W = RIGHT - M;
  const fmt = (n: number) =>
    n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const logoSize = 65;
  try { doc.image(LOGO_PATH, M, M, { width: logoSize, height: logoSize }); } catch { /* skip */ }

  doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.darkBlue)
     .text('RONALDS LLP', M + logoSize + 10, M + 10);
  doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate)
     .text('Performance Management', M + logoSize + 10, M + 30);

  doc.font('Helvetica-Bold').fontSize(24).fillColor(BRAND.orange)
     .text('TAX INVOICE', M, M, { width: CONTENT_W, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.lightSlate)
     .text(inv.invoiceNumber, M, M + 30, { width: CONTENT_W, align: 'right', lineBreak: false });

  const divY = M + logoSize + 12;
  doc.moveTo(M, divY).lineTo(RIGHT, divY).lineWidth(2.5).strokeColor(BRAND.orange).stroke();

  let leftY = divY + 14;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.lightSlate).text('BILL TO', M, leftY);
  leftY += 11;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.darkBlue).text(inv.client.clientName, M, leftY);
  leftY += 17;
  if (inv.client.address) {
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate).text(inv.client.address, M, leftY);
    leftY += 12;
  }
  if (inv.client.contactEmail) {
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate).text(inv.client.contactEmail, M, leftY);
    leftY += 12;
  }
  if (inv.client.contactPhone) {
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate).text(inv.client.contactPhone, M, leftY);
    leftY += 12;
  }
  leftY += 5;
  doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate)
     .text(`Job: ${inv.job.jobName}${inv.job.jobCode ? ` (${inv.job.jobCode})` : ''}`, M, leftY, { width: CONTENT_W * 0.52 });
  leftY += 12;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.darkBlue)
     .text(inv.title, M, leftY, { width: CONTENT_W * 0.52 });

  const META_X = M + CONTENT_W * 0.55;
  const META_TOTAL_W = RIGHT - META_X;
  const META_LABEL_W = 72;
  const META_VAL_W = META_TOTAL_W - META_LABEL_W - 8;
  const META_ROW_H = 17;
  const metaRows = [
    { label: 'Invoice #', value: inv.invoiceNumber },
    { label: 'Issue Date', value: inv.issuedAt ? inv.issuedAt.toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB') },
    { label: 'Due Date', value: inv.dueDate ? inv.dueDate.toLocaleDateString('en-GB') : 'On receipt' },
    { label: 'Status', value: String(inv.status).replace(/_/g, ' ') },
    { label: 'Currency', value: inv.currency },
  ];
  const META_BOX_H = metaRows.length * META_ROW_H + 14;
  doc.rect(META_X - 8, divY + 8, META_TOTAL_W + 8, META_BOX_H).fill('#f1f5f9');
  let metaY = divY + 16;
  metaRows.forEach(({ label, value }) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.lightSlate)
       .text(label.toUpperCase(), META_X, metaY, { width: META_LABEL_W, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.darkBlue)
       .text(value, META_X + META_LABEL_W, metaY, { width: META_VAL_W, lineBreak: false, ellipsis: true });
    metaY += META_ROW_H;
  });

  const TABLE_TOP = Math.max(leftY, metaY) + 20;
  const ROW_H = 20;
  const C = {
    desc: M,
    qty: M + CONTENT_W * 0.57,
    rate: M + CONTENT_W * 0.70,
    amt: M + CONTENT_W * 0.83,
    amtW: CONTENT_W * 0.17,
  };

  doc.rect(M, TABLE_TOP, CONTENT_W, ROW_H).fill(BRAND.darkBlue);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.white);
  doc.text('DESCRIPTION', C.desc + 5, TABLE_TOP + 6, { width: CONTENT_W * 0.55, lineBreak: false });
  doc.text('QTY', C.qty, TABLE_TOP + 6, { width: CONTENT_W * 0.11, align: 'center', lineBreak: false });
  doc.text('RATE', C.rate, TABLE_TOP + 6, { width: CONTENT_W * 0.11, align: 'right', lineBreak: false });
  doc.text('AMOUNT', C.amt, TABLE_TOP + 6, { width: C.amtW, align: 'right', lineBreak: false });

  let rowY = TABLE_TOP + ROW_H;
  inv.lines.forEach((line, i) => {
    if (rowY > doc.page.height - 200) { doc.addPage(); rowY = M; }
    doc.rect(M, rowY, CONTENT_W, ROW_H).fill(i % 2 === 0 ? BRAND.white : BRAND.rowAlt);
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.darkBlue);
    doc.text(line.description, C.desc + 5, rowY + 6, { width: CONTENT_W * 0.55 - 5, lineBreak: false, ellipsis: true });
    doc.text(line.quantity.toFixed(2), C.qty, rowY + 6, { width: CONTENT_W * 0.11, align: 'center', lineBreak: false });
    doc.text(fmt(line.unitPrice), C.rate, rowY + 6, { width: CONTENT_W * 0.11, align: 'right', lineBreak: false });
    doc.text(fmt(line.lineAmount), C.amt, rowY + 6, { width: C.amtW, align: 'right', lineBreak: false });
    rowY += ROW_H;
  });

  doc.moveTo(M, rowY).lineTo(RIGHT, rowY).lineWidth(0.5).strokeColor(BRAND.border).stroke();
  rowY += 14;

  if (inv.notes) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.slate).text('Notes:', M, rowY);
    rowY += 12;
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate).text(inv.notes, M, rowY, { width: CONTENT_W * 0.55 });
    rowY += 22;
  }

  const TOT_X = M + CONTENT_W * 0.55;
  const TOT_LABEL_W = CONTENT_W * 0.25;
  const TOT_VAL_W = CONTENT_W * 0.20;
  const drawTotRow = (label: string, value: string, bold = false, bg?: string) => {
    if (bg) doc.rect(TOT_X, rowY, TOT_LABEL_W + TOT_VAL_W, 22).fill(bg);
    const color = bg ? BRAND.white : (bold ? BRAND.darkBlue : BRAND.slate);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(color);
    doc.text(label, TOT_X + 6, rowY + 7, { width: TOT_LABEL_W - 6, lineBreak: false });
    doc.text(value, TOT_X + TOT_LABEL_W, rowY + 7, { width: TOT_VAL_W - 5, align: 'right', lineBreak: false });
    rowY += 22;
  };

  drawTotRow('Subtotal', `${inv.currency} ${fmt(inv.subtotalAmount)}`);
  drawTotRow('Tax', `${inv.currency} ${fmt(inv.taxAmount)}`);
  drawTotRow('TOTAL DUE', `${inv.currency} ${fmt(inv.totalAmount)}`, true, BRAND.orange);
  if (inv.amountPaid > 0) {
    rowY += 4;
    drawTotRow('Amount Paid', `${inv.currency} ${fmt(inv.amountPaid)}`);
    drawTotRow('Balance Due', `${inv.currency} ${fmt(inv.amountOutstanding)}`, true);
  }

  const FOOTER_Y = doc.page.height - 70;
  doc.moveTo(M, FOOTER_Y).lineTo(RIGHT, FOOTER_Y).lineWidth(1.5).strokeColor(BRAND.orange).stroke();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.darkBlue)
     .text(`Payment Reference: ${inv.invoiceNumber}`, M, FOOTER_Y + 8, { width: CONTENT_W });
  doc.font('Helvetica').fontSize(8).fillColor(BRAND.slate)
     .text(inv.footer, M, FOOTER_Y + 22, { width: CONTENT_W });
};

const createPdfBuffer = async (
  draw: (doc: PDFKit.PDFDocument) => void
): Promise<Buffer> =>
  new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    draw(doc as unknown as PDFKit.PDFDocument);
    doc.end();
  });

const writeGeneratedDocumentFile = async (fileName: string, buffer: Buffer) =>
  storeGeneratedUploadBuffer({
    bucket: 'documents',
    fileName: sanitizeGeneratedFileName(fileName),
    buffer,
    mimeType: 'application/pdf',
  });

const fetchInvoiceForPdf = async (
  db: InvoiceDbClient,
  jobInvoiceId: number
) => {
  const invoice = await db.jobInvoice.findUnique({
    where: { id: jobInvoiceId },
    include: {
      job: { select: { id: true, jobName: true, jobCode: true } },
      client: { select: { id: true, clientName: true, contactEmail: true, contactPhone: true, address: true } },
      template: true,
      lines: { orderBy: { sortOrder: 'asc' } },
      document: { select: { id: true, fileName: true, filePath: true } },
    },
  });
  if (!invoice) throw new Error('Invoice not found');
  return invoice;
};

const buildInvoiceForPdf = (
  invoice: Awaited<ReturnType<typeof fetchInvoiceForPdf>>
): InvoiceForPdf => {
  const td = invoice.template?.templateDefinition &&
    typeof invoice.template.templateDefinition === 'object' &&
    !Array.isArray(invoice.template.templateDefinition)
      ? (invoice.template.templateDefinition as Record<string, unknown>)
      : {};
  return {
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title || String(td.title || 'Tax Invoice'),
    status: invoice.status,
    currency: invoice.currency,
    subtotalAmount: roundCurrency(Number(invoice.subtotalAmount || 0)),
    taxAmount: roundCurrency(Number(invoice.taxAmount || 0)),
    totalAmount: roundCurrency(Number(invoice.totalAmount || 0)),
    amountPaid: roundCurrency(Number(invoice.amountPaid || 0)),
    amountOutstanding: roundCurrency(Number(invoice.amountOutstanding || 0)),
    dueDate: invoice.dueDate,
    issuedAt: invoice.issuedAt,
    notes: invoice.notes ?? null,
    client: {
      clientName: invoice.client.clientName,
      contactEmail: invoice.client.contactEmail,
      contactPhone: invoice.client.contactPhone,
      address: invoice.client.address,
    },
    job: { jobName: invoice.job.jobName, jobCode: invoice.job.jobCode },
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity || 0),
      unitPrice: roundCurrency(Number(line.unitPrice || 0)),
      lineAmount: roundCurrency(Number(line.lineAmount || 0)),
    })),
    footer: String(td.footer || 'Please remit payment using the invoice number as the payment reference.'),
  };
};

export const renderInvoicePdfBuffer = async (
  invoiceId: number
): Promise<{ buffer: Buffer; invoiceNumber: string }> => {
  const invoice = await fetchInvoiceForPdf(prisma, invoiceId);
  const data = buildInvoiceForPdf(invoice);
  const buffer = await createPdfBuffer((doc) => drawInvoicePdf(doc as unknown as PDFKit.PDFDocument, data));
  return { buffer, invoiceNumber: invoice.invoiceNumber };
};

export const generateJobInvoiceDocument = async (
  tx: Prisma.TransactionClient,
  jobInvoiceId: number
) => {
  const invoice = await fetchInvoiceForPdf(tx, jobInvoiceId);
  const data = buildInvoiceForPdf(invoice);
  const pdfBuffer = await createPdfBuffer((doc) => drawInvoicePdf(doc as unknown as PDFKit.PDFDocument, data));

  const fileName = `${invoice.invoiceNumber}.pdf`;
  const stored = await writeGeneratedDocumentFile(fileName, pdfBuffer);

  let documentId = invoice.document?.id ?? null;
  if (documentId) {
    await tx.document.update({
      where: { id: documentId },
      data: {
        fileName: stored.storedName,
        filePath: stored.publicPath,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        documentType: 'job_invoice',
        entityType: 'job_invoice',
        entityId: invoice.id,
        description: `Generated invoice ${invoice.invoiceNumber}`,
      },
    });
  } else {
    const createdDocument = await tx.document.create({
      data: {
        fileName: stored.storedName,
        filePath: stored.publicPath,
        fileSize: pdfBuffer.length,
        mimeType: 'application/pdf',
        documentType: 'job_invoice',
        entityType: 'job_invoice',
        entityId: invoice.id,
        description: `Generated invoice ${invoice.invoiceNumber}`,
      },
    });
    documentId = createdDocument.id;
  }

  await tx.jobInvoice.update({
    where: { id: invoice.id },
    data: {
      documentId,
      generatedAt: new Date(),
    },
  });

  return documentId;
};
