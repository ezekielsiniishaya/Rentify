// server.js

// Import necessary modules
import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

// Import Supabase (just initializes client)
import supabase from "./config/supabase.js";

// Import custom route modules
import landlordRoutes from "./routes/landlords.js";
import tenantRoutes from "./routes/tenants.js";
import lodgeRoutes from "./routes/lodges.js";
import feedbackRoute from "./routes/feedback.js";
import adminRoutes from "./routes/admin.js";

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(
  cors({
    origin: ["https://rentify-ng.netlify.app", "http://localhost:3000", "http://192.168.144.44:3000"],
    credentials: true,
  })
);

// Set up __dirname in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files (e.g., image uploads)
app.use("/uploads", express.static(join(__dirname, "uploads")));

// Middleware to parse JSON
app.use(express.json());

// API route handlers
app.use("/api/landlords", landlordRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/lodges", lodgeRoutes);
app.use("/api/feedback", feedbackRoute);
app.use("/api/admin", adminRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
