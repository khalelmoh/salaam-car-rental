import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import Button from './Button';
import { api } from '../lib/api';
import type { CarReportPeriod, CarReportResponse } from '../types/models';
import { downloadStyledReportPdf } from '../utils/reportPdfTemplate';
import { onDataChanged } from '../utils/realtime';
import './CarReportModal.css';

interface CarReportModalProps {
  carId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 8 }, (_, idx) => currentYear - idx);

const formatCurrency = (value: number) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const CarReportModal = ({ carId, isOpen, onClose }: CarReportModalProps) => {
  const [period, setPeriod] = useState<CarReportPeriod>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const [report, setReport] = useState<CarReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const filterParams = useMemo(
    () => ({
      period,
      from: period === 'range' ? from : '',
      to: period === 'range' ? to : '',
      month: period === 'monthly' ? month : undefined,
      year: period === 'monthly' || period === 'yearly' ? year : undefined,
    }),
    [period, from, to, month, year]
  );

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  const loadReport = useCallback(async () => {
    if (!carId) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await api.getCarReport(carId, filterParams);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load car report.');
    } finally {
      setIsLoading(false);
    }
  }, [carId, filterParams]);

  useEffect(() => {
    if (!isOpen || !carId) return;
    loadReport();
  }, [isOpen, carId, loadReport]);

  useEffect(() => {
    if (!isOpen || !carId) return;
    const unsubscribe = onDataChanged(() => {
      loadReport();
    });
    return unsubscribe;
  }, [isOpen, carId, loadReport]);

  if (!isOpen && !report) return null;

  const exportRows = async () => {
    if (!carId) return [];
    const data = await api.getCarReport(carId, {
      period,
      from: period === 'range' ? from : '',
      to: period === 'range' ? to : '',
      month: period === 'monthly' ? month : undefined,
      year: period === 'monthly' || period === 'yearly' ? year : undefined,
      all: true,
    });
    return data.rows;
  };

  const handlePdfExport = async () => {
    if (!report) return;
    setIsExporting(true);
    setError('');
    try {
      const rows = await exportRows();
      const filterSummary = period === 'range'
        ? `${from || '--'} to ${to || '--'}`
        : period === 'monthly'
          ? `Month ${month}, ${year}`
          : period === 'yearly'
            ? `${year}`
            : 'All Time';

      downloadStyledReportPdf({
        title: `${report.car.name} - Performance Report`,
        summaryLine: `Rentals: ${report.summary.totalRentals}   Revenue: ${formatCurrency(report.summary.totalRevenue)}   Expenses: ${formatCurrency(report.summary.totalExpenses)}   Avg/Rental: ${formatCurrency(report.summary.averageRevenuePerRental)}`,
        filters: [
          { label: 'Car ID', value: report.car.id },
          { label: 'Period', value: filterSummary },
        ],
        summaryCards: [
          { label: 'Total Rentals', value: report.summary.totalRentals },
          { label: 'Days Rented', value: report.summary.totalDaysRented },
          { label: 'Total Revenue', value: formatCurrency(report.summary.totalRevenue) },
          { label: 'Total Expenses', value: formatCurrency(report.summary.totalExpenses) },
          { label: 'Current Status', value: report.car.status },
        ],
        headers: ['Booking', 'Customer', 'Start', 'End', 'Days', 'Amount', 'Status', 'Payment'],
        rows: rows.map((row) => ([
          row.bookingId,
          row.customerName,
          row.startDate,
          row.endDate,
          row.rentalDays,
          formatCurrency(row.amountPaid),
          row.status,
          row.paymentStatus,
        ])),
        columnStyles: {
          0: { cellWidth: 76 },
          1: { cellWidth: 120 },
          2: { cellWidth: 72 },
          3: { cellWidth: 72 },
          4: { cellWidth: 48 },
          5: { cellWidth: 72 },
          6: { cellWidth: 62 },
          7: { cellWidth: 62 },
        },
        footerText: 'Salaam Car Rental - Internal Report',
        fileName: `${report.car.name.replace(/\s+/g, '-').toLowerCase()}-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleXlsxExport = async () => {
    if (!report) return;
    setIsExporting(true);
    setError('');
    try {
      const rows = await exportRows();
      const XLSX = await import('xlsx');
      const worksheetRows = rows.map((row) => ({
        BookingID: row.bookingId,
        CustomerName: row.customerName,
        StartDate: row.startDate,
        EndDate: row.endDate,
        RentalDays: row.rentalDays,
        AmountPaid: Number(row.amountPaid).toFixed(2),
        Status: row.status,
        PaymentStatus: row.paymentStatus,
      }));
      const worksheet = XLSX.utils.json_to_sheet(worksheetRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Car Report');
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadBlob(blob, `${report.car.name.replace(/\s+/g, '-').toLowerCase()}-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export XLSX. Ensure dependencies are installed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className={`report-modal-overlay ${isOpen ? 'is-open' : 'is-closing'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-hidden={!isOpen}
    >
      <div className={`report-modal-content ${isOpen ? 'is-open' : 'is-closing'}`}>
        <div className="report-modal-header">
          <div>
            <h2>Car Performance Report</h2>
            <p>{report?.car.name || carId || '--'} ({report?.car.licensePlate || '--'})</p>
          </div>
          <button className="report-close-btn" onClick={onClose} aria-label="Close report">
            <X size={22} />
          </button>
        </div>

        <div className="report-filter-row">
          <div className="report-filter-item">
            <label>Filter</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as CarReportPeriod)}>
              <option value="all">All Time</option>
              <option value="range">Date Range</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          {period === 'range' && (
            <>
              <div className="report-filter-item">
                <label>From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="report-filter-item">
                <label>To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {period === 'monthly' && (
            <>
              <div className="report-filter-item">
                <label>Month</label>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, idx) => (
                    <option key={idx + 1} value={idx + 1}>{idx + 1}</option>
                  ))}
                </select>
              </div>
              <div className="report-filter-item">
                <label>Year</label>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {yearOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {period === 'yearly' && (
            <div className="report-filter-item">
              <label>Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          )}
          <div className="report-export-actions">
            <Button variant="secondary" onClick={handlePdfExport} disabled={isLoading || isExporting || !report}>
              <FileText size={16} /> PDF
            </Button>
            <Button variant="secondary" onClick={handleXlsxExport} disabled={isLoading || isExporting || !report}>
              <FileSpreadsheet size={16} /> XLSX
            </Button>
          </div>
        </div>

        {isLoading && <div className="report-state">Loading report...</div>}
        {error && <div className="report-state report-error">{error}</div>}

        {!isLoading && report && (
          <>
            <div className="report-summary-grid">
              <div className="report-summary-card">
                <span>Total Rentals</span>
                <strong>{report.summary.totalRentals}</strong>
              </div>
              <div className="report-summary-card">
                <span>Total Days Rented</span>
                <strong>{report.summary.totalDaysRented}</strong>
              </div>
              <div className="report-summary-card">
                <span>Total Revenue</span>
                <strong>{formatCurrency(report.summary.totalRevenue)}</strong>
              </div>
              <div className="report-summary-card">
                <span>Average / Rental</span>
                <strong>{formatCurrency(report.summary.averageRevenuePerRental)}</strong>
              </div>
              <div className="report-summary-card">
                <span>Total Expenses</span>
                <strong>{formatCurrency(report.summary.totalExpenses)}</strong>
              </div>
              <div className="report-summary-card">
                <span>Current Status</span>
                <strong>{report.car.status}</strong>
              </div>
            </div>
          </>
        )}

        {isExporting && (
          <div className="report-exporting">
            <Download size={15} /> Preparing export...
          </div>
        )}
      </div>
    </div>
  );
};

export default CarReportModal;
