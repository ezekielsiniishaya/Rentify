// This function creates a table for tenants in the database.

const createTenantsTable = async (pool) => {
  const query = `
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE NOT NULL,
      phone_number VARCHAR(20) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      account_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
  await pool.query(query);
};

export default createTenantsTable;
