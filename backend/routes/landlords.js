import { Router } from "express";
import { hash, compare } from "bcryptjs";
import { landlordUpload } from "../utils/upload.js";
import { pool } from "../config/db.js";
import { body, validationResult } from "express-validator";
import authMiddleware from "../middlewares/auth.js";
import pkg from "jsonwebtoken";
import { deleteOldImage } from "../utils/upload.js"; // Adjust path as needed
import dotenv from "dotenv";
dotenv.config();

const { sign } = pkg;
const router = Router();

// POST /api/landlords/register
router.post(
  "/register",
  // Validate user input
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number")
      .notEmpty()
      .withMessage("Phone number is required")
      .isMobilePhone()
      .withMessage("Valid phone number required"),
    body("password")
      .isLength({
        min: 6,
      })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array(),
        });
      }

      const { email, phone_number, password } = req.body;

      // Check if landlord already exists by email or phone number
      const exists = await pool.query(
        "SELECT id, email, phone_number FROM landlords WHERE email = $1 OR phone_number = $2",
        [email, phone_number]
      );
      if (exists.rows.length > 0) {
        const existing = exists.rows[0];
        let errorMsg = "Account already registered";
        if (existing.email === email) {
          errorMsg = "Email already registered";
        } else if (existing.phone_number === phone_number) {
          errorMsg = "Phone number already registered";
        }
        return res.status(400).json({
          error: errorMsg,
        });
      }

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
      // Check for unique constraint violation
      if (err.code === "23505") {
        // Postgres unique_violation
        let errorMsg = "Duplicate entry";
        if (err.detail && err.detail.includes("email")) {
          errorMsg = "Email already registered";
        } else if (err.detail && err.detail.includes("phone_number")) {
          errorMsg = "Phone number already registered";
        }
        return res.status(400).json({
          error: errorMsg,
        });
      }
      res.status(500).json({
        error: "Registration failed: " + err.message,
      });
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
        return res.status(400).json({
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;

      // Check if landlord exists
      const result = await pool.query(
        "SELECT * FROM landlords WHERE email = $1",
        [email]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({
          error: "Email does not exist",
        });
      }

      const landlord = result.rows[0];

      // Check password
      const isMatch = await compare(password, landlord.password);
      if (!isMatch) {
        return res.status(400).json({
          error: "Wrong password",
        });
      }

      // Generate JWT token
      const token = sign(
        {
          id: landlord.id,
          role: "landlord",
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d",
        }
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
      res.status(500).json({
        error: "Login failed",
      });
    }
  }
);

// GET /api/landlords/profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const landlordId = req.user.id;

    // Fetch landlord profile
    const landlordResult = await pool.query(
      `SELECT id, email, phone_number, phone_number_2, account_created, address,
      display_status, gender, name, language_preference,
      profile_picture, verification_status
      FROM landlords
      WHERE id = $1`,
      [landlordId]
    );

    if (landlordResult.rows.length === 0) {
      return res.status(404).json({
        error: "Landlord not found",
      });
    }

    // Fetch lodges owned by the landlord
    const lodgesResult = await pool.query(
      `SELECT id, name, description, address, price,
      capacity, available_rooms, verification_status,
      display_status, created_at
      FROM lodges
      WHERE landlord_id = $1`,
      [landlordId]
    );

    const lodges = await Promise.all(
      lodgesResult.rows.map(async (lodge) => {
        // Fetch images for this lodge
        const imagesResult = await pool.query(
          `SELECT image_url FROM lodge_images WHERE lodge_id = $1`,
          [lodge.id]
        );

        // Fetch reviews for this lodge
        const reviewsResult = await pool.query(
          `SELECT r.id, r.rating, r.review_text, r.review_date,
          json_build_object('id', t.id, 'name', t.name) AS tenant
          FROM lodge_reviews r
          JOIN tenants t ON r.tenant_id = t.id
          WHERE r.lodge_id = $1
          ORDER BY r.review_date DESC`,
          [lodge.id]
        );

        return {
          ...lodge,
          images: imagesResult.rows.map((row) => row.image_url),
          reviews: reviewsResult.rows,
        };
      })
    );

    const landlord = {
      ...landlordResult.rows[0],
      lodges,
    };

    res.status(200).json({
      landlord,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch profile",
    });
  }
});
// PUT /api/landlords/profile
router.put(
  "/profile",
  authMiddleware,
  landlordUpload.single("image"),
  [
    body("phone_number")
      .optional()
      .isMobilePhone()
      .withMessage("Valid phone number required"),
    body("phone_number_2")
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
        return res.status(400).json({
          errors: errors.array(),
        });
      }
      // Handle profile picture upload
      if (req.file) {
        const { rows } = await pool.query(
          "SELECT profile_picture FROM landlords WHERE id = $1",
          [req.user.id]
        );
        const oldImageUrl = rows[0]?.profile_picture;

        if (oldImageUrl) {
          deleteOldImage(oldImageUrl, "landlord"); // Remove old image if exists
        }

        const imageUrl = `${req.protocol}://${req.get("host")}/uploads/landlords/${req.file.filename}`;
        req.body.profile_picture = imageUrl;
      }
      const landlordId = req.user.id;
      const fields = [
        "phone_number",
        "phone_number_2",
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

      // Build update query dynamically
      for (const field of fields) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = $${idx}`);
          values.push(req.body[field]);
          idx++;
        }
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error: "No fields to update",
        });
      }

      values.push(landlordId);

      const query = `
      UPDATE landlords
      SET ${updates.join(", ")}
      WHERE id = $${idx}
      RETURNING phone_number,phone_number_2, address, gender, name, language_preference, profile_picture
      `;

      const result = await pool.query(query, values);

      res.status(200).json({
        message: "Profile updated successfully",
        landlord: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to update profile",
      });
    }
  }
);

// POST /api/landlords/logout
router.post("/logout", (req, res) => {
  res.status(200).json({
    message: "Logout successful",
  });
});
export default router;
