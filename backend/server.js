require("dotenv").config();
const express = require("express");
const pool = require("./db");
const multer = require("multer");
const path = require("path");
const app = express();
const { v4: uuidv4 } = require("uuid");
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// Create table for storing image URLs
app.get("/create-profile-table", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        image_url TEXT
      )
    `);
    res.send("Profile table created");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating profile table");
  }
});

// Upload image and save URL to database
app.post("/upload-profile", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No image uploaded");
  }

  const { name } = req.body;
  const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

  try {
    await pool.query("INSERT INTO profiles (name, image_url) VALUES ($1, $2)", [
      name,
      imageUrl,
    ]);
    res.json({ message: "Image uploaded and saved", url: imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving profile");
  }
});

// Existing user routes
app.get("/create-table", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE
      )
    `);
    res.send("Table created successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating table");
  }
});
app.post("/add-user", async (req, res) => {
  const { name, email } = req.body;
  try {
    await pool.query("INSERT INTO users (name, email) VALUES ($1, $2)", [
      name,
      email,
    ]);
    res.send("User added successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error adding user");
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
