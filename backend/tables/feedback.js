const createFeedbackTable = async (pool) => {
  const query = `
     CREATE TABLE feedback(
    id SERIAL PRIMARY KEY,
    name TEXT, -- optional if anonymous
    email TEXT, -- optional
    phone TEXT, -- optional
    role TEXT CHECK (role IN ('tenant', 'landlord', 'visitor', 'unknown')) DEFAULT 'unknown',
    type TEXT CHECK (type IN ('bug', 'suggestion', 'general')) NOT NULL,
    message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
    `;
  await pool.query(query);
};

export default createFeedbackTable;
