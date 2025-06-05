import { Router } from "express";
import { hash, compare } from "bcryptjs";
import { pool } from "../config/db.js";
import { body, validationResult } from "express-validator";
import pkg from "jsonwebtoken";
import authMiddleware from "../middlewares/auth.js";
import dotenv from "dotenv";

dotenv.config();

const { sign, verify } = pkg;

const router = Router();

// POST /api/tenants/register
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    // Validate phone number
    body("phone_number")
      .notEmpty()
      .isMobilePhone()
      .withMessage("Valid phone number required"),
    // Validate password length
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, phone_number, password } = req.body;

      // Hash password
      const hashedPassword = await hash(password, 10);

      // Insert tenant into database
      const query = `
        INSERT INTO tenants 
        (name, phone_number, password)
        VALUES ($1, $2, $3)
        RETURNING id, name, phone_number, account_created     `;

      const values = [name, phone_number, hashedPassword];

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
    // Validate email and password
    body("phone_number")
      .isMobilePhone()
      .withMessage("Valid phone number is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phone_number, password } = req.body;

      // Find tenant by email
      const result = await pool.query(
        "SELECT * FROM tenants WHERE phone_number = $1",
        [phone_number]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: "phone number does not exists" });
      }

      const tenant = result.rows[0];

      // Compare password
      const isMatch = await compare(password, tenant.password);
      if (!isMatch) {
        return res.status(400).json({ error: "wrong password" });
      }

      // Generate JWT token
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
          phone_number: tenant.phone_number,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Login failed" });
    }
  }
);

// GET /api/tenants/profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.id;

    // Fetch tenant profile
    const profileResult = await pool.query(
      "SELECT id, name, phone_number FROM tenants WHERE id = $1",
      [tenantId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantProfile = profileResult.rows[0];

    // Fetch favorite lodges for tenant
    const favoritesResult = await pool.query(
      `SELECT lodges.*
       FROM tenant_favorites
       JOIN lodges ON tenant_favorites.lodge_id = lodges.id
       WHERE tenant_favorites.tenant_id = $1`,
      [tenantId]
    );

    const favoriteLodges = favoritesResult.rows;

    // Return profile and favorites
    res.status(200).json({
      ...tenantProfile,
      favoriteLodges,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
