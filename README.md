## Automated Cardano Payroll System

This project is a small full‑stack system that automates **Cardano testnet (preprod) payroll** from a **server‑owned wallet** to a list of recipients stored in **Postgres**, with a **web UI** to manage recipients and start a scheduler.

The core idea:

- A **sender wallet** (`senderWallet.json`) is generated and funded with tADA.
- **Recipients and amounts** are stored in Postgres.
- When you click **“Run payroll now”** in the UI, the backend starts a **scheduler**.
- After the chosen interval (default every 2 minutes in dev), the server:
  - Builds a batch transaction with one output per recipient.
  - Signs with the sender wallet.
  - Submits it via **Blockfrost** to the Cardano preprod network.
  - Stores the **last transaction hash**, which is then shown in the UI.

---

## Project structure

**Backend / core logic (Node.js, Express)**

- `index.js` – entrypoint; starts the API server.
- `api.js` – Express app + REST API + scheduler control.
- `payroll.js` – builds and submits Cardano transactions (on‑chain logic).
- `runpayroll.js` – reads recipients from DB and calls `runPayroll`.
- `generate-senderaddress.js` – one‑time utility to create `senderWallet.json` (sender wallet).

**Database layer**

- `database/db.js` – Postgres connection and helpers:
  - `initDb()` – creates `payroll_recipients` table and seeds initial addresses.
  - `getAllRecipients()`, `getActiveRecipients()` – read recipient rows.
  - `createRecipient()`, `updateRecipient()`, `deleteRecipient()` – CRUD for recipients.

**Frontend (static files served by Express)**

- `frontend/index.html` – UI for managing recipients and starting payroll.
- `frontend/payroll-client.js` – thin JS client that calls the backend API.

**Config / metadata**

- `package.json` – dependencies (`express`, `pg`, `@blockfrost/blockfrost-js`, `@emurgo/cardano-serialization-lib-nodejs`, `dotenv`, etc.).
- `.env` (not committed) – contains secrets like `BLOCKFROST_PROJECT_ID`, DB connection settings, and optional scheduler interval override.

---

## How the end‑to‑end flow works

### 1. Setup and sender wallet

1. Run `node generate-senderaddress.js` (once):

   - Uses `@emurgo/cardano-serialization-lib-nodejs` to:
     - Generate an Ed25519 private key.
     - Derive the public key and payment credential.
     - Build a **testnet enterprise address** (no staking).
   - Saves `senderWallet.json`:
     - `address`: testnet bech32 address (fund this with tADA on preprod).
     - `privateKeyHex`: hex‑encoded private key bytes (used for signing).

2. Fund `senderWallet.json.address` with tADA on **preprod** (using a faucet or another wallet).

3. Create `.env` in the project root:

   ```env
   BLOCKFROST_PROJECT_ID=your_preprod_blockfrost_key

   # optional: override DB connection, or rely on PG* env defaults
   PGHOST=localhost
   PGPORT=5432
   PGUSER=your_user
   PGPASSWORD=your_password
   PGDATABASE=your_database

   # optional: override scheduler interval (ms), default is 2 minutes
   # PAYROLL_INTERVAL_MS=60000  # 1 minute example
   ```

### 2. Starting the server

Run:

```bash
node index.js
```

`index.js` does:

- Imports `initDb` from `database/db.js` and `app` from `api.js`.
- Calls `initDb()` once to:
  - Ensure the `payroll_recipients` table exists.
  - Seed two default recipients if the table is empty.
- Creates an HTTP server from `app` and listens on `PORT` (default `3000`):
  - Logs: `🌐 API server listening on http://localhost:3000`.
  - Logs: `⏱️ Scheduler will start only after 'Run payroll now' is clicked.`

At this point:

- The **API** and **frontend** are live on `http://localhost:3000/`.
- **No payroll** is running yet; the scheduler hasn’t started.

### 3. Database and recipients

`database/db.js` is responsible for database operations and schema:

- On `initDb()`:

  - Creates `payroll_recipients` with columns:
    - `id SERIAL PRIMARY KEY`
    - `address TEXT NOT NULL`
    - `amount BIGINT NOT NULL` (stored in **lovelace**)
    - `active BOOLEAN NOT NULL DEFAULT TRUE`
    - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - Seeds two rows if the table is empty (for quick testing), using the testnet addresses and amounts you provided.

