#!/usr/bin/env bash
# Provisions the Vagrant VM: installs Node.js 20 + MySQL, creates the database
# and app user, installs dependencies, and runs the app as a systemd service.
set -euo pipefail

APP_DIR=/vagrant/app
DB_NAME=cashyzone
DB_USER=cashy
DB_PASSWORD=cashy_pass

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating apt and installing base packages"
apt-get update -y
apt-get install -y curl ca-certificates gnupg

echo "==> Installing Node.js 20.x"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "==> Installing MySQL server"
apt-get install -y mysql-server
systemctl enable --now mysql

echo "==> Creating database and application user"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> Writing app .env"
cat > "${APP_DIR}/.env" <<ENV
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo change_me_to_a_long_random_string)
ENV

echo "==> Installing npm dependencies"
cd "${APP_DIR}"
npm install --no-fund --no-audit

echo "==> Running database migration + seed"
npm run migrate

echo "==> Installing systemd service"
cat > /etc/systemd/system/cashyzone.service <<UNIT
[Unit]
Description=cashyzone Node app
After=network.target mysql.service
Requires=mysql.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/src/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now cashyzone.service
sleep 2
systemctl --no-pager status cashyzone.service || true

echo "==> Done. App available on the host at http://localhost:3000"
