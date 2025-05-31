// This function creates a landlord table in a PostgreSQL database using Node.js and the pg library.

const createLandlordTable = async (pool) => {
  const query = `
    CREATE TABLE IF NOT EXISTS landlords (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE NOT NULL,
      phone_number VARCHAR(11) UNIQUE NOT NULL CHECK (char_length(phone_number) = 11),
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

export default createLandlordTable;
