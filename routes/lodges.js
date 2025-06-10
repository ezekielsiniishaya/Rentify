// Imports
import express from "express";
import {
  body,
  validationResult
} from "express-validator";
import authMiddleware from "../middlewares/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  pool
} from "../config/db.js";
import {
  deleteOldImage
} from "../utils/upload.js";
const router = express.Router();
const memoryStorage = multer.memoryStorage();
const lodgeUpload = multer( {
  storage: memoryStorage
});
// Add lodge route
router.post(
  "/add",
  authMiddleware,
  lodgeUpload.array("images", 10), // Allow multiple images uploaded with field name "images", max 10
  [
    // Validation for required fields
    body("name").notEmpty().withMessage("Name is required"),
    body("address").notEmpty().withMessage("Address is required"),
    body("area")
    .notEmpty()
    .withMessage("Area is required")
    .custom(async (value) => {
      // Check if area exists in lodge_areas table by name
      const areaCheck = await pool.query(
        "SELECT id FROM areas WHERE name = $1",
        [value]
      );
      if (areaCheck.rows.length === 0) {
        throw new Error("Selected area does not exist");
      }
      return true;
    }),
    body("price")
    .notEmpty()
    .withMessage("Price is required")
    .custom((value) => !isNaN(value) && Number(value) > 0)
    .withMessage("Price must be a positive number"),
    body("capacity")
    .notEmpty()
    .withMessage("Capacity is required")
    .custom((value) => Number.isInteger(Number(value)) && Number(value) > 0)
    .withMessage("Capacity must be a positive integer"),
    body("available_rooms")
    .notEmpty()
    .withMessage("Available rooms is required")
    .custom((value, {
      req
    }) => {
      const rooms = Number(value);
      const cap = Number(req.body.capacity);
      return Number.isInteger(rooms) && rooms > 0 && (!cap || rooms <= cap);
    })
    .withMessage(
      "Available rooms must be a positive integer not exceeding capacity"
    ),
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array()
        });
      }

      const landlordId = req.user.id;
      const {
        name,
        description,
        address,
        price,
        capacity,
        available_rooms,
        area,
      } = req.body;

      // Prevent duplicate lodge names for same landlord
      const existing = await pool.query(
        `SELECT id FROM lodges WHERE landlord_id = $1 AND name = $2`,
        [landlordId, name]
      );
      if (existing.rows.length > 0) {
        return res
        .status(409)
        .json({
          error: "A lodge with this name already exists."
        });
      }

      // Get area_id from lodge_areas by area name
      const areaResult = await pool.query(
        "SELECT id FROM areas WHERE name = $1",
        [area]
      );
      if (areaResult.rows.length === 0) {
        return res.status(400).json({
          error: "Selected area does not exist"
        });
      }
      const area_id = areaResult.rows[0].id;

      // Insert lodge into database, now including area_id
      const lodgeQuery = `
      INSERT INTO lodges
      (landlord_id, name, description, address, price, capacity, available_rooms, area_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name
      `;
      const lodgeValues = [
        landlordId,
        name,
        description,
        address,
        price,
        capacity,
        available_rooms,
        area_id,
      ];
      const lodgeResult = await pool.query(lodgeQuery, lodgeValues);
      const lodgeId = lodgeResult.rows[0].id;

      // If images uploaded, save files to disk and URLs to DB
      if (req.files && req.files.length > 0) {
        const uploadDir = path.join(process.cwd(), "uploads", "lodges");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, {
            recursive: true
          });
        }
        for (const file of req.files) {
          const filename = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
          const filepath = path.join(uploadDir, filename);
          fs.writeFileSync(filepath, file.buffer);
          const imageUrl = `${req.protocol}://${req.get("host")}/uploads/lodges/${filename}`;
          await pool.query(
            `INSERT INTO lodge_images (lodge_id, image_url) VALUES ($1, $2)`,
            [lodgeId, imageUrl]
          );
        }
      }
      res.status(201).json({
        message: "Lodge created successfully",
        lodge: lodgeResult.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to create lodge"
      });
    }
  }
);
// Search route
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { area_id, min_price, max_price, name, min_rooms, max_rooms } =
      req.query;
    let query = `
      SELECT 
        l.id, l.name, l.description, l.address, l.price,
        l.capacity, l.available_rooms, l.display_status, l.created_at,
        COALESCE(
          (SELECT json_agg(li.image_url)
           FROM lodge_images li
           WHERE li.lodge_id = l.id),
          '[]'::json
        ) AS images
      FROM lodges l
      WHERE l.display_status = true
    `;
    const params = [];
    let idx = 1;

    if (area_id) {
      query += ` AND l.area_id = $${idx++}`;
      params.push(area_id);
    }
    if (min_price) {
      query += ` AND l.price >= $${idx++}`;
      params.push(min_price);
    }
    if (max_price) {
      query += ` AND l.price <= $${idx++}`;
      params.push(max_price);
    }
    if (min_rooms) {
      query += ` AND l.available_rooms >= $${idx++}`;
      params.push(min_rooms);
    }
    if (max_rooms) {
      query += ` AND l.available_rooms <= $${idx++}`;
      params.push(max_rooms);
    }
    if (name) {
      query += ` AND LOWER(l.name) LIKE $${idx++}`;
      params.push(`%${name.toLowerCase()}%`);
    }
    query += " ORDER BY l.created_at DESC";

    const result = await pool.query(query, params);
    res.status(200).json({ lodges: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search lodges" });
  }
});
// GET BASIC LODGES (with minimal landlord info)
router.get("/", authMiddleware, async (_, res) => {
  try {
    // Fetch all lodges with landlord info and images
    const lodgesResult = await pool.query(
      `SELECT
      l.id, l.name, l.description, l.address, l.price,
      l.capacity, l.available_rooms, l.display_status,
      json_build_object(
      'id', ld.id,
      'name', ld.name,
      'profile_picture', ld.profile_picture,
      'verification_status', ld.verification_status
      ) AS landlord,
      COALESCE(
      (SELECT json_agg(li.image_url)
      FROM lodge_images li
      WHERE li.lodge_id = l.id),
      '[]'::json
      ) AS images
      FROM lodges l
      JOIN landlords ld ON l.landlord_id = ld.id
      WHERE l.display_status = true`
    );

    res.status(200).json({
      lodges: lodgesResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch lodges"
    });
  }
});

