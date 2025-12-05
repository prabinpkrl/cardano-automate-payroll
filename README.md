# Cardano Payroll System

Automated payroll for Cardano testnet (preprod) built with Node.js/Express, PostgreSQL, and a simple HTML/JS frontend. It builds and submits batch transactions (one output per recipient) via Blockfrost using `@emurgo/cardano-serialization-lib-nodejs`, and records transaction hashes in the database.

## Features

- Manage recipients (address + tADA amount) via UI and API
- Build, sign, and submit a single transaction to pay all recipients
- Store submitted transaction hashes and list them in the UI
- Start an automated scheduler from the UI (default every 2 minutes)

## Folder Structure

- `index.js` — server bootstrap (starts Express and initializes DB)
- `api.js` — Express routes + static frontend + scheduler control
- `payroll.js` — Cardano transaction build/sign/submit logic
- `runpayroll.js` — Reads recipients and invokes `runPayroll`
- `database/db.js` — Postgres connection, schema init, and queries
- `frontend/` — UI (`index.html`) and API client (`payroll-client.js`)
- `generate-senderaddress.js` — optional helper to create `senderWallet.json`
- `senderWallet.json` — sender wallet (address + privateKeyHex)

## Prerequisites

- Node.js 18+
- PostgreSQL database (local or cloud)
- Blockfrost Project ID for preprod

## Configure Environment

Create a `.env` file in the project root:

```
BLOCKFROST_PROJECT_ID=your_blockfrost_preprod_key
DATABASE_URL=postgres://user:password@host:port/dbname
PORT=3000
# Optional: override scheduler interval (default 120000 = 2 minutes)
PAYROLL_INTERVAL_MS=120000
```

## Sender Wallet

You need `senderWallet.json` in the project root:

```
{
  "address": "addr_test1...",
  "privateKeyHex": "<hex-encoded-private-key-bytes>"
}
```

Options to create it:

- Run the helper once to auto-generate a testnet enterprise address:

```bash
node generate-senderaddress.js
```

- Or create it manually with the above JSON structure.

Fund the `address` with tADA on preprod (use a faucet or another wallet).

## Install

```bash
npm install
```

## Run the Server

```bash
node index.js
```

Expected logs:

- `🌐 Server running on http://localhost:3000`
- `⏱️ Scheduler starts after clicking 'Start Payroll' in UI`

## Use the App (Frontend)

1. Open `http://localhost:3000` in a browser.
2. Add recipients (address + amount in tADA). Amount is stored as lovelace.
3. Click "Start Payroll" to start the scheduler. The first run happens after one interval (default: ~2 minutes).
4. Watch the Transactions table for new entries. Links go to Cardanoscan.

## API Reference (Local)

Base URL: `http://localhost:3000`

- Health

```bash
curl http://localhost:3000/api/health
```

- List recipients

```bash
curl http://localhost:3000/api/recipients
```

- Add recipient (amount in tADA)

```bash
curl -X POST http://localhost:3000/api/recipients \
  -H "Content-Type: application/json" \
  -d '{"address":"addr_test1...","amount":1.5}'
```

- Update recipient

```bash
curl -X PUT http://localhost:3000/api/recipients/1 \
  -H "Content-Type: application/json" \
  -d '{"amount":2.0}'
```

- Delete recipient

```bash
curl -X DELETE http://localhost:3000/api/recipients/1
```

- Start scheduler (first run after interval)

```bash
curl -X POST http://localhost:3000/api/run-payroll
```

- List transactions

```bash
curl http://localhost:3000/api/transactions
```

## Database

On server start, the schema is auto-initialized:

- `payroll_recipients(id, address, amount, created_at)`
- `payroll_transactions(id, tx_hash UNIQUE, created_at)`

A couple of sample recipients are inserted on first run when empty.

## Troubleshooting

- Verify `.env` values (Blockfrost key, DATABASE_URL).
- Ensure `senderWallet.json` matches preprod network and is funded with tADA.
- The scheduler does not execute immediately—first payroll runs after `PAYROLL_INTERVAL_MS`.

## License

ISC (see `package.json`).