- `getAllRecipients()` returns all rows (used by the UI).
- `getActiveRecipients()` returns rows (currently all of them) for payroll computations.
- `createRecipient`, `updateRecipient`, `deleteRecipient` implement CRUD.

The **frontend** works in tADA units for amounts; the backend converts tADA → lovelace by multiplying by `1_000_000` before insertion.

### 4. Frontend: managing recipients and starting payroll

The UI (`frontend/index.html`) is a simple static page:

- Shows a **recipient list** and a form to add new rows:

  - `address` (`addr_test1...`)
  - `amount` in tADA (e.g., `1.5`)
  - The table shows `ID`, `Address`, `Amount (tADA)`, and a **Delete** button.

- Uses `frontend/payroll-client.js`, which wraps backend calls:

  - `getRecipients()` → `GET /api/recipients`
  - `createRecipient()` → `POST /api/recipients`
  - `deleteRecipient()` → `DELETE /api/recipients/:id`
  - `runPayroll()` → `POST /api/run-payroll`
  - `getLastTx()` → `GET /api/last-tx`

- When the page loads:

  - `loadRecipients()` calls `getRecipients()` and populates the table.

- When the user adds a recipient:

  - Form submit handler calls `createRecipient({ address, amount })`.
  - On success, it reloads the table.

- When the user deletes a recipient:

  - Click handler calls `deleteRecipient(id)` and reloads the table.

- When the user clicks **“Run payroll now”**:
  - Calls `runPayroll()`:
    - Backend starts the scheduler if not already started (see below).
    - Responds with the configured interval in milliseconds.
  - UI shows a status message about the interval.
  - UI starts polling `getLastTx()` every few seconds until it receives a non‑null `txHash`, then displays:
    - The last payroll tx hash.
    - A link to view it on `preprod.cardanoscan.io`.

### 5. Backend API and scheduler

`api.js` wires everything together on the backend:

- Serves frontend:

  ```js
  const frontendPath = path.join(__dirname, "frontend");
  app.use(express.static(frontendPath));
  ```

- Provides REST endpoints:

  - `GET /api/recipients` – list DB rows (`getAllRecipients()`).
  - `POST /api/recipients` – insert new row (`createRecipient()`).
  - `PUT /api/recipients/:id` – update row (`updateRecipient()`).
  - `DELETE /api/recipients/:id` – delete row (`deleteRecipient()`).

- Scheduler state:

  ```js
  let schedulerStarted = false;
  let schedulerTimer = null;
  let lastTxHash = null;
  const PAYROLL_INTERVAL_MS =
    Number(process.env.PAYROLL_INTERVAL_MS) || 2 * 60 * 1000;
  ```

- `POST /api/run-payroll` – starts the scheduler (once):

  - If `schedulerStarted` is `false`:

    - Sets `schedulerStarted = true`.
    - Defines `runAndReschedule`:

      ```js
      const runAndReschedule = async () => {
        try {
          const txHash = await startPayroll();
          if (txHash) lastTxHash = txHash;
        } catch (err) {
          console.error("Error running scheduled payroll:", err);
        } finally {
          schedulerTimer = setTimeout(runAndReschedule, PAYROLL_INTERVAL_MS);
        }
      };
      ```

    - Schedules the first run after `PAYROLL_INTERVAL_MS` using `setTimeout(runAndReschedule, PAYROLL_INTERVAL_MS)`.
    - Logs a message indicating the interval and that the first run will happen after one interval.

  - Responds to the client with:

    ```js
    { status: "ok", schedulerStarted: true, intervalMs: PAYROLL_INTERVAL_MS }
    ```

  - **Important**: the first transaction does **not** happen immediately when you click; it happens after the configured interval (2 minutes in test).

- `GET /api/last-tx` – returns the last successful payroll transaction hash:

  ```js
  app.get("/api/last-tx", (req, res) => {
    res.json({ txHash: lastTxHash });
  });
  ```

### 6. Building and submitting the transaction

Two files control the on‑chain transaction logic: `runpayroll.js` and `payroll.js`.

#### `runpayroll.js` – assembling the payroll list

Responsible for **deciding who gets paid and how much** for a given run.

