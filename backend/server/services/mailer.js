function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parsePort(value, fallback = 587) {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = parsePort(process.env.SMTP_PORT, 587);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || '').trim() || 'no-reply@salaam.com';

  return {
    configured: Boolean(host),
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    from,
  };
}

let transporterPromise = null;

async function getTransporter() {
  const config = smtpConfig();
  if (!config.configured) {
    return null;
  }
  if (!transporterPromise) {
    transporterPromise = import('nodemailer').then((mod) => {
      const nodemailer = mod.default || mod;
      return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });
    });
  }
  return transporterPromise;
}

export function isSmtpConfigured() {
  return smtpConfig().configured;
}

export async function sendPasswordResetEmail({ to, resetUrl, expiresMinutes = 30 }) {
  const config = smtpConfig();
  if (!config.configured) {
    throw new Error('SMTP is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM.');
  }

  const transporter = await getTransporter();
  const subject = 'Reset your Salaam Car Rental password';
  const text = [
    'You requested a password reset for your Salaam Car Rental account.',
    '',
    `Reset link: ${resetUrl}`,
    '',
    `This link expires in ${expiresMinutes} minutes.`,
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <p>You requested a password reset for your Salaam Car Rental account.</p>
      <p><a href="${resetUrl}" style="color: #0f766e;">Reset your password</a></p>
      <p>This link expires in ${expiresMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html,
  });

  return {
    messageId: info?.messageId || '',
  };
}