// GET ALL LODGES BY LANDLORD ID
router.get("/landlord/:landlordId", authMiddleware, async (req, res) => {
  try {
    const {
      landlordId
    } = req.params;

    // Get landlord info
    const landlordResult = await pool.query(
      `SELECT id, name, email, phone_number, profile_picture,
      verification_status, account_created
      FROM landlords
      WHERE id = $1`,
      [landlordId]
    );

    if (landlordResult.rows.length === 0) {
      return res.status(404).json({
        error: "Landlord not found"
      });
    }

    // Get all lodges with images for this landlord
    const lodgesResult = await pool.query(
      `SELECT l.*,
      COALESCE(
      (SELECT json_agg(li.image_url)
      FROM lodge_images li
      WHERE li.lodge_id = l.id),
      '[]'::json
      ) AS images
      FROM lodges l
      WHERE l.landlord_id = $1
      AND l.display_status = true`,
      [landlordId]
    );

    res.status(200).json({
      landlord: landlordResult.rows[0],
      lodges: lodgesResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch landlord lodges"
    });
  }
});

// Get all VISIBLE lodge
router.get("/visible", authMiddleware, async (_, res) => {
  try {
    const query = `
    SELECT
    l.id,
    l.name,
    l.description,
    l.address,
    l.price,
    l.capacity,
    l.available_rooms,
    l.created_at,
    COALESCE(json_agg(
    json_build_object(
    'url', li.image_url,
    'is_primary', li.is_primary
    )
    ORDER BY li.is_primary DESC, li.id
    ) FILTER (WHERE li.id IS NOT NULL), '[]') AS images
    FROM lodges l
    LEFT JOIN lodge_images li ON l.id = li.lodge_id
    WHERE l.display_status = true
    GROUP BY l.id
    ORDER BY l.created_at DESC;
    `;

    const result = await pool.query(query);

    // Reformat images to plain array of URLs with primary first
    const lodges = result.rows.map((lodge) => ({
      ...lodge,
      images: lodge.images.map((img) => img.url),
    }));

    res.status(200).json({
      lodges
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch visible lodges"
    });
  }
});

