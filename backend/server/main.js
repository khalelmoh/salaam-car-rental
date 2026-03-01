import { createApp } from './app.js';
import { initializeBackend, startBookingNotificationMonitor } from './startup.js';
import { loadEnvConfig } from './config/env.js';

const PORT = Number(process.env.PORT || 4000);

async function startServer() {
  loadEnvConfig();
  await initializeBackend();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}`);
  });
  startBookingNotificationMonitor();
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
