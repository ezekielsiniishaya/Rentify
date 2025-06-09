import express from "express";
import { body, validationResult } from "express-validator";
import { pool } from "../config/db.js";
import authMiddleware, { adminMiddleware } from "../middlewares/auth.js";
import { hash, compare } from "bcryptjs";
import pkg from "jsonwebtoken";
const { sign } = pkg;
const router = express.Router();

// Utility: Pagination
function paginate(query, { page = 1, limit = 10 }) {
  const offset = (page - 1) * limit;
  return `${query} LIMIT ${limit} OFFSET ${offset}`;
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
      const result = await pool.query("SELECT * FROM admins WHERE email = $1", [
        email,
      ]);
      if (result.rows.length === 0)
        return res.status(400).json({ error: "Invalid credentials" });

      const admin = result.rows[0];
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
      await pool.query(
        "INSERT INTO admins (username, email, password_hash) VALUES ($1, $2, $3)",
        [username, email, hashed]
      );
      res.json({ message: "Admin created successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create admin" });
    }
  }
);

// Dashboard Analytics
router.get("/dashboard", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [tenantCount, landlordCount, lodgeCount, feedbackCount] =
      await Promise.all([
        pool.query("SELECT COUNT(*) FROM tenants"),
        pool.query("SELECT COUNT(*) FROM landlords"),
        pool.query("SELECT COUNT(*) FROM lodges"),
        pool.query("SELECT COUNT(*) FROM feedbacks"),
      ]);
    res.json({
      tenants: Number(tenantCount.rows[0].count),
      landlords: Number(landlordCount.rows[0].count),
      lodges: Number(lodgeCount.rows[0].count),
      feedbacks: Number(feedbackCount.rows[0].count),
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
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM tenants");
    const query = paginate(
      "SELECT id, name, phone_number, account_created FROM tenants ORDER BY id ASC",
      { page, limit }
    );
    const tenants = await pool.query(query);
    res.json({
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      tenants: tenants.rows,
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
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM landlords");
    const query = paginate(
      "SELECT id, name, email, phone_number, phone_number_2, verification_status, account_created FROM landlords ORDER BY id ASC",
      { page, limit }
    );
    const landlords = await pool.query(query);
    res.json({
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      landlords: landlords.rows,
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
      const result = await pool.query("SELECT * FROM tenants WHERE id = $1", [
        tenantId,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
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
      const result = await pool.query("SELECT * FROM landlords WHERE id = $1", [
        landlordId,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Landlord not found" });
      }

      await pool.query("DELETE FROM landlords WHERE id = $1", [landlordId]);
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
      const result = await pool.query(
        "UPDATE landlords SET verification_status = $1 WHERE id = $2",
        [status, landlordId]
      );
      if (result.rowCount === 0) {
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
      const result = await pool.query(
        "UPDATE tenants SET password = $1 WHERE id = $2",
        [hashed, tenantId]
      );
      if (result.rowCount === 0) {
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
      const result = await pool.query(
        "UPDATE landlords SET password = $1 WHERE id = $2",
        [hashed, landlordId]
      );
      if (result.rowCount === 0) {
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
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM lodges");
    const query = paginate(
      `
            SELECT l.*, ld.name AS landlord_name, a.name AS area_name
            FROM lodges l
            JOIN landlords ld ON l.landlord_id = ld.id
            LEFT JOIN areas a ON l.area_id = a.id
            ORDER BY l.id DESC
            `,
      { page, limit }
    );
    const result = await pool.query(query);
    res.json({
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      lodges: result.rows,
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
      const result = await pool.query("SELECT * FROM lodges WHERE id = $1", [
        lodgeId,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Lodge not found" });
      }

      await pool.query("DELETE FROM lodges WHERE id = $1", [lodgeId]);
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
      const lodgeResult = await pool.query(
        "SELECT * FROM lodges WHERE id = $1",
        [lodgeId]
      );
      if (lodgeResult.rows.length === 0) {
        return res.status(404).json({ error: "Lodge not found" });
      }

      await pool.query(
        "UPDATE lodges SET verification_status = $1 WHERE id = $2",
        [status, lodgeId]
      );
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
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM feedbacks");
    const query = paginate(
      `
                SELECT id, name, email, message, is_resolved, created_at
                FROM feedbacks
                ORDER BY created_at DESC
            `,
      { page, limit }
    );
    const result = await pool.query(query);
    res.json({
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      feedbacks: result.rows,
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
      const feedbackResult = await pool.query(
        "SELECT * FROM feedbacks WHERE id = $1",
        [feedbackId]
      );
      if (feedbackResult.rows.length === 0) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      await pool.query("UPDATE feedbacks SET is_resolved = $1 WHERE id = $2", [
        status,
        feedbackId,
      ]);
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
      const result = await pool.query("SELECT * FROM feedbacks WHERE id = $1", [
        feedbackId,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      await pool.query("DELETE FROM feedbacks WHERE id = $1", [feedbackId]);
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
    const result = await pool.query("SELECT * FROM areas ORDER BY name ASC");
    res.json({ areas: result.rows });
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
      await pool.query("INSERT INTO areas (name) VALUES ($1)", [name]);
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
      const result = await pool.query("SELECT * FROM areas WHERE id = $1", [
        areaId,
      ]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Area not found" });
      }

      await pool.query("DELETE FROM areas WHERE id = $1", [areaId]);
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
  try {
    const totalRes = await pool.query("SELECT COUNT(*) FROM lodge_reviews");
    const query = paginate(
      `
            SELECT r.*, t.name AS tenant_name, l.name AS lodge_name
            FROM lodge_reviews r
            JOIN tenants t ON r.tenant_id = t.id
            JOIN lodges l ON r.lodge_id = l.id
            ORDER BY r.review_date DESC
            `,
      { page, limit }
    );
    const result = await pool.query(query);
    res.json({
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      reviews: result.rows,
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
      const reviewResult = await pool.query(
        "SELECT * FROM lodge_reviews WHERE id = $1",
        [reviewId]
      );
      if (reviewResult.rows.length === 0) {
        return res.status(404).json({ error: "Review not found" });
      }

      await pool.query(
        "UPDATE lodge_reviews SET is_approved = $1 WHERE id = $2",
        [status, reviewId]
      );
      res.json({ message: "Review status updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update review status" });
    }
  }
);

export default router;
