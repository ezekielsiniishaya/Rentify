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

// POST /api/landlord/register
router.post(
  "/register",
  upload.single("profile_picture"),
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number")
      .optional()
      .isMobilePhone()
      .withMessage("Valid phone number required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
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
      const hashedPassword = await hash(password, 10);

      // Generate image URL
      const imageUrl = req.file
        ? `${req.protocol}://${req.get("host")}/uploads/landlords/${req.file.filename}`
        : null;

      // Insert landlord into database
      const query = `
        INSERT INTO landlords 
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

// POST /api/landlord/login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Check if landlord exists
      const result = await pool.query(
        "SELECT * FROM landlords WHERE email = $1",
        [email]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: "email does not exists" });
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
