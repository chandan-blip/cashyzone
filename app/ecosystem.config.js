// PM2 process definition for CashyZone.
// Usage on the VPS:  pm2 start ecosystem.config.js  &&  pm2 save
module.exports = {
  apps: [
    {
      name: 'cashyzone',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        // PORT and DB_* are read from the .env file in this folder (dotenv),
        // so you don't have to duplicate secrets here.
      },
      max_memory_restart: '300M',
      autorestart: true,
    },
  ],
};