// GET /:id — get full lodge details, landlord info, images, and reviews
router.get("/:id", authMiddleware, async (req, res) => {
  const lodgeId = req.params.id;

  try {
    // Fetch lodge details with landlord info and images
    const lodgeResult = await pool.query(
      `SELECT
      l.id, l.name, l.description, l.address, l.price,
      l.capacity, l.available_rooms, l.display_status, l.created_at,
      json_build_object(
      'id', ld.id,
      'name', ld.name,
      'profile_picture', ld.profile_picture,
      'verification_status', ld.verification_status,
      'email', ld.email,
      'phone_number', ld.phone_number
      ) AS landlord,
      COALESCE(
      (SELECT json_agg(li.image_url)
      FROM lodge_images li
      WHERE li.lodge_id = l.id),
      '[]'::json
      ) AS images
      FROM lodges l
      JOIN landlords ld ON l.landlord_id = ld.id
      WHERE l.id = $1 AND l.display_status = true`,
      [lodgeId]
    );

    if (lodgeResult.rows.length === 0) {
      return res.status(404).json({
        error: "Lodge not found or unavailable"
      });
    }

    // Fetch reviews for the lodge (with tenant info)
    const reviewsResult = await pool.query(
      `SELECT
      r.id, r.rating, r.review_text, r.review_date,
      json_build_object(
      'id', t.id,
      'name', t.name
      ) AS tenant
      FROM lodge_reviews r
      JOIN tenants t ON r.tenant_id = t.id
      WHERE r.lodge_id = $1
      ORDER BY r.review_date DESC`,
      [lodgeId]
    );

    res.status(200).json({
      lodge: {
        ...lodgeResult.rows[0],
        reviews: reviewsResult.rows,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch lodge details"
    });
  }
});

// UPDATE LODGE
router.put(
  "/:id",
  authMiddleware,
  lodgeUpload.array("images", 10), // Allow multiple images uploaded with field name "images", max 10
  [
    // Optional fields validation
    body("name").optional().notEmpty().withMessage("Name is required"),
    body("address").optional().notEmpty().withMessage("Address is required"),
    body("area")
    .optional()
    .custom(async (value) => {
      if (!value) return true;
      // Check if area exists in areas table by name
      const areaCheck = await pool.query(
        "SELECT id FROM areas WHERE name = $1",
        [value]
      );
      if (areaCheck.rows.length === 0) {
        throw new Error("Selected area does not exist");
      }
      return true;
    }),
    body("price")
    .optional()
    .custom((value) => !isNaN(value))
    .withMessage("Price must be a number"),
    body("capacity")
    .optional()
    .custom((value) => Number.isInteger(Number(value)) && Number(value) > 0)
    .withMessage("Capacity must be a positive integer"),
    body("available_rooms")
    .optional()
    .custom((value) => Number.isInteger(Number(value)) && Number(value) > 0)
    .withMessage("Available rooms must be a positive integer"),
  ],
  async (req, res) => {
    const lodgeId = req.params.id;
    const landlordId = req.user.id;

    // Extract possible fields from body
    const {
      name, description, address, area
    } = req.body;
    const price = req.body.price ? Number(req.body.price): null;
    const capacity = req.body.capacity ? Number(req.body.capacity): null;
    const available_rooms = req.body.available_rooms
    ? Number(req.body.available_rooms): null;

    try {
      // Validate input fields
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array()
        });
      }

      // Verify the lodge belongs to the authenticated landlord
      const check = await pool.query(
        `SELECT id FROM lodges WHERE id = $1 AND landlord_id = $2`,
        [lodgeId, landlordId]
      );
      if (check.rowCount === 0) {
        return res
        .status(403)
        .json({
          error: "Unauthorized or lodge not found"
        });
      }

      // Check if the updated name conflicts with other lodges of the landlord
      if (name) {
        const conflict = await pool.query(
          `SELECT id FROM lodges WHERE landlord_id = $1 AND name = $2 AND id <> $3`,
          [landlordId, name, lodgeId]
        );
        if (conflict.rowCount > 0) {
          return res
          .status(409)
          .json({
            error: "A lodge with this name already exists."
          });
        }
      }

      // Parse imagesToDelete from request body (should be JSON stringified array)
      const imagesToDelete = req.body.imagesToDelete
      ? JSON.parse(req.body.imagesToDelete): [];

      // Delete old images as requested
      for (const imageUrl of imagesToDelete) {
        // Delete the image file from storage
        deleteOldImage(imageUrl, "lodge");

        // Delete the image record from the database
        await pool.query(
          `DELETE FROM lodge_images WHERE lodge_id = $1 AND image_url = $2`,
          [lodgeId, imageUrl]
        );
      }

      // Insert new uploaded images (if any)
      if (req.files && req.files.length > 0) {
        const uploadDir = path.join(process.cwd(), "uploads", "lodges");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, {
            recursive: true
          });
        }
        for (const file of req.files) {
          const filename = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
          const filepath = path.join(uploadDir, filename);
          fs.writeFileSync(filepath, file.buffer);
          const imageUrl = `${req.protocol}://${req.get("host")}/uploads/lodges/${filename}`;
          await pool.query(
            `INSERT INTO lodge_images (lodge_id, image_url) VALUES ($1, $2)`,
            [lodgeId, imageUrl]
          );
        }
      }

      // If area is provided, get area_id
      let area_id = null;
      if (area) {
        const areaResult = await pool.query(
          "SELECT id FROM areas WHERE name = $1",
          [area]
        );
        if (areaResult.rows.length === 0) {
          return res
          .status(400)
          .json({
            error: "Selected area does not exist"
          });
        }
        area_id = areaResult.rows[0].id;
      }

      // Update lodge details (only fields provided)
      const updateQuery = `
      UPDATE lodges
      SET name = COALESCE($1, name),
      description = COALESCE($2, description),
      address = COALESCE($3, address),
      price = COALESCE($4, price),
      capacity = COALESCE($5, capacity),
      available_rooms = COALESCE($6, available_rooms)
      ${area ? ", area_id = $8": ""}
      WHERE id = $7
      RETURNING *
      `;
      const values = [
        name,
        description,
        address,
        price,
        capacity,
        available_rooms,
        lodgeId,
      ];
      if (area) values.push(area_id);

      const result = await pool.query(updateQuery, values);

      // Respond with updated lodge info
      res.status(200).json({
        message: "Lodge updated", lodge: result.rows[0]
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to update lodge"
      });
    }
  }
);

