# Deploying CashyZone to your VPS (Nginx + existing MySQL + PM2)

Runs the Node app on **127.0.0.1:3100** behind Nginx on a **subdomain** of your
existing project's domain, with HTTPS via Let's Encrypt. The app is bound to
localhost — only Nginx is exposed publicly.

> Replace `cashyzone.YOURDOMAIN.com` with the subdomain you want, and
> `youruser` with your SSH/login user.

---

## 0. DNS — point the subdomain at the VPS
In your DNS provider add an **A record**:

```
Type: A    Name: cashyzone    Value: <your VPS public IP>    TTL: auto
```
(`cashyzone.YOURDOMAIN.com` → VPS IP). Wait a few minutes for it to resolve.

---

## 1. Copy the project to the VPS
From your **local machine** (in `/home/dev/Documents/cashyzone`):

```bash
# Exclude node_modules and the local VM artifacts.
rsync -avz --exclude node_modules --exclude .vagrant \
  ./app/ youruser@YOUR_VPS_IP:/var/www/cashyzone/
```

(Or `git clone` your repo into `/var/www/cashyzone` if it's in git.)

---

## 2. Create the database on the existing MySQL
SSH into the VPS, then:

```bash
sudo mysql -e "CREATE DATABASE IF NOT EXISTS cashyzone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; \
CREATE USER IF NOT EXISTS 'cashy'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD'; \
GRANT ALL PRIVILEGES ON cashyzone.* TO 'cashy'@'localhost'; FLUSH PRIVILEGES;"
```

Use the **same password** in the `.env` below.

---

## 3. Configure the app
```bash
cd /var/www/cashyzone
cp /path/to/.env.production.example .env   # or create .env manually
nano .env                                  # set DB_PASSWORD + JWT_SECRET
#   PORT=3100
#   DB_PASSWORD=...   (matches step 2)
#   JWT_SECRET=$(openssl rand -hex 32)

# Set the real UPI / Telegram later from the in-app Admin → Settings panel.
```

Install deps and run the DB migration (creates tables + seeds the admin user):

```bash
npm ci --omit=dev        # or: npm install --production
npm run migrate
```

Migration prints the admin login (default `admin@cashyzone.com` / `admin123`).
**Log in and change it** — see "After deploy" below.

---

## 4. Start with PM2
```bash
cd /var/www/cashyzone
pm2 start ecosystem.config.js
pm2 save                 # persist across reboots
pm2 startup              # run the command it prints (sets up boot service)
pm2 logs cashyzone       # verify it says: cashyzone listening on http://0.0.0.0:3100
```

Quick local check on the VPS:
```bash
curl localhost:3100/health     # -> {"status":"ok","db":"up"}
```

---

## 5. Nginx subdomain + reverse proxy
```bash
sudo cp deploy/nginx-cashyzone.conf /etc/nginx/sites-available/cashyzone.conf
sudo sed -i 's/cashyzone.YOURDOMAIN.com/cashyzone.realdomain.com/' \
  /etc/nginx/sites-available/cashyzone.conf
sudo ln -s /etc/nginx/sites-available/cashyzone.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Your **existing project is untouched** — this is a separate server block matched
by `server_name`, so both sites coexist on ports 80/443.

---

## 6. HTTPS (Let's Encrypt)
```bash
sudo certbot --nginx -d cashyzone.realdomain.com
```
Certbot edits the server block to add the 443/SSL section and auto-renews.

Open **https://cashyzone.realdomain.com** — done.

---

## After deploy
- **Change the admin password**: log in as the admin, or update it directly:
  ```bash
  # generate a bcrypt hash then set it:
  cd /var/www/cashyzone
  node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'YOURNEWPASS'
  sudo mysql cashyzone -e "UPDATE users SET password_hash='<hash>' WHERE email='admin@cashyzone.com';"
  ```
- **Set real UPI ID, Telegram link, fees** in **Admin → Settings** (no redeploy needed).
- The hardcoded UPI/Telegram defaults live in `src/settings.js` only as fallbacks.

## Updating later (new code)
```bash
# local:
rsync -avz --exclude node_modules --exclude .vagrant ./app/ youruser@VPS:/var/www/cashyzone/
# on VPS:
cd /var/www/cashyzone && npm ci --omit=dev && npm run migrate && pm2 restart cashyzone
```

## Switching to your own domain later
1. Add an A record for the new domain → VPS IP.
2. `sudo certbot --nginx -d newdomain.com` (or add `-d` to the existing block).
3. Update `server_name` in the nginx config and `sudo systemctl reload nginx`.
No app changes needed — it doesn't hardcode the domain.
