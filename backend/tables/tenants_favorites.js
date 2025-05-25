const createTenantFavoritesTable = async (pool) => {
  const query = `
    CREATE TABLE IF NOT EXISTS tenant_favorites (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      lodge_id INTEGER NOT NULL REFERENCES lodges(id) ON DELETE CASCADE,
      date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_favorite UNIQUE(tenant_id, lodge_id)
    )
  `;
  await pool.query(query);
};

module.exports = createTenantFavoritesTable;