// DELETE LODGE
router.delete("/:id", authMiddleware, async (req, res) => {
  const lodgeId = req.params.id;
  const landlordId = req.user.id;

  try {
    // Check ownership
    const check = await pool.query(
      `SELECT id FROM lodges WHERE id = $1 AND landlord_id = $2`,
      [lodgeId, landlordId]
    );
    if (check.rowCount === 0) {
      return res.status(403).json({
        error: "Unauthorized or lodge not found"
      });
    }

    // Delete images first if needed (optional cleanup)
    await pool.query(`DELETE FROM lodge_images WHERE lodge_id = $1`, [lodgeId]);

    // Delete lodge
    await pool.query(`DELETE FROM lodges WHERE id = $1`, [lodgeId]);

    res.status(200).json({
      message: "Lodge deleted"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to delete lodge"
    });
  }
});

// Get all lodges (visible)
router.get("/visible", authMiddleware, async (_, res) => {
  try {
    // Fetch all visible lodges with one image (if any)
    const query = `
    SELECT l.id, l.name, l.description, l.address, l.price, l.capacity, l.available_rooms, l.created_at,
    i.image_url
    FROM lodges l
    LEFT JOIN lodge_images i ON l.id = i.lodge_id
    WHERE l.display_status = true
    `;
    const result = await pool.query(query);
    res.status(200).json({
      lodges: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch visible lodges"
    });
  }
});

