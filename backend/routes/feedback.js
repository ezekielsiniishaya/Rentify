const express = require("express");
const db = require("../db"); // adjust path as needed
const { body, validationResult } = require("express-validator");

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
            VALUES (?, ?, ?, ?, ?, ?)
        `;
    db.query(
      query,
      [name, email, phone, role, type, message],
      (err, result) => {
        if (err) {
          return res.status(500).json({ error: "Database error." });
        }
        res.status(201).json({ message: "Thank you for your feedback!" });
      }
    );
  }
);

module.exports = router;
