CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  dob           DATE,
  state         VARCHAR(100),
  country       VARCHAR(100),
  balance       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  is_admin      TINYINT(1) NOT NULL DEFAULT 0,
  auto_mode     TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin-editable key/value settings (UPI details, fees, thresholds, etc.).
CREATE TABLE IF NOT EXISTS settings (
  `key`      VARCHAR(64) PRIMARY KEY,
  `value`    TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ledger of every balance change (earnings, approved deposits, approved withdrawals).
CREATE TABLE IF NOT EXISTS transactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  type        ENUM('deposit', 'withdraw', 'earning', 'purchase', 'bonus') NOT NULL,
  amount      DECIMAL(12, 2) NOT NULL,
  description VARCHAR(255),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A user buys a task (pays `price` from wallet) then completes it to earn `reward`
-- (3x the price). One row per user per task. status: purchased -> completed.
CREATE TABLE IF NOT EXISTS task_purchases (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  task_id      INT NOT NULL,
  price        DECIMAL(12, 2) NOT NULL,
  reward       DECIMAL(12, 2) NOT NULL,
  status       ENUM('purchased', 'completed') NOT NULL DEFAULT 'purchased',
  progress     TEXT NULL,                          -- saved in-progress answers (JSON)
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  UNIQUE KEY uniq_user_task (user_id, task_id),
  CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Deposit requests: user pays via UPI and submits a UTR; admin approves/rejects.
CREATE TABLE IF NOT EXISTS deposits (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  amount      DECIMAL(12, 2) NOT NULL,
  utr         VARCHAR(64) NOT NULL,
  note        VARCHAR(255) NULL,
  status      ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  CONSTRAINT fk_dep_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- KYC records. A user submits details (status 'awaiting_payment'), then pays the
-- KYC fee via UPI which links the deposit row here and moves status to 'pending';
-- an admin then verifies or rejects. One row per user.
CREATE TABLE IF NOT EXISTS kyc (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL UNIQUE,
  full_name    VARCHAR(255) NOT NULL,
  pan          VARCHAR(20),
  aadhaar      VARCHAR(20),
  bank_account VARCHAR(50),
  ifsc         VARCHAR(20),
  address      TEXT,
  deposit_id   INT NULL,
  status       ENUM('awaiting_payment', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'awaiting_payment',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  TIMESTAMP NULL,
  CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Withdrawal requests: amount is held from balance on request; admin approves/rejects.
CREATE TABLE IF NOT EXISTS withdrawals (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  amount      DECIMAL(12, 2) NOT NULL,
  upi_id      VARCHAR(128) NOT NULL,
  status      ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  CONSTRAINT fk_wd_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
