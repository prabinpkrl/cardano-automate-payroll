const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initDb() {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM   pg_tables
        WHERE  schemaname = 'public'
        AND    tablename  = 'payroll_recipients'
      ) THEN
        IF EXISTS (
          SELECT 1 FROM pg_class
          WHERE relkind = 'S' AND relname = 'payroll_recipients_id_seq'
        ) THEN
          DROP SEQUENCE payroll_recipients_id_seq;
        END IF;

        CREATE TABLE public.payroll_recipients (
          id SERIAL PRIMARY KEY,
          address TEXT NOT NULL,
          amount BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      END IF;
    END
    $$;
  `);

  const { rows: countRows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM payroll_recipients"
  );
  const count = countRows[0]?.count || 0;

  if (count === 0) {
    await pool.query(
      `INSERT INTO payroll_recipients (address, amount)
       VALUES
       ($1, $2),
       ($3, $4)`,
      [
        "addr_test1qzgk7wvlzhznk4knyyq0tp3nj0ee82hc5maz2d2uqr4xtplyxuq6n9etd9ajlplj8ufr2jcgklgrmleajdh6zcnj8k5s9r40ue",
        1_500_000,
        "addr_test1qrfqjrzyxsjf8uszfdewzql7w2aa8k5ww63ppks50qfge4ffm0hx6rrrnhsqyxxs6e6sceqzxzfgaq5j9pfqrdz7wm3qj5w797",
        2_000_000,
      ]
    );
  }

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM   pg_tables
        WHERE  schemaname = 'public'
        AND    tablename  = 'payroll_transactions'
      ) THEN
        CREATE TABLE public.payroll_transactions (
          id SERIAL PRIMARY KEY,
          tx_hash TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_payroll_transactions_created_at ON payroll_transactions(created_at DESC);
      END IF;
    END
    $$;
  `);
}

async function getAllRecipients() {
  const { rows } = await pool.query(
    "SELECT id, address, amount,created_at FROM payroll_recipients ORDER BY id ASC"
  );
  return rows;
}

async function getActiveRecipients() {
  const { rows } = await pool.query(
    "SELECT address, amount FROM payroll_recipients ORDER BY id ASC"
  );
  return rows;
}

async function createRecipient({ address, amount, active = true }) {
  const { rows } = await pool.query(
    `INSERT INTO payroll_recipients (address, amount)
     VALUES ($1, $2)
     RETURNING id, address, amount, created_at`,
    [address, amount]
  );
  return rows[0];
}

async function updateRecipient(id, { address, amount, active }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (address !== undefined) {
    fields.push(`address = $${idx++}`);
    values.push(address);
  }
  if (amount !== undefined) {
    fields.push(`amount = $${idx++}`);
    values.push(amount);
  }

  if (!fields.length) {
    const { rows } = await pool.query(
      "SELECT id, address, amount, created_at FROM payroll_recipients WHERE id = $1",
      [id]
    );
    return rows[0] || null;
  }

  values.push(id);

  const { rows } = await pool.query(
    `
    UPDATE payroll_recipients
    SET ${fields.join(", ")}
    WHERE id = $${idx}
    RETURNING id, address, amount,created_at
  `,
    values
  );

  return rows[0] || null;
}

async function deleteRecipient(id) {
  await pool.query("DELETE FROM payroll_recipients WHERE id = $1", [id]);
}

async function saveTransactionHash(txHash) {
  const { rows } = await pool.query(
    `INSERT INTO payroll_transactions (tx_hash)
     VALUES ($1)
     ON CONFLICT (tx_hash) DO NOTHING
     RETURNING id, tx_hash, created_at`,
    [txHash]
  );
  return rows[0] || null;
}

async function getAllTransactions() {
  const { rows } = await pool.query(
    "SELECT id, tx_hash, created_at FROM payroll_transactions ORDER BY created_at DESC"
  );
  return rows;
}

module.exports = {
  pool,
  initDb,
  getAllRecipients,
  getActiveRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
  saveTransactionHash,
  getAllTransactions,
};
