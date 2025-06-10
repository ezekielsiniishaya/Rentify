// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

// Import table creation functions
import createLandlordTable from "../tables/landlord.js";
import createTenantsTable from "../tables/tenants.js";
import createLodgesTable from "../tables/lodges.js";
import createLodgesImagesTable from "../tables/lodges_images.js";
import createTenantFavoritesTable from "../tables/tenants_favorites.js";
import createLodgesReviewsTable from "../tables/lodges_reviews.js";
import createAdminTable from "../tables/admin.js";
import createFeedbackTable from "../tables/feedback.js";
import createAreasTable from "../tables/lodge_areas.js";

// Create a new PostgreSQL connection pool using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Function to create all tables
async function createTables() {
  try {
    // Create each table in sequence
    await createAreasTable(pool);
    await createLandlordTable(pool);
    await createTenantsTable(pool);
    await createLodgesTable(pool);
    await createLodgesImagesTable(pool);
    await createLodgesReviewsTable(pool);
    await createTenantFavoritesTable(pool);
    await createAdminTable(pool);
    await createFeedbackTable(pool);
    console.log("All tables are ready.");
  } catch (err) {
    // Log and rethrow any errors during table creation
    console.error("Error running migrations:", err);
    throw err;
  }
}

// Check for required environment variables and log a warning if missing
const requiredEnv = ["DB_USER", "DB_HOST", "DB_NAME", "DB_PASSWORD", "DB_PORT"];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`Warning: Environment variable ${key} is not set.`);
  }
});

export { pool, createTables };
