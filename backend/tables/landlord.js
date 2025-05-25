const createLandlordTable = async (pool) => {
	const query = `
    CREATE TABLE IF NOT EXISTS landlord (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone_number VARCHAR(20),
      password VARCHAR(255) NOT NULL,
      profile_picture TEXT,
      address TEXT,
      gender VARCHAR(10),
      verification_status BOOLEAN DEFAULT FALSE,
      display_status BOOLEAN DEFAULT TRUE,
      account_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      language_preference VARCHAR(50)
    )
  `;
	await pool.query(query);
};

module.exports = createLandlordTable;

