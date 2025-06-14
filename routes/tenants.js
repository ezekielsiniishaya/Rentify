import { Router } from "express";
import { hash, compare } from "bcryptjs";
import supabase from "../config/supabase.js";
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

      const { name, phone_number, password } = req.body;
      const hashedPassword = await hash(password, 10);

      // Check for duplicate phone number
      const { data: existingTenant, error: findError } = await supabase
        .from("tenants")
        .select("id")
        .eq("phone_number", phone_number)
        .single();

      if (existingTenant) {
        return res.status(400).json({ error: "Phone number already exists" });
      }

      // Insert tenant
      const { data, error } = await supabase
        .from("tenants")
        .insert([{ name, phone_number, password: hashedPassword }])
        .select("id, name, phone_number, account_created")
        .single();

      if (error) throw error;

      res.status(201).json({
        message: "Registration successful",
        tenant: data,
      });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: "Registration failed" });
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

      // Find tenant by phone_number
      const { data: tenant, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("phone_number", phone_number)
        .single();

      if (!tenant) {
        return res.status(400).json({ error: "phone number does not exists" });
      }

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
    const { data: tenantProfile, error: profileError } = await supabase
      .from("tenants")
      .select("id, name, phone_number")
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
