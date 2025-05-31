import { Router } from "express";
import { hash } from "bcryptjs";
import { compare } from "bcryptjs";
import upload from "../middlewares/upload.js";
import { pool } from "../config/db.js";
import { body, validationResult } from "express-validator";

import pkg from "jsonwebtoken";

import dotenv from "dotenv";
dotenv.config();

const { sign, verify } = pkg;
const router = Router();

// POST /api/landlords/register
router.post(
  "/register",
  // Checks for user inputs
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number")
      .notEmpty()
      .withMessage("Phone number is required")
      .isMobilePhone()
      .withMessage("Valid phone number required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, phone_number, password } = req.body;

      // Hash password
      const hashedPassword = await hash(password, 10);

      // Insert landlord into database
      const query = `
        INSERT INTO landlords 
        (email, phone_number, password)
        VALUES ($1, $2, $3)
        RETURNING id, email
      `;

      const values = [email, phone_number, hashedPassword];

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

// POST /api/landlords/login
router.post(
  "/login",
  [
    body("phone_number")
      .isMobilePhone()
      .withMessage("Valid phone number is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phone_number, password } = req.body;

      // Check if landlord exists
      const result = await pool.query(
        "SELECT * FROM landlords WHERE phone_number = $1",
        [phone_number]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: "phone number does not exists" });
      }

      const landlord = result.rows[0];

      // Check password
      const isMatch = await compare(password, landlord.password);
      if (!isMatch) {
        return res.status(400).json({ error: "wrong password" });
      }

      // Generate JWT token
      const token = sign(
        { id: landlord.id, role: "landlord" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(200).json({
        message: "Login successful",
        token,
        landlord: {
          id: landlord.id,
          name: landlord.name,
          email: landlord.email,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Login failed" });
    }
  }
);

// Profile route

export default router;
