import { logAudit } from '../services/auditService.js';
import {
  getBusinessTodayDate,
  getCloseOverview,
  isIsoDate,
  toPeriodBounds,
  upsertDailyClose,
  upsertMonthlyClose,
} from '../services/accountingService.js';

export async function listCloseOverview(req, res, next) {
  try {
    const overview = await getCloseOverview();
    res.json(overview);
  } catch (error) {
    next(error);
  }
}

export async function closeDaily(req, res, next) {
  try {
    const requestedDate = String(req.body?.date || req.query?.date || '').trim();
    const closeDate = requestedDate || await getBusinessTodayDate();
    if (!isIsoDate(closeDate)) {
      return res.status(400).json({ error: 'date must use YYYY-MM-DD format.' });
    }

    const result = await upsertDailyClose(closeDate, req.auth.userId);
    await logAudit({
      userId: req.auth.userId,
      action: 'close',
      entity: 'daily_close',
      entityId: result.id,
      details: { date: closeDate },
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function closeMonthly(req, res, next) {
  try {
    const rawYear = req.body?.year ?? req.query?.year;
    const rawMonth = req.body?.month ?? req.query?.month;
    const period = toPeriodBounds(rawYear, rawMonth);
    if (!period) {
      return res.status(400).json({ error: 'year and month are required and must be valid.' });
    }

    const result = await upsertMonthlyClose(period.year, period.month, req.auth.userId);
    await logAudit({
      userId: req.auth.userId,
      action: 'close',
      entity: 'monthly_close',
      entityId: result.id,
      details: { year: period.year, month: period.month },
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
