const express = require('express');

// Creating tables
const {createTables} = require('./db');
const app = express();
const PORT = 3000;

async function startServer() {
	try {
		await createTables();
		app.listen(PORT, () => {
			console.log(`Server running on port ${PORT}`);
		});
	} catch (err) {
		console.error('Failed to start server:', err);
		process.exit(1);
	}
}

startServer();

