// Import necessary modules
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Import custom modules
import { createTables } from "./config/db.js"; // Function to create DB tables if they don't exist
import landlordRoutes from "./routes/landlords.js"; // Routes for landlord-related operations
import tenantRoutes from "./routes/tenants.js"; // Routes for tenant-related operations
import lodgeRoutes from "./routes/lodges.js"; // Routes for lodge-related operations
import feedbackRoute from "./routes/feedback.js"; // Routes for feedback operations
import adminRoutes from "./routes/admin.js";

// Initialize Express app
const app = express();
const PORT = 3000; // Port number where server will run

// Set up __dirname in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static image files from 'uploads' directory
app.use("/uploads", express.static(join(__dirname, "uploads")));

// Middleware to parse JSON request bodies
app.use(express.json());

// API route handlers
app.use("/api/landlords", landlordRoutes); // Handle requests starting with /api/landlord
app.use("/api/tenants", tenantRoutes); // Handle requests starting with /api/tenant
app.use("/api/lodges", lodgeRoutes); // Handle requests starting with /lodges
app.use("/api/feedback", feedbackRoute); // Handle requests starting with /api/feedback
app.use("/api/admin", adminRoutes);
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
