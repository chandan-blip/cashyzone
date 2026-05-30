# cashyzone

A Node.js + Express + MySQL app, provisioned and run inside a Linux VM with Vagrant (VirtualBox).

## Stack

- **Node.js 20** + **Express** — REST API + static frontend
- **MySQL 8** — `items` table (simple CRUD)
- **Vagrant** + **VirtualBox** — Ubuntu 22.04 VM, auto-provisioned

## Layout

```
.
├── Vagrantfile            # VM definition + port forwarding
├── scripts/provision.sh   # installs Node, MySQL, runs migration, starts service
└── app/
    ├── package.json
    ├── public/index.html  # minimal UI
    └── src/
        ├── server.js      # Express app + /health
        ├── db.js          # mysql2 connection pool
        ├── migrate.js     # creates schema + seeds data
        ├── schema.sql
        └── routes/items.js
```

## Run with Vagrant (recommended)

```bash
vagrant up          # boots the VM and provisions everything
```

Then open <http://localhost:3000> on your host. The app runs as a systemd
service (`cashyzone.service`) inside the VM and restarts on failure.

Useful commands:

```bash
vagrant ssh                              # shell into the VM
vagrant ssh -c 'systemctl status cashyzone'
vagrant ssh -c 'journalctl -u cashyzone -f'   # tail app logs
vagrant provision                        # re-run provisioning
vagrant halt                             # stop the VM
vagrant destroy -f                       # delete the VM
```

## API

All money is in **INR (₹)**. Authenticated routes need an `Authorization: Bearer <token>` header (the token comes from register/login).

| Method | Path                      | Auth | Description                          |
|--------|---------------------------|------|--------------------------------------|
| GET    | `/health`                 | —    | health + DB check                    |
| POST   | `/api/auth/register`      | —    | create account → `{ token, user }`   |
| POST   | `/api/auth/login`         | —    | login → `{ token, user }`            |
| GET    | `/api/auth/me`            | ✓    | current user + balance               |
| GET    | `/api/wallet`             | ✓    | balance + transaction history        |
| POST   | `/api/wallet/add`         | ✓    | add money `{ amount }`               |
| POST   | `/api/wallet/withdraw`    | ✓    | withdraw money `{ amount }`          |
| GET    | `/api/items`              | opt  | list tasks (incl. `completed` flag)  |
| POST   | `/api/items`             | —    | create task `{ name, price }`        |
| POST   | `/api/items/:id/complete` | ✓    | complete task → credits wallet       |
| PUT    | `/api/items/:id`          | —    | update task                          |
| DELETE | `/api/items/:id`          | —    | delete task                          |

Example:

```bash
curl localhost:3000/health
curl localhost:3000/api/items
curl -X POST localhost:3000/api/items \
  -H 'Content-Type: application/json' \
  -d '{"name":"Coffee","price":4.5}'
```

## Run locally without Vagrant

Requires a local MySQL. Then:

```bash
cd app
cp .env.example .env      # edit credentials to match your MySQL
npm install
npm run migrate
npm start
```
