import express from "express";
import supabase from "../config/supabase.js";
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
    body("phone_number").optional().isString(),
    body("name").optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const {
      name = null,
      email = null,
      phone_number = null,
      role = "unknown",
      type,
      message,
    } = req.body;

    const { error } = await supabase.from("feedbacks").insert([
      {
        name,
        email,
        phone_number,
        role,
        type,
        message,
      },
    ]);

    if (error) {
      console.error("Supabase error:", error);
      return res
        .status(500)
        .json({ error: "Database error.", details: error.message });
    }

    res.status(201).json({ message: "Thank you for your feedback!" });
  }
);

export default router;
