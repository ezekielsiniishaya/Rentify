const createLodgesTable = async (pool) => {
	const query = `
    CREATE TABLE IF NOT EXISTS lodges (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES landlord(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      address TEXT NOT NULL,
      price NUMERIC(10, 2) NOT NULL,
      capacity INTEGER NOT NULL,
      available_rooms INTEGER NOT NULL,
      amenities TEXT[],
      rules TEXT[],
      verification_status BOOLEAN DEFAULT FALSE,
      display_status BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
	await pool.query(query);
};

module.exports = createLodgesTable;
