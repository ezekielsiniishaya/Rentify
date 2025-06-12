// This code creates a feedback table in the database

const createFeedbackTable = async (pool) => {
  const query = `
     CREATE TABLE IF NOT EXISTS feedbacks(
    id SERIAL PRIMARY KEY,
    name TEXT, -- optional if anonymous
    email TEXT, -- optional
    phone_number TEXT, -- optional
    role TEXT CHECK (role IN ('tenant', 'landlord', 'visitor')) NOT NULL DEFAULT 'visitor',
    type TEXT CHECK (type IN ('bug', 'suggestion', 'complain')) NOT NULL,
    message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
    `;
  await pool.query(query);
};

export default createFeedbackTable;
