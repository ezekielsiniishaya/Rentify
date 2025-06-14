import express from "express";
import { body, validationResult } from "express-validator";
import supabase from "../config/supabase.js";
import authMiddleware, { adminMiddleware } from "../middlewares/auth.js";
import { hash, compare } from "bcryptjs";
import pkg from "jsonwebtoken";
const { sign } = pkg;
const router = express.Router();

// Utility: Pagination
function paginate(page = 1, limit = 10) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { from, to };
}

// Admin Login
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const { data: admins, error } = await supabase
        .from("admins")
        .select("*")
        .eq("email", email)
        .limit(1);

      if (error) throw error;
      if (!admins || admins.length === 0)
        return res.status(400).json({ error: "Invalid credentials" });

      const admin = admins[0];
      const isMatch = await compare(password, admin.password_hash);
      if (!isMatch) return res.status(400).json({ error: "Wrong password" });

      const token = sign(
        { id: admin.id, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({
        token,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// Create new admin
router.post(
  "/admins",
  authMiddleware,
  adminMiddleware,
  [
    body("username").notEmpty().withMessage("Username is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").isLength({ min: 6 }).withMessage("Password min 6 chars"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { username, email, password } = req.body;
    try {
      const hashed = await hash(password, 10);
      const { error } = await supabase
        .from("admins")
        .insert([{ username, email, password_hash: hashed }]);
      if (error) throw error;
      res.json({ message: "Admin created successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create admin" });
    }
  }
);
// Change admin password
router.put(
  "/admins/:id/password",
  authMiddleware,
  adminMiddleware,
  [
    body("password")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { id } = req.params;
    const { password } = req.body;

    try {
      const hashed = await hash(password, 10);
      const { error } = await supabase
        .from("admins")
        .update({ password_hash: hashed })
        .eq("id", id);

      if (error) throw error;
      res.json({ message: "Password updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update password" });
    }
  }
);

// Delete an admin
router.delete(
  "/admins/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
      return res
        .status(403)
        .json({ error: "You cannot delete your own admin account." });
    }

    try {
      const { error } = await supabase.from("admins").delete().eq("id", id);

      if (error) throw error;
      res.json({ message: "Admin deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete admin" });
    }
  }
);

// Dashboard Analytics
router.get("/dashboard", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [tenantCount, landlordCount, lodgeCount, feedbackCount] =
      await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("landlords").select("id", { count: "exact", head: true }),
        supabase.from("lodges").select("id", { count: "exact", head: true }),
        supabase.from("feedbacks").select("id", { count: "exact", head: true }),
      ]);
    res.json({
      tenants: tenantCount.count || 0,
      landlords: landlordCount.count || 0,
      lodges: lodgeCount.count || 0,
      feedbacks: feedbackCount.count || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// GET all tenants (paginated)
router.get("/tenants", authMiddleware, adminMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const { from, to } = paginate(page, limit);
  try {
    const { count, error: countError } = await supabase
      .from("tenants")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;

    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id, name, phone_number, account_created")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    res.json({
      page,
      limit,
      total: count || 0,
      tenants,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// GET all landlords (paginated)
router.get("/landlords", authMiddleware, adminMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const { from, to } = paginate(page, limit);
  try {
    const { count, error: countError } = await supabase
      .from("landlords")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;

    const { data: landlords, error } = await supabase
      .from("landlords")
      .select(
        "id, name, email, phone_number, phone_number_2, verification_status, account_created"
      )
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;
    res.json({
      page,
      limit,
      total: count || 0,
      landlords,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch landlords" });
  }
});

// DELETE a tenant
router.delete(
  "/tenants/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const tenantId = req.params.id;
      const { data, error: selectError } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", tenantId)
        .single();
      if (selectError && selectError.code !== "PGRST116") throw selectError;
      if (!data) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const { error } = await supabase
        .from("tenants")
        .delete()
        .eq("id", tenantId);
      if (error) throw error;
      res.json({ message: "Tenant deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete tenant" });
    }
  }
);

// DELETE a landlord
router.delete(
  "/landlords/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const landlordId = req.params.id;
      const { data, error: selectError } = await supabase
        .from("landlords")
        .select("id")
        .eq("id", landlordId)
        .single();
      if (selectError && selectError.code !== "PGRST116") throw selectError;
      if (!data) {
        return res.status(404).json({ error: "Landlord not found" });
      }

      const { error } = await supabase
        .from("landlords")
        .delete()
        .eq("id", landlordId);
      if (error) throw error;
      res.json({ message: "Landlord deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete landlord" });
    }
  }
);

// Update landlord verification status
router.put(
  "/landlords/:id/verify",
  authMiddleware,
  adminMiddleware,
  [body("status").isBoolean().withMessage("Status must be boolean")],
  async (req, res) => {
    const { status } = req.body;
    const landlordId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { error, data } = await supabase
        .from("landlords")
        .update({ verification_status: status })
        .eq("id", landlordId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Landlord not found" });
      }
      res.json({
        message: "Landlord verification status updated successfully",
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update verification status" });
    }
  }
);

// Reset tenant password
router.put(
  "/tenants/:id/password",
  authMiddleware,
  adminMiddleware,
  [
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const { password } = req.body;
    const tenantId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const hashed = await hash(password, 10);
      const { error, data } = await supabase
        .from("tenants")
        .update({ password: hashed })
        .eq("id", tenantId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      res.json({ message: "Tenant password reset successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to reset tenant password" });
    }
  }
);

// Reset landlord password
router.put(
  "/landlords/:id/password",
  authMiddleware,
  adminMiddleware,
  [
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const { password } = req.body;
    const landlordId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const hashed = await hash(password, 10);
      const { error, data } = await supabase
        .from("landlords")
        .update({ password: hashed })
        .eq("id", landlordId).select;
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Landlord not found" });
      }
      res.json({ message: "Landlord password reset successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to reset landlord password" });
    }
  }
);

// GET all lodges (paginated)
router.get("/lodges", authMiddleware, adminMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const { from, to } = paginate(page, limit);
  try {
    const { count, error: countError } = await supabase
      .from("lodges")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;

    const { data: lodges, error } = await supabase
      .from("lodges")
      .select("*, landlord:landlord_id(name), area:area_id(name)")
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;
    // Map landlord_name and area_name for compatibility
    const mappedLodges = lodges.map((l) => ({
      ...l,
      landlord_name: l.landlord?.name || null,
      area_name: l.area?.name || null,
    }));

    res.json({
      page,
      limit,
      total: count || 0,
      lodges: mappedLodges,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch lodges" });
  }
});

// DELETE a lodge
router.delete(
  "/lodges/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const lodgeId = req.params.id;
      const { data, error: selectError } = await supabase
        .from("lodges")
        .select("id")
        .eq("id", lodgeId)
        .single();
      if (selectError && selectError.code !== "PGRST116") throw selectError;
      if (!data) {
        return res.status(404).json({ error: "Lodge not found" });
      }

      const { error } = await supabase
        .from("lodges")
        .delete()
        .eq("id", lodgeId);
      if (error) throw error;
      res.json({ message: "Lodge deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete lodge" });
    }
  }
);

// Update lodge verification status
router.put(
  "/lodges/:id/verify",
  authMiddleware,
  adminMiddleware,
  [body("status").isBoolean().withMessage("Status must be boolean")],
  async (req, res) => {
    const { status } = req.body;
    const lodgeId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { data, error } = await supabase
        .from("lodges")
        .update({ verification_status: status })
        .eq("id", lodgeId).select;
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Lodge not found" });
      }
      res.json({ message: "Lodge verification status updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update verification status" });
    }
  }
);

