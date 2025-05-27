import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

// Table functions
import createLandlordTable from "../tables/landlord.js";
import createTenantsTable from "../tables/tenants.js";
import createLodgesTable from "../tables/lodges.js";
import createLodgesImagesTable from "../tables/lodges_images.js";
import createTenantFavoritesTable from "../tables/tenants_favorites.js";
import createLodgesReviewsTable from "../tables/lodges_reviews.js";
import createAdminTable from "../tables/admin.js";
import createFeedbackTable from "../tables/feedback.js";

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function createTables() {
  try {
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
    console.error("Error running migrations:", err);
    throw err;
  }
}

export { pool, createTables };
