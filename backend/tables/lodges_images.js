const createLodgeImagesTable = async (pool) => {
	const query = `
    CREATE TABLE IF NOT EXISTS lodge_images (
      id SERIAL PRIMARY KEY,
      lodge_id INTEGER NOT NULL REFERENCES lodges(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      is_primary BOOLEAN DEFAULT FALSE,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      display_order INTEGER DEFAULT 0
    )
  `;
	await pool.query(query);
};

module.exports = createLodgeImagesTable;
