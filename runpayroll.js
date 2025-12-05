const { runPayroll } = require("./payroll");
const { getActiveRecipients, saveTransactionHash } = require("./database/db");

async function startPayroll() {
  const recipients = await getActiveRecipients();

  if (!recipients.length) {
    console.log("No active payroll recipients found in database.");
    return null;
  }

  const payrollList = recipients.map((r) => ({
    address: r.address,
    amount: BigInt(r.amount),
  }));

  const txHash = await runPayroll(payrollList);

  if (txHash) {
    try {
      await saveTransactionHash(txHash);
      console.log(`Transaction hash saved to database: ${txHash}`);
    } catch (err) {
      console.error("Error saving transaction hash:", err);
    }
  }

  return txHash;
}

module.exports = { startPayroll };