- `startPayroll()`:

  1. Calls `getActiveRecipients()` from `database/db.js` to get recipient rows:

     ```js
     [{ address: "...", amount: <lovelace>, ... }, ...]
     ```

  2. If the list is empty, logs a warning and returns.
  3. Maps rows into the format expected by the transaction builder:

     ```js
     const payrollList = recipients.map((r) => ({
       address: r.address,
       amount: BigInt(r.amount),
     }));
     ```

  4. Calls `runPayroll(payrollList)` from `payroll.js`.
  5. Returns the `txHash` returned by `runPayroll` so that `api.js` can store it in `lastTxHash`.

#### `payroll.js` – Cardano transaction construction

Responsible for **turning the payroll list into a real Cardano transaction and submitting it**.

- Loads the sender wallet:

  ```js
  const senderWalletData = JSON.parse(fs.readFileSync("./senderWallet.json"));
  const senderAddress = senderWalletData.address;
  const paymentKey = Cardano.PrivateKey.from_normal_bytes(
    Buffer.from(senderWalletData.privateKeyHex, "hex")
  );
  ```

- Creates a Blockfrost client for preprod:

  ```js
  const API = new Blockfrost.BlockFrostAPI({
    projectId: process.env.BLOCKFROST_PROJECT_ID,
    network: "preprod",
  });
  ```

- `async function runPayroll(payrollList)` does:

  1. **Fetch UTXOs** for `senderAddress`:

     ```js
     const utxos = await API.addressesUtxos(senderAddress);
     ```

  2. **Fetch protocol parameters** for fees and limits:

     ```js
     const protocolParams = await API.epochsLatestParameters();
     const txConfig = Cardano.TransactionBuilderConfigBuilder.new()
       .fee_algo( ... )
       .pool_deposit( ... )
       .key_deposit( ... )
       .max_tx_size(protocolParams.max_tx_size)
       .max_value_size(protocolParams.max_val_size)
       .coins_per_utxo_byte(
         Cardano.BigNum.from_str(protocolParams.coins_per_utxo_size.toString())
       )
       .build();
     ```

  3. **Add inputs**:

     - Wraps each UTXO into a `TransactionUnspentOutput` and adds to the builder, letting the builder choose enough inputs to cover outputs and fees.

  4. **Add outputs (the payroll)**:

     For each `{ address, amount }` in `payrollList`:

     - Adds a `TransactionOutput` sending `amount` lovelace to `address`.

  5. **TTL and change**:

     - Sets TTL based on latest block slot.
     - Calls `add_change_if_needed(senderAddress)` so any leftover ADA returns to the sender.

  6. **Build, hash, and sign**:

     - Builds the transaction body.
     - Hashes it using `blake2b` to get the Tx ID.
     - Creates a vkey witness using the sender’s `paymentKey`.
     - Creates the final signed `Transaction` object.

  7. **Submit via Blockfrost**:

     ```js
     const txHex = Buffer.from(signedTx.to_bytes()).toString("hex");
     const txHash = await API.txSubmit(txHex);
     ```

  8. Logs and **returns the `txHash`**, which is then:
     - Returned by `startPayroll()`.
     - Saved in `lastTxHash` by the scheduler.
     - Exposed to the UI via `/api/last-tx`.

---

## Summary of key functions and their roles

- **`generateSenderWallet()` (in `generate-senderaddress.js`)**  
  Creates the Cardano **sender wallet** and writes `senderWallet.json`. This is the funding address for all payroll transactions.

- **`initDb()` (in `database/db.js`)**  
  Ensures the `payroll_recipients` table exists and seeds initial recipients. Called once at server startup.

- **`getAllRecipients()`, `createRecipient()`, `updateRecipient()`, `deleteRecipient()` (in `database/db.js`)**  
  Implement CRUD so the UI can manage who gets paid and how much.

- **`getActiveRecipients()` (in `database/db.js`)**  
  Returns the set of recipients used when constructing a payroll transaction.

- **`startPayroll()` (in `runpayroll.js`)**  
  Bridges between database and on‑chain logic:

  - Reads recipients from DB.
  - Converts them into `{ address, amount BigInt }` list.
  - Calls `runPayroll()`.
  - Returns the blockchain transaction hash.

- **`runPayroll(payrollList)` (in `payroll.js`)**  
  Handles all **Cardano on‑chain details**:

  - Fetch UTXOs and protocol parameters via Blockfrost.
  - Build transaction inputs and outputs for the payroll batch.
  - Compute fees and change automatically.
  - Sign with the sender’s private key from `senderWallet.json`.
  - Submit to Cardano via Blockfrost and return `txHash`.

