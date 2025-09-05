import { Router } from "express";
import { hash, compare } from "bcryptjs";
import supabase from "../config/supabase.js";
import { body, validationResult } from "express-validator";
import pkg from "jsonwebtoken";
import authMiddleware from "../middlewares/auth.js";
import dotenv from "dotenv";
import crypto from "crypto";
import sendVerificationEmail from "../utils/verifyMail.js";
import sendPasswordResetEmail from "../utils/resetPass.js";
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
      await sendVerificationEmail(email, emailToken, "tenant");

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
  const { token } = req.query;
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
// POST /api/tenants/forgot-password
router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Valid email is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;
      // Check if tenant exists
      const { data: tenant, error } = await supabase
        .from("tenants")
        .select("id, email, name")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        console.error("Supabase query error:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return res.status(500).json({ error: "Database error" });
      }

      // Always return success to prevent email enumeration
      if (!tenant) {
        return res.status(200).json({
          message: "If the email exists, a password reset link has been sent.",
        });
      }

      // Generate reset token (valid 2 hours)
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);

      // Store reset token in tenants table
      const { error: updateError } = await supabase
        .from("tenants")
        .update({
          reset_token: resetToken,
          reset_token_expiry: resetTokenExpiry.toISOString(),
        })
        .eq("id", tenant.id);

      if (updateError) {
        return res
          .status(500)
          .json({ error: "Failed to generate reset token" });
      }

      try {
        await sendPasswordResetEmail(tenant.email, resetToken, tenant.name);
      } catch (err) {
        console.error("Resend email error:", err);
      }

      res.status(200).json({
        message: "If the email exists, a password reset link has been sent.",
      });
    } catch (err) {
      console.error("Forgot password error:", err);
      res
        .status(500)
        .json({ error: "Failed to process password reset request" });
    }
  }
);

// POST /api/tenants/reset-password
router.post(
  "/reset-password",
  [
    body("token").notEmpty().withMessage("Reset token is required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, password } = req.body;

      // Find tenant with valid reset token
      const { data: tenant, error } = await supabase
        .from("tenants")
        .select("id, reset_token, reset_token_expiry")
        .eq("reset_token", token)
        .maybeSingle();

      if (error || !tenant) {
        return res
          .status(400)
          .json({ error: "Invalid or expired reset token" });
      }

      // Check if token has expired
      const now = new Date();
      const tokenExpiry = new Date(tenant.reset_token_expiry);
      if (now > tokenExpiry) {
        return res.status(400).json({ error: "Reset token has expired" });
      }

      // Hash the new password
      const saltRounds = 12;
      const hashedPassword = await hash(password, saltRounds);

      // Update password and clear reset token
      const { error: updateError } = await supabase
        .from("tenants")
        .update({
          password: hashedPassword,
          reset_token: null,
          reset_token_expiry: null,
        })
        .eq("id", tenant.id);

      if (updateError) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      res.status(200).json({
        message: "Password has been reset successfully",
      });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ error: "Failed to reset password" });
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