// Display status toggle route
router.patch("/:id/display", authMiddleware, async (req, res) => {
  const lodgeId = req.params.id;
  const {
    status
  } = req.body;

  try {
    // Check if lodge exists and belongs to the landlord
    const check = await pool.query(
      `SELECT id FROM lodges WHERE id = $1 AND landlord_id = $2`,
      [lodgeId, req.user.id]
    );
    if (check.rowCount === 0) {
      return res.status(404).json({
        error: "Lodge not found or unauthorized"
      });
    }

    // Update display status for lodge
    await pool.query(
      `UPDATE lodges SET display_status = $1 WHERE id = $2 AND landlord_id = $3`,
      [status, lodgeId, req.user.id]
    );
    res.json({
      message: `Lodge ${status ? "shown": "hidden"}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to update lodge visibility"
    });
  }
});

// Add lodge to favorite route
router.post("/:lodgeId/favorite", authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.id;
    const lodgeId = req.params.lodgeId;

    // Check if lodge exists
    const lodgeResult = await pool.query(
      "SELECT id FROM lodges WHERE id = $1",
      [lodgeId]
    );
    if (lodgeResult.rows.length === 0) {
      return res.status(404).json({
        error: "Lodge not found"
      });
    }

    // Add lodge to favorite
    const insertQuery = `
    INSERT INTO tenant_favorites (tenant_id, lodge_id)
    VALUES ($1, $2)
    RETURNING id, tenant_id, lodge_id
    `;
    const values = [tenantId,
      lodgeId];
    const favoriteResult = await pool.query(insertQuery, values);

    res.status(201).json({
      message: "favorite lodge added successfully",
      result: favoriteResult.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to add lodge to favorite"
    });
  }
});
// Lodge review route
router.post(
  "/:lodgeId/reviews",
  authMiddleware,
  [
    body("rating")
    .isInt({
      min: 1, max: 5
    })
    .withMessage("Rating must be between 1 and 5"),
    body("review_text")
    .optional()
    .isString()
    .isLength({
      max: 500
    })
    .withMessage("Comment must be at most 500 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array()
        });
      }

      const tenantId = req.user.id;
      const lodgeId = req.params.lodgeId;
      const {
        rating,
        review_text
      } = req.body;

      // Check if lodge exists
      const lodgeResult = await pool.query(
        "SELECT id FROM lodges WHERE id = $1",
        [lodgeId]
      );
      if (lodgeResult.rows.length === 0) {
        return res.status(404).json({
          error: "Lodge not found"
        });
      }

      // Insert review
      const insertQuery = `
      INSERT INTO lodge_reviews (tenant_id, lodge_id, rating, review_text)
      VALUES ($1, $2, $3, $4)
      RETURNING id, tenant_id, lodge_id, rating, review_text, review_date
      `;
      const values = [tenantId,
        lodgeId,
        rating,
        review_text || null];
      const reviewResult = await pool.query(insertQuery, values);

      res.status(201).json({
        message: "Review submitted successfully",
        review: reviewResult.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to submit review"
      });
    }
  }
);

// Remove from favorites
router.delete("/:lodgeId/favorite", authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.id;
    const lodgeId = parseInt(req.params.lodgeId, 10);

    // Check if lodge exists
    const lodgeResult = await pool.query(
      "SELECT id FROM lodges WHERE id = $1",
      [lodgeId]
    );
    if (lodgeResult.rows.length === 0) {
      return res.status(404).json({
        error: "Lodge not found"
      });
    }

    // Remove from favorites
    await pool.query(
      "DELETE FROM tenant_favorites WHERE tenant_id = $1 AND lodge_id = $2",
      [tenantId, lodgeId]
    );

    res.status(200).json({
      message: "Lodge removed from favorites"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to remove from favorites"
    });
  }
});

export default router;