module.exports = {
  apps: [
    {
      name: 'salaam-backend',
      cwd: 'c:/Users/khali/OneDrive/Desktop/Salaam Car Rental',
      script: 'backend/server/main.js',
      interpreter: 'node',
      node_args: '--env-file=.env',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
