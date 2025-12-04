const express = require("express");
const cors = require("cors");
const path = require("path");
const {
  getAllRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
  getAllTransactions,
} = require("./database/db");
const { startPayroll } = require("./runpayroll");

const app = express();

app.use(cors());
app.use(express.json());

let schedulerStarted = false;
let schedulerTimer = null;
const PAYROLL_INTERVAL_MS =
  Number(process.env.PAYROLL_INTERVAL_MS) || 2 * 60 * 1000;

const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/recipients", async (req, res) => {
  try {
    const recipients = await getAllRecipients();
    res.json(recipients);
  } catch (err) {
    console.error("Error fetching recipients:", err);
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

app.post("/api/recipients", async (req, res) => {
  try {
    const { address, amount, active } = req.body;
    if (!address || !amount) {
      return res.status(400).json({ error: "address and amount are required" });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const recipient = await createRecipient({
      address,
      amount: Math.trunc(numericAmount * 1_000_000),
      active: active !== undefined ? !!active : true,
    });
    res.status(201).json(recipient);
  } catch (err) {
    console.error("Error creating recipient:", err);
    res.status(500).json({ error: "Failed to create recipient" });
  }
});

app.put("/api/recipients/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const { address, amount, active } = req.body;

    let fields = {};
    if (address !== undefined) fields.address = address;
    if (amount !== undefined) {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res
          .status(400)
          .json({ error: "amount must be a positive number" });
      }
      fields.amount = Math.trunc(numericAmount * 1_000_000);
    }
    if (active !== undefined) fields.active = !!active;

    const updated = await updateRecipient(id, fields);
    if (!updated) {
      return res.status(404).json({ error: "Recipient not found" });
    }
    res.json(updated);
  } catch (err) {
    console.error("Error updating recipient:", err);
    res.status(500).json({ error: "Failed to update recipient" });
  }
});

app.post("/api/run-payroll", async (req, res) => {
  try {
    if (!schedulerStarted) {
      schedulerStarted = true;

      const runAndReschedule = async () => {
        try {
          await startPayroll();
        } catch (err) {
          console.error("Error running scheduled payroll:", err);
        } finally {
          schedulerTimer = setTimeout(runAndReschedule, PAYROLL_INTERVAL_MS);
        }
      };

      schedulerTimer = setTimeout(runAndReschedule, PAYROLL_INTERVAL_MS);
      console.log(
        `📅 Scheduler started (every ${PAYROLL_INTERVAL_MS / 60000} minutes). First run after one interval.`
      );
    }

    res.json({
      status: "ok",
      schedulerStarted: true,
      intervalMs: PAYROLL_INTERVAL_MS,
    });
  } catch (err) {
    console.error("Error running payroll:", err);
    res.status(500).json({ error: "Failed to run payroll" });
  }
});

app.get("/api/transactions", async (req, res) => {
  try {
    const transactions = await getAllTransactions();
    res.json(transactions);
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

app.delete("/api/recipients/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }
    await deleteRecipient(id);
    res.status(204).send();
  } catch (err) {
    console.error("Error deleting recipient:", err);
    res.status(500).json({ error: "Failed to delete recipient" });
  }
});

module.exports = app;


