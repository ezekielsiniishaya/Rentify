const createTenantsTable = async (pool) => {
	const query = `
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone_number VARCHAR(20),
      password VARCHAR(255) NOT NULL,
      account_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
	await pool.query(query);
};

module.exports = createTenantsTable;