- **`/api/run-payroll` handler (in `api.js`)**  
  Controls the **scheduler**:

  - On first call, starts an interval scheduler that runs `startPayroll()` every `PAYROLL_INTERVAL_MS` milliseconds.
  - Does **not** run payroll immediately; first run is after one interval.
  - Returns the interval info to the frontend.

- **`runAndReschedule()` (inner function in `api.js`)**  
  The actual scheduled job:

  - Calls `startPayroll()` to send a payroll transaction.
  - Stores the last successful tx hash in `lastTxHash`.
  - Re‑schedules itself with `setTimeout` for the next run.

- **`/api/last-tx` handler (in `api.js`)**  
  Exposes the **last successful tx hash** for the frontend to display.

- **`PayrollApiClient` methods (in `frontend/payroll-client.js`)**  
  Lightweight wrapper around `fetch` to call all the API endpoints, including `runPayroll()` and `getLastTx()` used by the UI.

Together, these functions implement the full flow: **UI → API → DB → Cardano transaction → Blockfrost → TX hash → UI**.

---

## Important Blockfrost and Cardano serialization functions

This section explains the most important functions from **`@blockfrost/blockfrost-js`** and **`@emurgo/cardano-serialization-lib-nodejs`** used in this project and what they do in the transaction lifecycle.

### Blockfrost (`@blockfrost/blockfrost-js`)

All Blockfrost calls go through the `BlockFrostAPI` instance in `payroll.js`:

```js
const API = new Blockfrost.BlockFrostAPI({
  projectId: process.env.BLOCKFROST_PROJECT_ID,
  network: "preprod",
});
```

- **`addressesUtxos(address)`**

  - Used to fetch all **UTXOs (unspent outputs)** at the sender address.
  - Each UTXO tells us:
    - Which previous transaction output we can spend (`tx_hash`, `output_index`).
    - How much ADA it holds (`amount[0].quantity` in lovelace).
  - In the code:

    ```js
    const utxos = await API.addressesUtxos(senderAddress);
    ```

  - These UTXOs become the **inputs** of the payroll transaction.

- **`epochsLatestParameters()`**

  - Fetches the current **protocol parameters** for the network:
    - `min_fee_a`, `min_fee_b` – linear fee coefficients.
    - `pool_deposit`, `key_deposit`.
    - `max_tx_size`, `max_val_size`.
    - `coins_per_utxo_size`.
  - We feed these into the `TransactionBuilderConfig` so the builder can:
    - Calculate **fees** correctly.
    - Respect **size limits** and **UTXO minimums**.

- **`blocksLatest()`**

  - Gets the latest block, including its `slot` number.
  - We use this to set the transaction **TTL (time‑to‑live)**:

    ```js
    const latestBlock = await API.blocksLatest();
    txBuilder.set_ttl(latestBlock.slot + 1000);
    ```

  - TTL is the maximum slot at which the transaction can be included.

- **`txSubmit(txHex)`**

  - Submits the signed transaction to the Cardano network via Blockfrost.
  - Expects the transaction bytes encoded as **hex**.
  - Returns the **transaction hash** if accepted.
  - In this project:

    ```js
    const txHex = Buffer.from(signedTx.to_bytes()).toString("hex");
    const txHash = await API.txSubmit(txHex);
    ```

  - That `txHash` is what we log, return from `runPayroll`, and show in the UI.

### Cardano serialization library (`@emurgo/cardano-serialization-lib-nodejs`)

This library provides low‑level building blocks for Cardano transactions, keys, and addresses. In this project it is used in **two main contexts**:

1. **Wallet / address generation** (`generate-senderaddress.js`).
2. **Transaction building and signing** (`payroll.js`).

#### 1) Wallet and address generation

In `generate-senderaddress.js`:

- **`PrivateKey.generate_ed25519()`**

  - Generates a new Ed25519 private key (used for Cardano payment signing).

- **`privateKey.to_public()`**

  - Derives the **public key** from the private key.

- **`publicKey.hash()`**

  - Computes the **key hash**, used as the payment credential.

- **`Credential.from_keyhash(paymentKeyHash)`**

  - Wraps the key hash into a `Credential` object for address creation.

- **`EnterpriseAddress.new(networkId, paymentCred)`**

  - Creates an **enterprise address** (payment‑only, no staking).
  - We pass `0` (testnet) as the network ID.

