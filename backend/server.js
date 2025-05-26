import express from "express";
import { join } from "path";
import { createTables } from "./db";
import landlordRoutes from "./routes/landlord";
import tenantRoutes from "./routes/tenants";
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use("/uploads", express.static(join(__dirname, "uploads"))); // Serve image files

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

