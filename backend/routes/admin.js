import express from "express";
import { body, validationResult } from "express-validator";
import { pool } from "../config/db.js";
import authMiddleware, { adminMiddleware } from "../middlewares/auth.js";
import { hash, compare } from "bcryptjs";
import pkg from "jsonwebtoken";
const router = express.Router();
const { sign } = pkg;

// Login Route
router.post(
    "/login",
    [
        body("email").isEmail().withMessage("Valid email is required"),
        body("password").notEmpty().withMessage("Password is required")
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty())
            return res.status(400).json({ errors: errors.array() });

        const { email, password } = req.body;

        try {
            const result = await pool.query(
                "SELECT * FROM admins WHERE email = $1",
                [email]
            );
            if (result.rows.length === 0)
                return res.status(400).json({ error: "Invalid credentials" });

            const admin = result.rows[0];
            // Check password
            const isMatch = await compare(password, admin.password_hash);
            if (!isMatch) {
                return res.status(400).json({
                    error: "Wrong password"
                });
            }
            const token = sign(
                { id: admin.id, role: "admin" },
                process.env.JWT_SECRET,
                { expiresIn: "1d" }
            );

            res.json({
                token,
                admin: {
                    id: admin.id,
                    username: admin.username,
                    email: admin.email
                }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error" });
        }
    }
);
// Utility: Pagination
function paginate(query, { page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    return `${query} LIMIT ${limit} OFFSET ${offset}`;
}

// 🧭 Dashboard Analytics
router.get("/dashboard", authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const [userCount, lodgeCount, feedbackCount] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users"),
            pool.query("SELECT COUNT(*) FROM lodges"),
            pool.query("SELECT COUNT(*) FROM feedback")
        ]);
        res.json({
            users: Number(userCount.rows[0].count),
            lodges: Number(lodgeCount.rows[0].count),
            feedbacks: Number(feedbackCount.rows[0].count)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
});

// 📄 GET all users (paginated)
router.get("/users", authMiddleware, adminMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    try {
        const query = paginate(
            "SELECT id, name, email, role FROM users ORDER BY id ASC",
            { page, limit }
        );
        const users = await pool.query(query);
        res.json({ page, limit, users: users.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// ❌ DELETE a user
router.delete(
    "/users/:id",
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        try {
            await pool.query("DELETE FROM users WHERE id = $1", [
                req.params.id
            ]);
            res.json({ message: "User deleted successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to delete user" });
        }
    }
);

// 🔄 UPDATE user role
router.put(
    "/users/:id/role",
    authMiddleware,
    adminMiddleware,
    [
        body("role")
            .notEmpty()
            .withMessage("Role is required")
            .isIn(["tenant", "landlord", "admin"])
            .withMessage("Invalid role")
    ],
    async (req, res) => {
        const { role } = req.body;
        const userId = req.params.id;
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            await pool.query("UPDATE users SET role = $1 WHERE id = $2", [
                role,
                userId
            ]);
            res.json({ message: "User role updated successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to update user role" });
        }
    }
);

// 🏘 GET all lodges (paginated)
router.get("/lodges", authMiddleware, adminMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    try {
        const query = paginate(
            `
            SELECT l.*, u.name AS landlord_name, a.name AS area_name
            FROM lodges l
            JOIN users u ON l.landlord_id = u.id
            JOIN areas a ON l.area_id = a.id
            ORDER BY l.id DESC
            `,
            { page, limit }
        );
        const result = await pool.query(query);
        res.json({ page, limit, lodges: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch lodges" });
    }
});

// ❌ DELETE a lodge
router.delete(
    "/lodges/:id",
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        try {
            await pool.query("DELETE FROM lodges WHERE id = $1", [
                req.params.id
            ]);
            res.json({ message: "Lodge deleted successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to delete lodge" });
        }
    }
);

// 📝 GET all feedback (paginated)
router.get("/feedbacks", authMiddleware, adminMiddleware, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    try {
        const query = paginate(
            `
            SELECT f.*, u.name AS user_name
            FROM feedback f
            JOIN users u ON f.user_id = u.id
            ORDER BY f.created_at DESC
            `,
            { page, limit }
        );
        const result = await pool.query(query);
        res.json({ page, limit, feedbacks: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch feedback" });
    }
});

// ❌ DELETE feedback
router.delete(
    "/feedbacks/:id",
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        try {
            await pool.query("DELETE FROM feedback WHERE id = $1", [
                req.params.id
            ]);
            res.json({ message: "Feedback deleted successfully" });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Failed to delete feedback" });
        }
    }
);

export default router;
