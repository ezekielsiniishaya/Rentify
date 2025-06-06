const createAreasTable = async (pool) => {
  const createTableQuery = `
      CREATE TABLE IF NOT EXISTS areas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `;
  await pool.query(createTableQuery);

  const insertAreasQuery = `
      INSERT INTO areas (name)
      VALUES 
        ('Campus'),
        ('Town'),
        ('University Gate'),
        ('Behind Faculty'),
        ('Phase 1'),
        ('Phase 2')
      ON CONFLICT (name) DO NOTHING
    `;
  await pool.query(insertAreasQuery);
};

export default createAreasTable;
