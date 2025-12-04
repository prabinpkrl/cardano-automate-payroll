const cron = require("node-cron");
const { startPayroll } = require("./runpayroll");

// Every 2 minutes (for testing)
cron.schedule("*/2 * * * *", () => {
  startPayroll();
});

console.log("📅 Scheduler started. Waiting for next payroll run...");
