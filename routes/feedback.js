import express from "express";
import { pool } from "../config/db.js";
import { body, validationResult } from "express-validator";

// Feedback route
const router = express.Router();

// POST /feedback - Public feedback submission
router.post(
  "/",
  [
    body("message").notEmpty().withMessage("Feedback message is required."),
    body("type")
      .isIn(["bug", "suggestion", "general"])
      .withMessage("Type must be bug, suggestion, or general."),
    body("role")
      .optional()
      .isIn(["tenant", "landlord", "visitor", "unknown"])
      .withMessage("Role must be tenant, landlord, visitor, or unknown."),
    body("email")
      .optional()
      .isEmail()
      .withMessage("A valid email is required."),
    body("phone").optional().isString(),
    body("name").optional().isString(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const {
      name = null,
      email = null,
      phone = null,
      role = "unknown",
      type,
      message,
    } = req.body;

    const query = `
            INSERT INTO feedbacks (name, email, phone, role, type, message)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
    pool.query(query, [name, email, phone, role, type, message], (err) => {
      if (err) {
        console.error("Database error:", err); // Log the actual error for debugging
        // For debugging only: include error message in response (remove in production)
        return res
          .status(500)
          .json({ error: "Database error.", details: err.message });
      }
      res.status(201).json({ message: "Thank you for your feedback!" });
    });
  }
);

export default router;