// GET all feedback (paginated)
router.get("/feedbacks", authMiddleware, adminMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const { from, to } = paginate(page, limit);
  try {
    const { count, error: countError } = await supabase
      .from("feedbacks")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;

    const { data: feedbacks, error } = await supabase
      .from("feedbacks")
      .select("id, name, email, message, is_resolved, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    res.json({
      page,
      limit,
      total: count || 0,
      feedbacks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch feedbacks" });
  }
});

// Update feedback resolution status
router.put(
  "/feedbacks/:id/resolve",
  authMiddleware,
  adminMiddleware,
  [body("status").isBoolean().withMessage("Status must be boolean")],
  async (req, res) => {
    const { status } = req.body;
    const feedbackId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { data, error } = await supabase
        .from("feedbacks")
        .update({ is_resolved: status })
        .eq("id", feedbackId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Feedback not found" });
      }
      res.json({ message: "Feedback status updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update feedback status" });
    }
  }
);

// DELETE feedback
router.delete(
  "/feedbacks/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const feedbackId = req.params.id;
      const { data, error: selectError } = await supabase
        .from("feedbacks")
        .select("id")
        .eq("id", feedbackId)
        .single();
      if (selectError && selectError.code !== "PGRST116") throw selectError;
      if (!data) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      const { error } = await supabase
        .from("feedbacks")
        .delete()
        .eq("id", feedbackId);
      if (error) throw error;
      res.json({ message: "Feedback deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete feedback" });
    }
  }
);

// GET all areas
router.get("/areas", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data: areas, error } = await supabase
      .from("areas")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    res.json({ areas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch areas" });
  }
});

// Add a new area
router.post(
  "/areas",
  authMiddleware,
  adminMiddleware,
  [body("name").notEmpty().withMessage("Area name is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name } = req.body;
    try {
      const { error } = await supabase.from("areas").insert([{ name }]);
      if (error) throw error;
      res.json({ message: "Area added successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to add area" });
    }
  }
);

// DELETE an area
router.delete(
  "/areas/:id",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const areaId = req.params.id;
      const { data, error: selectError } = await supabase
        .from("areas")
        .select("id")
        .eq("id", areaId)
        .single();
      if (selectError && selectError.code !== "PGRST116") throw selectError;
      if (!data) {
        return res.status(404).json({ error: "Area not found" });
      }

      const { error } = await supabase.from("areas").delete().eq("id", areaId);
      if (error) throw error;
      res.json({ message: "Area deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete area" });
    }
  }
);

// GET lodge reviews
router.get("/reviews", authMiddleware, adminMiddleware, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const { from, to } = paginate(page, limit);
  try {
    const { count, error: countError } = await supabase
      .from("lodge_reviews")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;

    const { data: reviews, error } = await supabase
      .from("lodge_reviews")
      .select("*, tenant:tenant_id(name), lodge:lodge_id(name)")
      .order("review_date", { ascending: false })
      .range(from, to);

    if (error) throw error;
    // Map tenant_name and lodge_name for compatibility
    const mappedReviews = reviews.map((r) => ({
      ...r,
      tenant_name: r.tenant?.name || null,
      lodge_name: r.lodge?.name || null,
    }));

    res.json({
      page,
      limit,
      total: count || 0,
      reviews: mappedReviews,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// Update review approval status
router.put(
  "/reviews/:id/approve",
  authMiddleware,
  adminMiddleware,
  [body("status").isBoolean().withMessage("Status must be boolean")],
  async (req, res) => {
    const { status } = req.body;
    const reviewId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { data, error } = await supabase
        .from("lodge_reviews")
        .update({ is_approved: status })
        .eq("id", reviewId)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Review not found" });
      }
      res.json({ message: "Review status updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update review status" });
    }
  }
);

export default router;
