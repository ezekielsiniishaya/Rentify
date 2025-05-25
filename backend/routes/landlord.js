const express = require("express");
const bcrypt = require("bcryptjs");
const upload = require("../middlewares/upload");
const { pool } = require("../db");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// POST /api/landlord/register
router.post(
  "/register",
  upload.single("profile_picture"),
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number")
      .optional()
      .isMobilePhone().withMessage("Valid phone number required"),
    body("password")
      .isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("address").optional().trim(),
    body("gender").optional().isIn(["male", "female", "other"]),
    body("language_preference").optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        name,
        email,
        phone_number,
        password,
        address,
        gender,
        language_preference,
      } = req.body;

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Generate image URL
      const imageUrl = req.file
        ? `${req.protocol}://${req.get("host")}/uploads/landlords/${req.file.filename}`
        : null;

      // Insert landlord into database
      const query = `
        INSERT INTO landlord 
        (name, email, phone_number, password, profile_picture, address, gender, language_preference)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, name, email
      `;

      const values = [
        name,
        email,
        phone_number,
        hashedPassword,
        imageUrl,
        address,
        gender,
        language_preference,
      ];

      const result = await pool.query(query, values);

      res.status(201).json({
        message: "Registration successful",
        landlord: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

module.exports = router;

