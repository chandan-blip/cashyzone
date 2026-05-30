'use strict';

const mysql = require('mysql2/promise');

// A single shared connection pool for the whole app.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'cashy',
  password: process.env.DB_PASSWORD || 'cashy_pass',
  database: process.env.DB_NAME || 'cashyzone',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
