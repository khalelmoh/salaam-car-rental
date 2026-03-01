import { pool } from '../db/pool.js';

export async function logAudit({ userId = null, action, entity, entityId = null, details = {} }) {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId, action, entity, entityId, JSON.stringify(details)]
  );
}

export async function listNotificationLogs(limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, details, created_at
     FROM audit_logs
     WHERE entity = 'booking_notification'
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(200, Number(limit || 50)))]
  );

  return rows.map((row) => ({
    id: `AL-${row.id}`,
    message: row.details?.message || 'Notification',
    timestamp: new Date(row.created_at).getTime(),
    type: 'booking',
  }));
}

export async function clearNotificationLogs() {
  const result = await pool.query(`DELETE FROM audit_logs WHERE entity = 'booking_notification'`);
  return result.rowCount || 0;
}