- **`enterpriseAddr.to_address().to_bech32()`**
  - Converts the enterprise address to a bech32 string, which becomes the on‑chain `address` stored in `senderWallet.json`.

#### 2) Transaction building and signing

In `payroll.js`:

- **`TransactionBuilderConfigBuilder` + `LinearFee` + `BigNum`**

  - Used to build a `TransactionBuilderConfig` with protocol parameters:
    - `LinearFee.new(BigNum.from_str(min_fee_a), BigNum.from_str(min_fee_b))` sets the fee formula.
    - `BigNum.from_str(...)` converts numbers (from Blockfrost) into the library’s big number type.

- **`TransactionBuilder.new(txConfig)`**

  - Creates the main **transaction builder** object that we use to:
    - Add inputs (UTXOs).
    - Add outputs (recipients).
    - Calculate fees and change.

- **`TransactionInput.new(TransactionHash, index)`**

  - Constructs an input that references a specific previous output:
    - `TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, "hex"))`.
    - `utxo.output_index`.
  - Each input says “spend output index X of transaction Y”.

- **`TransactionOutput.new(Address, Value)`**

  - Represents a single output in the transaction:
    - `Address.from_bech32(address)` builds a Cardano address object.
    - `Value.new(BigNum.from_str(amount.toString()))` sets the ADA amount (lovelace).
  - Each payroll recipient becomes one `TransactionOutput`.

- **`TransactionUnspentOutput` / `TransactionUnspentOutputs`**

  - Convenience wrappers to collect `(input, output)` pairs for the builder.
  - We build a `TransactionUnspentOutputs` from all sender UTXOs and pass it to:

    ```js
    txBuilder.add_inputs_from(txUnspentOutputs, 2);
    ```

  - This tells the builder: “take inputs from this set, using a selection strategy (here 2 = use all or largest first depending on version)”.

- **`txBuilder.add_change_if_needed(Address)`**

  - After adding outputs, the builder:
    - Computes the required **fee**.
    - Figures out if there is leftover ADA from the inputs.
  - `add_change_if_needed` automatically creates a **change output** back to the sender address if there is excess.

- **`txBuilder.build()`**

  - Finalizes the **transaction body** (without witnesses/signatures).
  - This body is what we hash and then sign.

- **`TransactionHash` + `blake2b`**

  - The Cardano tx ID is the hash of the transaction body.
  - We compute it as:

    ```js
    const txBodyBytes = txBody.to_bytes();
    const hasher = blake(32);
    hasher.update(Buffer.from(txBodyBytes));
    const txId = Cardano.TransactionHash.from_bytes(
      new Uint8Array(hasher.digest())
    );
    ```

  - `txId` is then used to create a **vkey witness**.

- **`make_vkey_witness(txId, paymentKey)`**

  - Creates a **verification key witness** (signature) for the transaction:
    - Signs the transaction hash using the sender’s private key.
  - This is the cryptographic proof that the sender authorizes spending their UTXOs.

- **`Vkeywitnesses` and `TransactionWitnessSet`**

  - We add the witness to a `Vkeywitnesses` collection and put that into a `TransactionWitnessSet`:

    ```js
    const witness = Cardano.make_vkey_witness(txId, paymentKey);
    const witnessSet = Cardano.TransactionWitnessSet.new();
    const vkeys = Cardano.Vkeywitnesses.new();
    vkeys.add(witness);
    witnessSet.set_vkeys(vkeys);
    ```

  - The witness set contains all signatures required for the transaction.

- **`Transaction.new(txBody, witnessSet)`**
  - Combines the body and witnesses into the final signed `Transaction` object.
  - The serialized bytes of this object are what we submit to Blockfrost.

In short:

- **Blockfrost** is responsible for:

  - Giving us live chain data (**UTXOs, protocol params, latest block**).
  - Accepting the final **signed transaction** (`txSubmit`) and returning the tx hash.

- **Cardano serialization lib** is responsible for:
  - Handling keys and addresses (`PrivateKey`, `PublicKey`, `EnterpriseAddress`).
  - Building the transaction structure (`TransactionBuilder`, `TransactionInput`, `TransactionOutput`, `Value`).
  - Computing the transaction hash and signing (`make_vkey_witness`, `TransactionHash`).
  - Producing the final serialized transaction bytes for submission.
