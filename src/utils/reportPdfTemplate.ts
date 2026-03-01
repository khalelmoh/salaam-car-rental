import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportFilterItem {
  label: string;
  value: string | number;
}

interface ReportSummaryCard {
  label: string;
  value: string | number;
}

interface ReportPdfOptions {
  title: string;
  subtitle?: string;
  companyName?: string;
  generatedAt?: string;
  summaryLine?: string;
  filters?: ReportFilterItem[];
  summaryCards?: ReportSummaryCard[];
  headers: string[];
  rows: Array<Array<string | number>>;
  fileName: string;
  footerText?: string;
  columnStyles?: Record<number, { cellWidth?: number }>;
}

export function downloadStyledReportPdf(options: ReportPdfOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const generatedAt = options.generatedAt || new Date().toLocaleString();
  const companyName = options.companyName || 'Salaam Car Rental';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 24;
  const innerWidth = pageWidth - marginX * 2;

  const filterLine = (options.filters || [])
    .map((item) => `${item.label}: ${item.value}`)
    .join('   |   ') || 'Filters: All';

  const drawHeader = () => {
    doc.setFillColor(246, 249, 252);
    doc.rect(marginX, 18, innerWidth, 132, 'F');
    doc.setDrawColor(219, 228, 239);
    doc.rect(marginX, 18, innerWidth, 132);

    doc.setFillColor(16, 92, 191);
    doc.roundedRect(marginX + 12, 30, 90, 18, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('OFFICIAL REPORT', marginX + 20, 42);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(18);
    doc.text(options.title, marginX + 12, 72);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    doc.text(companyName, marginX + 12, 92);
    doc.text(`Generated: ${generatedAt}`, marginX + 12, 108);
    if (options.subtitle) {
      doc.text(options.subtitle, marginX + 12, 124);
    }
    doc.text(filterLine, marginX + 12, 140);

    if (options.summaryLine) {
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(options.summaryLine, pageWidth - 260, 108, { maxWidth: 240, align: 'right' });
    }
  };

  const drawSummaryCards = () => {
    const cards = options.summaryCards || [];
    if (!cards.length) return;
    const maxCards = Math.min(cards.length, 4);
    const gap = 10;
    const cardWidth = (innerWidth - gap * (maxCards - 1)) / maxCards;
    for (let idx = 0; idx < maxCards; idx += 1) {
      const card = cards[idx];
      const x = marginX + (cardWidth + gap) * idx;
      const y = 162;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, cardWidth, 50, 6, 6, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, cardWidth, 50, 6, 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(String(card.label), x + 10, y + 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(String(card.value), x + 10, y + 38, { maxWidth: cardWidth - 20 });
    }
  };

  drawHeader();
  drawSummaryCards();

  autoTable(doc, {
    startY: options.summaryCards?.length ? 226 : 166,
    head: [options.headers],
    body: options.rows,
    styles: {
      fontSize: 8.8,
      cellPadding: 5.5,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.45,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [235, 242, 251],
      textColor: [30, 41, 59],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [250, 252, 255],
    },
    columnStyles: options.columnStyles || {},
    margin: { left: marginX, right: marginX, top: 18, bottom: 30 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader();
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 22, pageWidth - marginX, pageHeight - 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(options.footerText || 'Salaam Car Rental - Internal Report', marginX, pageHeight - 10);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - marginX, pageHeight - 10, { align: 'right' });
  }

  doc.save(options.fileName);
}
