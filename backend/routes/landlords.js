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
        return res.status(400).json({ error: "email number does not exists" });
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

// Middleware to authenticate landlord using JWT
function authenticateLandlord(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = verify(token, process.env.JWT_SECRET);
    req.landlord = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// GET /api/landlords/profile
router.get("/profile", authenticateLandlord, async (req, res) => {
  try {
    const landlordId = req.landlord.id;
    const result = await pool.query(
      `SELECT id, email, phone_number, account_created, address, display_status, gender, name, language_preference, profile_picture, verification_status 
       FROM landlords 
       WHERE id = $1`,
      [landlordId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Landlord not found" });
    }
    res.status(200).json({ landlord: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});
router.put(
  "/profile",
  authenticateLandlord,
  upload.single("profile_picture"),
  [
    body("phone_number")
      .optional()
      .isMobilePhone()
      .withMessage("Valid phone number required"),
    body("name").optional().isString(),
    body("address").optional().isString(),
    body("gender").optional().isIn(["male", "female"]),
    body("language_preference").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      if (req.file) {
        const imageUrl = `${req.protocol}://${req.get("host")}/uploads/landlords/${req.file.filename}`;
        req.body.profile_picture = imageUrl;
      }

      const landlordId = req.landlord.id;
      const fields = [
        "phone_number",
        "name",
        "address",
        "gender",
        "language_preference",
        "display_status",
        "profile_picture",
      ];
      const updates = [];
      const values = [];
      let idx = 1;

      for (const field of fields) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = $${idx}`);
          values.push(req.body[field]);
          idx++;
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      values.push(landlordId);

      const query = `
        UPDATE landlords
        SET ${updates.join(", ")}
        WHERE id = $${idx}
        RETURNING phone_number, address, gender, name, language_preference, profile_picture
      `;

      const result = await pool.query(query, values);

      res.status(200).json({
        message: "Profile updated successfully",
        landlord: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  }
);
export default router;
