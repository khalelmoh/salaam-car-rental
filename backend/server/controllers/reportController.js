import { pool } from '../db/pool.js';
import { makeId } from '../services/security.js';
import { buildCustomerReport, buildFinanceReport, buildFleetReport } from '../services/reportService.js';
import { logAudit } from '../services/auditService.js';
import { sendError } from '../services/http.js';
import {
  customerReportQuerySchema,
  customerReportResponseSchema,
  financeReportQuerySchema,
  financeReportResponseSchema,
  fleetReportQuerySchema,
  fleetReportResponseSchema,
} from '../contracts/reportSchemas.js';
import { z } from 'zod';

const presetBodySchema = z.object({
  name: z.string().min(1).max(120),
  scope: z.enum(['finance', 'customers', 'fleet']),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

const reportJobBodySchema = z.object({
  reportType: z.enum(['finance', 'customers', 'fleet']),
  format: z.enum(['json', 'pdf', 'xlsx']).optional().default('json'),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

const reportFilterQuerySchemaByType = {
  finance: financeReportQuerySchema,
  customers: customerReportQuerySchema,
  fleet: fleetReportQuerySchema,
};

function validateDateRange(query, res) {
  if (query.from && query.to && query.from > query.to) {
    sendError(res, 400, 'VALIDATION_ERROR', '"from" date cannot be after "to" date.');
    return false;
  }
  return true;
}

function withGeneratedBy(report, req) {
  const generatedBy = {
    id: req.auth.userId,
    name: req.auth.user?.name || '',
    role: req.auth.role,
  };
  return {
    ...report,
    generatedBy,
    metadata: {
      generatedAt: report.generatedAt,
      timezone: report.timezone,
      filters: report.filters,
      rowCount: report.pagination?.total || 0,
      pageRowCount: Array.isArray(report.rows) ? report.rows.length : 0,
      generatedBy,
    },
  };
}

function parseResponseOrThrow(schema, report, label) {
  const parsed = schema.safeParse(report);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message || 'Invalid response payload.';
    const error = new Error(`${label} response validation failed: ${issue}`);
    error.statusCode = 500;
    throw error;
  }
  return parsed.data;
}

async function runReportByType(reportType, filters = {}) {
  const querySchema = reportFilterQuerySchemaByType[reportType];
  const parsedFilters = querySchema.parse(filters || {});
  if (reportType === 'finance') return buildFinanceReport(parsedFilters);
  if (reportType === 'customers') return buildCustomerReport(parsedFilters);
  return buildFleetReport(parsedFilters);
}

export async function financeReport(req, res, next) {
  try {
    const parsed = financeReportQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid finance report query.');
    }
    const query = parsed.data;
    if (!validateDateRange(query, res)) return;

    const report = parseResponseOrThrow(
      financeReportResponseSchema,
      withGeneratedBy(await buildFinanceReport(query), req),
      'Finance report'
    );
    await logAudit({
      userId: req.auth.userId,
      action: 'generate',
      entity: 'report_finance',
      details: report.filters,
    });
    res.json(report);
  } catch (error) {
    next(error);
  }
}

export async function customerReport(req, res, next) {
  try {
    const parsed = customerReportQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid customer report query.');
    }
    const query = parsed.data;
    if (!validateDateRange(query, res)) return;

    const report = parseResponseOrThrow(
      customerReportResponseSchema,
      withGeneratedBy(await buildCustomerReport(query), req),
      'Customer report'
    );
    await logAudit({
      userId: req.auth.userId,
      action: 'generate',
      entity: 'report_customers',
      details: report.filters,
    });
    res.json(report);
  } catch (error) {
    next(error);
  }
}

export async function fleetReport(req, res, next) {
  try {
    const parsed = fleetReportQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid fleet report query.');
    }
    const query = parsed.data;
    if (!validateDateRange(query, res)) return;

    const report = parseResponseOrThrow(
      fleetReportResponseSchema,
      withGeneratedBy(await buildFleetReport(query), req),
      'Fleet report'
    );
    await logAudit({
      userId: req.auth.userId,
      action: 'generate',
      entity: 'report_fleet',
      details: report.filters,
    });
    res.json(report);
  } catch (error) {
    next(error);
  }
}

export async function listReportPresets(req, res, next) {
  try {
    const scopeResult = z.object({
      scope: z.enum(['finance', 'customers', 'fleet']).optional(),
    }).strict().safeParse(req.query || {});
    if (!scopeResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', scopeResult.error.issues[0]?.message || 'Invalid report preset query.');
    }
    const scope = String(scopeResult.data.scope || '').trim();
    const params = [req.auth.userId];
    let where = 'WHERE created_by = $1';
    if (scope) {
      params.push(scope);
      where += ` AND scope = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT id, name, scope, filters, created_at, updated_at
       FROM report_presets
       ${where}
       ORDER BY updated_at DESC`,
      params
    );

    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      scope: r.scope,
      filters: r.filters || {},
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  } catch (error) {
    next(error);
  }
}

