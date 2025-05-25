require('dotenv').config();
const {Pool} = require('pg');

// Table functions
const createLandlordTable = require('./tables/landlord');
const createTenantsTable = require('./tables/tenants');
const createLodgesTable = require('./tables/lodges');
const createLodgesImagesTable = require('./tables/lodges_images');
const createTenantFavoritesTable = require('./tables/tenants_favorites');
const createLodgesReviewsTable = require('./tables/lodges_reviews');
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

		console.log('All tables are ready.');
	} catch (err) {
		console.error('Error running migrations:', err);
		throw err;
	}
}

module.exports = {
	pool,
	createTables,
};

