const express = require("express");
const path = require("path");
const { createTables } = require("./db");
const landlordRoutes = require("./routes/landlord");
const tenantRoutes = require("./routes/tenants");
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve image files

// Routes
app.use("/api/landlord", landlordRoutes);
app.use("/api/tenant", tenantRoutes);


// Start server after tables are created
async function startServer() {
  try {
    await createTables();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();

