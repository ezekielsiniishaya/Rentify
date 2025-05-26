require("dotenv").config();
import { Pool } from "pg";

// Table functions
import createLandlordTable from "./tables/landlord";
import createTenantsTable from "./tables/tenants";
import createLodgesTable from "./tables/lodges";
import createLodgesImagesTable from "./tables/lodges_images";
import createTenantFavoritesTable from "./tables/tenants_favorites";
import createLodgesReviewsTable from "./tables/lodges_reviews";
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

    console.log("All tables are ready.");
  } catch (err) {
    console.error("Error running migrations:", err);
    throw err;
  }
}

export default {
  pool,
  createTables,
};
