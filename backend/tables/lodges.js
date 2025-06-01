// This function creates a table for lodges

const createLodgesTable = async (pool) => {
  const query = `
    CREATE TABLE IF NOT EXISTS lodges (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      address TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL,
      capacity INTEGER NOT NULL,
      available_rooms INTEGER NOT NULL,
      verification_status BOOLEAN DEFAULT FALSE,
      display_status BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await pool.query(query);
};

export default createLodgesTable;
