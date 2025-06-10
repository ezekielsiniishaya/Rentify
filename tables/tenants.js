// This function creates a table for tenants in the database.

const createTenantsTable = async (pool) => {
  const query = `
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(11) UNIQUE NOT NULL CHECK (char_length(phone_number) = 11),
      password VARCHAR(255) NOT NULL,
      account_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
  await pool.query(query);
};

export default createTenantsTable;
