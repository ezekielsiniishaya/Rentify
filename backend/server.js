// Import necessary modules
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Import custom modules
import { createTables } from "./config/db.js"; // Function to create DB tables if they don't exist
import landlordRoutes from "./routes/landlord.js"; // Routes for landlord-related operations
import tenantRoutes from "./routes/tenants.js"; // Routes for tenant-related operations

// Set up __dirname in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express app
const app = express();
const PORT = 3000; // Port number where server will run

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static image files from 'uploads' directory
app.use("/uploads", express.static(join(__dirname, "uploads")));

// API route handlers
app.use("/api/landlord", landlordRoutes); // Handle requests starting with /api/landlord
app.use("/api/tenant", tenantRoutes); // Handle requests starting with /api/tenant

// Function to start server after ensuring tables are created
async function startServer() {
  try {
    await createTables(); // Ensure necessary database tables are ready
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1); // Exit process with error code
  }
}

// Run the server
startServer();
