interface PdfColumn {
  key: string;
  label: string;
  width: number;
}

interface PdfTable {
  title: string;
  columns: PdfColumn[];
  rows: Array<Record<string, string | number>>;
}

interface PdfSummaryItem {
  label: string;
  value: string | number;
}

interface PdfReportInput {
  title: string;
  generatedAt?: string;
  summary?: PdfSummaryItem[];
  tables?: PdfTable[];
  companyName?: string;
  page?: {
    orientation?: 'portrait' | 'landscape';
    fontSize?: number;
    lineHeight?: number;
  };
}

const escapePdfText = (text: string) =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');

const toText = (value: string | number | undefined) => String(value ?? '');
const repeat = (char: string, count: number) => new Array(Math.max(0, count)).fill(char).join('');

const centerText = (text: string, width: number) => {
  const clean = text.slice(0, width);
  if (clean.length >= width) return clean;
  const left = Math.floor((width - clean.length) / 2);
  return `${repeat(' ', left)}${clean}`;
};

const fitCell = (text: string, width: number) => {
  if (width <= 1) return '';
  if (text.length <= width) return text.padEnd(width, ' ');
  return `${text.slice(0, Math.max(0, width - 1))}~`;
};

const horizontalBorder = (columns: PdfColumn[], fill = '-') =>
  `+${columns.map((c) => repeat(fill, c.width + 2)).join('+')}+`;

const renderBorderedRow = (columns: PdfColumn[], row: Record<string, string | number>) =>
  `| ${columns.map((c) => fitCell(toText(row[c.key]), c.width)).join(' | ')} |`;

export const createPdfReport = (input: PdfReportInput) => {
  const orientation = input.page?.orientation || 'portrait';
  const pageWidth = orientation === 'landscape' ? 842 : 612;
  const pageHeight = orientation === 'landscape' ? 612 : 842;
  const fontSize = input.page?.fontSize || 13;
  const lineHeight = input.page?.lineHeight || 13;
  const estimatedMaxChars = orientation === 'landscape' ? 160 : 110;
  const companyName = input.companyName || 'SALAAM CAR RENTAL';
  const generatedAt = input.generatedAt || new Date().toLocaleString();
  const reportRef = `RPT-${Date.now().toString().slice(-8)}`;

  const lines: string[] = [];
  lines.push(repeat('=', estimatedMaxChars));
  lines.push(centerText(companyName, estimatedMaxChars));
  lines.push(centerText(input.title.toUpperCase(), estimatedMaxChars));
  lines.push(repeat('-', estimatedMaxChars));
  lines.push(`Generated On : ${generatedAt}`);
  lines.push(`Report Ref   : ${reportRef}`);
  lines.push(repeat('=', estimatedMaxChars));
  lines.push('');

  if (input.summary && input.summary.length > 0) {
    const metricWidth = Math.min(40, Math.floor(estimatedMaxChars * 0.4));
    const valueWidth = estimatedMaxChars - metricWidth - 3;
    const summaryCols: PdfColumn[] = [
      { key: 'metric', label: 'METRIC', width: metricWidth },
      { key: 'value', label: 'VALUE', width: valueWidth },
    ];
    lines.push('[ SUMMARY ]');
    lines.push(horizontalBorder(summaryCols, '-'));
    lines.push(renderBorderedRow(summaryCols, { metric: 'METRIC', value: 'VALUE' }));
    lines.push(horizontalBorder(summaryCols, '='));
    for (const item of input.summary) {
      lines.push(renderBorderedRow(summaryCols, { metric: item.label, value: toText(item.value) }));
    }
    lines.push(horizontalBorder(summaryCols, '-'));
    lines.push('');
  }

  for (const table of input.tables || []) {
    lines.push(`[ ${table.title.toUpperCase()} ]`);
    const tableColumns = table.columns.map((col) => ({ ...col, label: col.label.toUpperCase() }));
    lines.push(horizontalBorder(tableColumns, '-'));
    lines.push(renderBorderedRow(tableColumns, Object.fromEntries(tableColumns.map((col) => [col.key, col.label]))));
    lines.push(horizontalBorder(tableColumns, '='));
    if (!table.rows.length) {
      lines.push(renderBorderedRow(tableColumns, Object.fromEntries(tableColumns.map((col, idx) => [col.key, idx === 0 ? 'NO DATA AVAILABLE' : '']))));
    } else {
      for (const row of table.rows) {
        lines.push(renderBorderedRow(tableColumns, row));
      }
    }
    lines.push(horizontalBorder(tableColumns, '-'));
    lines.push('');
  }

  lines.push(repeat('-', estimatedMaxChars));
  lines.push('Prepared by Salaam Car Rental Management System');
  lines.push('Confidential - Internal Use');

  const startY = pageHeight - 40;
  const safeLines = lines.map((line) => escapePdfText(line).slice(0, estimatedMaxChars));
  const contentLines = [
    'BT',
    `/F1 ${fontSize} Tf`,
    `40 ${startY} Td`,
    `${lineHeight} TL`,
  ];
  for (const line of safeLines) {
    contentLines.push(`(${line}) Tj`, 'T*');
  }
  contentLines.push('ET');

  const stream = contentLines.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
};
