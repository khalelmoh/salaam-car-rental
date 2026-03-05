const isIsoDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function parseDateValue(value: string | number | Date) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (isIsoDateOnly(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function formatDateDMY(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === '') return '--';
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return '--';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day} / ${month} / ${year}`;
}

export function formatDateTimeDMY(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === '') return '--';
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return '--';
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatDateDMY(date)} ${time}`;
}
