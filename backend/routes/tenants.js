const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { body, validationResult } = require("express-validator");

const router = express.Router();

// POST /api/tenant/register
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number")
      .optional()
      .isMobilePhone().withMessage("Valid phone number required"),
    body("password")
      .isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, phone_number, password } = req.body;

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Add tenant to database
      const query = `
        INSERT INTO tenants 
        (name, email, phone_number, password)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email
      `;

      const values = [name, email, phone_number, hashedPassword];

      const result = await pool.query(query, values);

      res.status(201).json({
        message: "Registration successful",
        tenant: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

module.exports = router;