export async function createReportPreset(req, res, next) {
  try {
    const parsed = presetBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid report preset payload.');
    }
    const payload = parsed.data;
    const normalizedFiltersResult = reportFilterQuerySchemaByType[payload.scope].safeParse(payload.filters || {});
    if (!normalizedFiltersResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', normalizedFiltersResult.error.issues[0]?.message || 'Invalid preset filters.');
    }
    const normalizedFilters = normalizedFiltersResult.data;
    const id = makeId('RPTPRESET');

    await pool.query(
      `INSERT INTO report_presets (id, created_by, name, scope, filters, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())`,
      [id, req.auth.userId, payload.name, payload.scope, JSON.stringify(normalizedFilters)]
    );

    await logAudit({
      userId: req.auth.userId,
      action: 'create',
      entity: 'report_preset',
      entityId: id,
      details: { scope: payload.scope, name: payload.name },
    });

    res.status(201).json({
      id,
      name: payload.name,
      scope: payload.scope,
      filters: normalizedFilters,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteReportPreset(req, res, next) {
  try {
    const id = req.params.id;
    const result = await pool.query(
      'DELETE FROM report_presets WHERE id = $1 AND created_by = $2',
      [id, req.auth.userId]
    );
    if (result.rowCount === 0) {
      return sendError(res, 404, 'NOT_FOUND', 'Report preset not found.');
    }
    await logAudit({
      userId: req.auth.userId,
      action: 'delete',
      entity: 'report_preset',
      entityId: id,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function executeReportJob(jobId) {
  const run = await pool.query(
    `UPDATE report_jobs
     SET status = 'running', started_at = NOW()
     WHERE id = $1
     RETURNING id, report_type, format, filters, created_by`,
    [jobId]
  );
  if (!run.rows[0]) return;
  const job = run.rows[0];

  try {
    const report = await runReportByType(job.report_type, job.filters || {});
    const result = {
      reportVersion: report.reportVersion,
      generatedAt: report.generatedAt,
      summary: report.summary,
      rowCount: Number(report.pagination?.total || 0),
      pageRowCount: Array.isArray(report.rows) ? report.rows.length : 0,
      data: job.format === 'json' ? report : { message: `${job.format} generation metadata ready`, reportType: job.report_type },
    };

    await pool.query(
      `UPDATE report_jobs
       SET status = 'completed', result = $2::jsonb, completed_at = NOW()
       WHERE id = $1`,
      [jobId, JSON.stringify(result)]
    );
  } catch (error) {
    await pool.query(
      `UPDATE report_jobs
       SET status = 'failed', error_message = $2, completed_at = NOW()
       WHERE id = $1`,
      [jobId, error instanceof Error ? error.message : 'Failed to execute report job']
    );
  }
}

export async function createReportJob(req, res, next) {
  try {
    const parsed = reportJobBodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid report job payload.');
    }
    const payload = parsed.data;
    const normalizedFiltersResult = reportFilterQuerySchemaByType[payload.reportType].safeParse(payload.filters || {});
    if (!normalizedFiltersResult.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', normalizedFiltersResult.error.issues[0]?.message || 'Invalid report job filters.');
    }
    const normalizedFilters = normalizedFiltersResult.data;
    const id = makeId('RPTJOB');

    await pool.query(
      `INSERT INTO report_jobs (id, report_type, format, status, filters, created_by, created_at)
       VALUES ($1, $2, $3, 'pending', $4::jsonb, $5, NOW())`,
      [id, payload.reportType, payload.format, JSON.stringify(normalizedFilters), req.auth.userId]
    );

    await logAudit({
      userId: req.auth.userId,
      action: 'create',
      entity: 'report_job',
      entityId: id,
      details: { reportType: payload.reportType, format: payload.format },
    });

    setTimeout(() => {
      executeReportJob(id).catch(() => {});
    }, 0);

    res.status(202).json({
      id,
      status: 'pending',
      reportType: payload.reportType,
      format: payload.format,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getReportJob(req, res, next) {
  try {
    const id = req.params.id;
    const { rows } = await pool.query(
      `SELECT id, report_type, format, status, filters, result, error_message, created_by, created_at, started_at, completed_at
       FROM report_jobs
       WHERE id = $1`,
      [id]
    );
    if (!rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Report job not found.');

    const job = rows[0];
    if (job.created_by !== req.auth.userId && !['admin', 'manager'].includes(req.auth.role)) {
      return sendError(res, 403, 'AUTH_FORBIDDEN', 'Forbidden.');
    }

    res.json({
      id: job.id,
      reportType: job.report_type,
      format: job.format,
      status: job.status,
      filters: job.filters || {},
      result: job.result || null,
      error: job.error_message || null,
      createdBy: job.created_by,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    });
  } catch (error) {
    next(error);
  }
}
