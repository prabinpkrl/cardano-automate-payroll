const http = require("http");
const app = require("./api");
const { initDb } = require("./database/db");

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    await initDb();

    const server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`🌐 Server running on http://localhost:${PORT}`);
      console.log("⏱️ Scheduler starts after clicking 'Start Payroll' in UI");
    });
  } catch (err) {
    console.error("Failed to bootstrap application:", err);
    process.exit(1);
  }
}

bootstrap();
