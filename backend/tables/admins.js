// This function creates the 'admins' table in the database if it does not already exist.

const createAdminTable = async (pool) => {
  const query = `
 CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;
  await pool.query(query);
};

export default createAdminTable;
