import { Router } from "express";
import { hash } from "bcryptjs";
import { compare } from "bcryptjs";
import { pool } from "../config/db.js";
import { body, validationResult } from "express-validator";
import pkg from "jsonwebtoken";

import dotenv from "dotenv";
dotenv.config();

const { sign, verify } = pkg;

const router = Router();

// POST /api/tenants/register
router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number")
      .notEmpty()
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

      // Add tenant to database
      const query = `
        INSERT INTO tenants 
        (email, phone_number, password)
        VALUES ($1, $2, $3)
        RETURNING id, name, email
      `;

      const values = [email, phone_number, hashedPassword];

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

// POST /api/tenants/login
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

      const result = await pool.query(
        "SELECT * FROM tenants WHERE phone_number = $1",
        [phone_number]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: "phone number does not exists" });
      }

      const tenant = result.rows[0];

      const isMatch = await compare(password, tenant.password);
      if (!isMatch) {
        return res.status(400).json({ error: "wrong password" });
      }

      const token = sign(
        { id: tenant.id, role: "tenant" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(200).json({
        message: "Login successful",
        token,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          email: tenant.email,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Login failed" });
    }
  }
);

export default router;
