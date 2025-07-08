import { Router } from "express";
import { hash, compare } from "bcryptjs";
import supabase from "../config/supabase.js";
import { body, validationResult } from "express-validator";
import pkg from "jsonwebtoken";
import authMiddleware from "../middlewares/auth.js";
import dotenv from "dotenv";
import crypto from "crypto";
import sendVerificationEmail from "../utils/mail.js";

dotenv.config();

const { sign, verify } = pkg;

const router = Router();

// POST /api/tenants/register
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email")
      .notEmpty()
      .withMessage("Email is required")
      .matches(/^[a-z]+\.[ms]?\d{7}@st\.futminna\.edu\.ng$/)
      .withMessage("Only FUTMinna student email allowed"),
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

      const { name, email, phone_number, password } = req.body;
      // Hash the password and generate email token
      const hashedPassword = await hash(password, 10);
      const emailToken = crypto.randomBytes(32).toString("hex");

      // Check for duplicate phone number
      const { data: existingTenant, error: findError } = await supabase
        .from("tenants")
        .select("id")
        .eq("email", email)
        .single();

      if (existingTenant) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Insert tenant
      const { data, error } = await supabase
        .from("tenants")
        .insert([
          {
            name,
            email,
            email_token: emailToken,
            password: hashedPassword,
            verification_status: false,
          },
        ])
        .select("id, name,email, account_created")
        .single();

      if (error) {
        return res
          .status(500)
          .json({ error: "Database error: " + error.message });
      }
      await sendVerificationEmail(email, emailToken);

      res.status(201).json({
        message:
          "Registration successful. Please check your email to verify your account.",
        tenant: data,
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: "Registration failed" });
    }
  }
);
// GET /api/landlords/verify-email
router.get("/verify-email", async (req, res) => {
  const { data: user, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("email_token", token)
    .single();

  if (!user) {
    return res.redirect(
      "https://rentify-ng.netlify.app/pages/login.html?message=Email%20already%20verified%20or%20token%20expired"
    );
  }

  if (user.verification_status === true) {
    return res.redirect(
      "https://rentify-ng.netlify.app/pages/login.html?message=Email%20already%20verified"
    );
  }
  console.log("Received token from query:", token);
  console.log("Verification lookup result:", user, "Error:", error);

  const { error: updateError } = await supabase
    .from("tenants")
    .update({
      verification_status: true,
      email_token: null,
    })
    .eq("id", user.id);

  if (updateError) {
    return res.redirect(
      "https://rentify-ng.netlify.app/pages/login.html?message=Verification%20failed"
    );
  }

  return res.redirect(
    `https://rentify-ng.netlify.app/pages/login.html?message=${encodeURIComponent(
      "Email Successfully Verified"
    )}`
  );
});

// POST /api/tenants/login
router.post(
  "/login",
  [
    body("email")
      .notEmpty()
      .withMessage("Email is required")
      .matches(/^[a-z]+\.[ms]?\d{7}@st\.futminna\.edu\.ng$/)
      .withMessage("Only FUTMinna student email allowed"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find tenant by email
      const { data: tenant, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("email", email)
        .single();

      if (!tenant) {
        return res.status(400).json({ error: "Email does not exist" });
      }

      const isMatch = await compare(password, tenant.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Wrong password" });
      }
      if (!tenant.verification_status) {
        return res
          .status(403)
          .json({ error: "Please verify your email first." });
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

// GET /api/tenants/profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.id;

    // Fetch tenant profile
    const { data: tenantProfile, error: profileError } = await supabase
      .from("tenants")
      .select("id, name, email")
      .eq("id", tenantId)
      .single();

    if (!tenantProfile) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Fetch favorite lodges for tenant
    const { data: favoriteLodges, error: favError } = await supabase
      .from("tenant_favorites")
      .select("lodges(*)")
      .eq("tenant_id", tenantId);

    // Map favorite lodges
    const lodges = favoriteLodges
      ? favoriteLodges.map((fav) => fav.lodges)
      : [];

    res.status(200).json({
      ...tenantProfile,
      favoriteLodges: lodges,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
