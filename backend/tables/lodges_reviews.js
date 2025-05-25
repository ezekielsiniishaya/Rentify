const createLodgeReviewsTable = async (pool) => {
  const query = `
    CREATE TABLE IF NOT EXISTS lodge_reviews (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lodge_id INTEGER NOT NULL REFERENCES lodges(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      review_text TEXT,
      review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_approved BOOLEAN DEFAULT FALSE,
      CONSTRAINT one_review_per_tenant UNIQUE(tenant_id, lodge_id)
    )
  `;
  await pool.query(query);
};

module.exports = createLodgeReviewsTable;
