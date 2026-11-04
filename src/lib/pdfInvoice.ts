import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateId, formatRupiah, PAYMENT_STATUS_LABELS } from './formatters.ts';

export interface InvoicePdfPayload {
  invoice: {
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    subtotal: number;
    additionalCost: number;
    discount: number;
    grandTotal: number;
    verifiedPaidAmount: number;
    refundedAmount: number;
    remainingAmount: number;
    status: string;
    notes?: string;
  };
  order: {
    orderNumber: string;
    title: string;
  };
  customer: {
    name: string;
    company?: string;
    phone: string;
    email?: string;
    address?: string;
  };
  items: Array<{
    productName: string;
    specifications?: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
  }>;
  payments: Array<{
    paymentNumber: string;
    paymentType: string;
    method: string;
    amount: number;
    verificationStatus: string;
    paidAt: string;
  }>;
  business?: {
    name: string;
    industry?: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
  settings?: {
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountHolder?: string;
    invoiceFooterNotes?: string;
  } | null;
}

export function downloadInvoicePdf(payload: InvoicePdfPayload) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;

  // Header Brand & Invoice Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(payload.business?.name || 'OrderFlow Workspace', margin, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(payload.business?.address || 'Indonesia', margin, 72);
  doc.text(
    [payload.business?.phone, payload.business?.email].filter(Boolean).join(' · '),
    margin,
    86
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(79, 70, 229);
  doc.text('INVOICE', pageWidth - margin, 56, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(payload.invoice.invoiceNumber, pageWidth - margin, 74, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Status: ${PAYMENT_STATUS_LABELS[payload.invoice.status] || payload.invoice.status}`,
    pageWidth - margin,
    89,
    { align: 'right' }
  );

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 104, pageWidth - margin, 104);

  // Customer & Order Meta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('DITAGIHKAN KEPADA', margin, 126);
  doc.text('DETAIL PESANAN', pageWidth / 2 + 20, 126);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(payload.customer.name, margin, 143);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  let custY = 158;
  if (payload.customer.company) {
    doc.text(payload.customer.company, margin, custY);
    custY += 14;
  }
  doc.text(`Telp: ${payload.customer.phone}`, margin, custY);
  custY += 14;
  if (payload.customer.address) {
    const addrLines = doc.splitTextToSize(payload.customer.address, 220);
    doc.text(addrLines, margin, custY);
  }

  const metaX = pageWidth / 2 + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`No. Pesanan: ${payload.order.orderNumber}`, metaX, 143);
  doc.text(`Pekerjaan: ${payload.order.title.slice(0, 38)}`, metaX, 158);
  doc.text(`Tanggal Terbit: ${formatDateId(payload.invoice.issueDate)}`, metaX, 173);
  doc.text(`Jatuh Tempo: ${formatDateId(payload.invoice.dueDate)}`, metaX, 188);

  // Items Table
  autoTable(doc, {
    startY: 214,
    margin: { left: margin, right: margin },
    head: [['Produk & Spesifikasi', 'Jumlah', 'Harga Satuan', 'Total']],
    body: payload.items.map((it) => [
      it.specifications ? `${it.productName}\n(${it.specifications})` : it.productName,
      `${it.quantity} ${it.unit}`,
      formatRupiah(it.unitPrice),
      formatRupiah(it.lineTotal),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: 8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      1: { halign: 'right', cellWidth: 75 },
      2: { halign: 'right', cellWidth: 105 },
      3: { halign: 'right', cellWidth: 115 },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 320;
  let sumY = finalY + 24;
  const labelX = pageWidth - margin - 210;
  const valX = pageWidth - margin;

  const drawSummaryRow = (label: string, val: string, bold = false, accent = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(accent ? 79 : 51, accent ? 70 : 65, accent ? 229 : 85);
    doc.text(label, labelX, sumY);
    doc.text(val, valX, sumY, { align: 'right' });
    sumY += bold ? 20 : 16;
  };

  drawSummaryRow('Subtotal Produk', formatRupiah(payload.invoice.subtotal));
  if (payload.invoice.additionalCost > 0) {
    drawSummaryRow('Biaya Tambahan', formatRupiah(payload.invoice.additionalCost));
  }
  if (payload.invoice.discount > 0) {
    drawSummaryRow('Diskon', `- ${formatRupiah(payload.invoice.discount)}`);
  }
  doc.setDrawColor(203, 213, 225);
  doc.line(labelX, sumY - 8, valX, sumY - 8);
  drawSummaryRow('Grand Total', formatRupiah(payload.invoice.grandTotal), true);
  drawSummaryRow(
    'Terbayar (Terverifikasi)',
    formatRupiah(payload.invoice.verifiedPaidAmount - payload.invoice.refundedAmount)
  );
  drawSummaryRow('Sisa Tagihan', formatRupiah(payload.invoice.remainingAmount), true, true);

  // Bank Info & Notes
  let footY = Math.max(sumY + 20, finalY + 30);
  if (footY > 720) {
    doc.addPage();
    footY = 56;
  }

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footY, pageWidth - margin, footY);
  footY += 20;

  if (payload.settings?.bankName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Informasi Rekening Pembayaran:', margin, footY);
    footY += 14;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${payload.settings.bankName} — ${payload.settings.bankAccountNumber} a.n. ${payload.settings.bankAccountHolder}`,
      margin,
      footY
    );
    footY += 18;
  }

  const footerNote = payload.invoice.notes || payload.settings?.invoiceFooterNotes || '';
  if (footerNote) {
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const wrapped = doc.splitTextToSize(footerNote, pageWidth - margin * 2);
    doc.text(wrapped, margin, footY);
  }

  doc.save(`Invoice-${payload.invoice.invoiceNumber}.pdf`);
}
