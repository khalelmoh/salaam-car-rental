export function toDateTime(date, time, fallbackTime = '00:00') {
  return new Date(`${date}T${time || fallbackTime}:00`);
}

export function bookingSubtotal(carPricePerDay, startDate, endDate, startTime = '00:00', endTime = '23:59') {
  const start = toDateTime(startDate, startTime, '00:00');
  const end = toDateTime(endDate, endTime, '23:59');
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const days = Math.max(1, diff);
  return days * Number(carPricePerDay || 0);
}

export function bookingRentalDays(startDate, endDate, startTime = '00:00', endTime = '23:59') {
  const start = toDateTime(startDate, startTime, '00:00');
  const end = toDateTime(endDate, endTime, '23:59');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
}

export function calculateBookingAmounts(carPricePerDay, startDate, endDate, startTime, endTime, discountType, discountValue) {
  const subtotalAmount = bookingSubtotal(carPricePerDay, startDate, endDate, startTime, endTime);
  const normalizedType = discountType === 'percent' ? 'percent' : 'fixed';
  const normalizedValue = Number(discountValue || 0);

  let discountAmount = 0;
  if (normalizedType === 'percent') {
    discountAmount = subtotalAmount * (normalizedValue / 100);
  } else {
    discountAmount = normalizedValue;
  }

  discountAmount = Math.max(0, Math.min(subtotalAmount, discountAmount));
  const totalAmount = Math.max(0, subtotalAmount - discountAmount);

  return {
    discountType: normalizedType,
    discountValue: normalizedValue,
    discountAmount: Number(discountAmount.toFixed(2)),
    subtotalAmount: Number(subtotalAmount.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
  };
}
