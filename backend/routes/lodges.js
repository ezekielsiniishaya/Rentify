import express from "express";
import { body, validationResult } from "express-validator";
import authMiddleware from "../middlewares/auth.js";
import { lodgeUpload } from "../utils/upload.js";
import { pool } from "../config/db.js";
import { deleteOldImage } from "../utils/upload.js";
const router = express.Router();

// ADD LODGE
router.post(
  "/add",
  authMiddleware,
  lodgeUpload.single("image"),
  [
    // Validation for required fields
    body("name").notEmpty().withMessage("Name is required"),
    body("address").notEmpty().withMessage("Address is required"),
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
      .custom((value, { req }) => {
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
        return res.status(400).json({ errors: errors.array() });
      }
      console.log("Received body:", req.body);

      const landlordId = req.user.id;
      const { name, description, address, price, capacity, available_rooms } =
        req.body;
      // Prevent duplicate lodge names for same landlord
      const existing = await pool.query(
        `SELECT id FROM lodges WHERE landlord_id = $1 AND name = $2`,
        [landlordId, name]
      );
      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ error: "You already added a lodge with this name." });
      }
      // Insert lodge into database
      const lodgeQuery = `
        INSERT INTO lodges 
        (landlord_id, name, description, address, price, capacity, available_rooms)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
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
      ];
      const lodgeResult = await pool.query(lodgeQuery, lodgeValues);
      const lodgeId = lodgeResult.rows[0].id;

      // If image uploaded, save image URL
      if (req.file) {
        const imageUrl = `${req.protocol}://${req.get("host")}/uploads/lodges/${req.file.filename}`;
        req.body.image = imageUrl;
        await pool.query(
          `INSERT INTO lodge_images (lodge_id, image_url) VALUES ($1, $2)`,
          [lodgeId, imageUrl]
        );
      }

      res.status(201).json({
        message: "Lodge created successfully",
        lodge: lodgeResult.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create lodge" });
    }
  }
);

// GET BASIC LODGES (with minimal landlord info)
router.get("/", async (_, res) => {
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

    res.status(200).json({ lodges: lodgesResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch lodges" });
  }
});

// GET ALL LODGES BY LANDLORD ID
router.get("/landlord/:landlordId", async (req, res) => {
  try {
    const { landlordId } = req.params;

    // Get landlord info
    const landlordResult = await pool.query(
      `SELECT id, name, email, phone_number, profile_picture, 
              verification_status, account_created
       FROM landlords 
       WHERE id = $1`,
      [landlordId]
    );

    if (landlordResult.rows.length === 0) {
      return res.status(404).json({ error: "Landlord not found" });
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
    res.status(500).json({ error: "Failed to fetch landlord lodges" });
  }
});

// GET /:id — get full lodge details, landlord info, and images
router.get("/:id", async (req, res) => {
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
      return res.status(404).json({ error: "Lodge not found or unavailable" });
    }

    res.status(200).json({ lodge: lodgeResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch lodge details" });
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
    const { name, description, address } = req.body;
    const price = req.body.price ? Number(req.body.price) : null;
    const capacity = req.body.capacity ? Number(req.body.capacity) : null;
    const available_rooms = req.body.available_rooms
      ? Number(req.body.available_rooms)
      : null;

    try {
      // Validate input fields
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Verify the lodge belongs to the authenticated landlord
      const check = await pool.query(
        `SELECT id FROM lodges WHERE id = $1 AND landlord_id = $2`,
        [lodgeId, landlordId]
      );
      if (check.rowCount === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized or lodge not found" });
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
            .json({ error: "A lodge with this name already exists." });
        }
      }

      // Parse imagesToDelete from request body (should be JSON stringified array)
      const imagesToDelete = req.body.imagesToDelete
        ? JSON.parse(req.body.imagesToDelete)
        : [];

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
        for (const file of req.files) {
          const imageUrl = `${req.protocol}://${req.get("host")}/uploads/lodges/${file.filename}`;
          await pool.query(
            `INSERT INTO lodge_images (lodge_id, image_url) VALUES ($1, $2)`,
            [lodgeId, imageUrl]
          );
        }
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
      const result = await pool.query(updateQuery, values);

      // Respond with updated lodge info
      res.status(200).json({ message: "Lodge updated", lodge: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update lodge" });
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
      return res.status(403).json({ error: "Unauthorized or lodge not found" });
    }

    // Delete images first if needed (optional cleanup)
    await pool.query(`DELETE FROM lodge_images WHERE lodge_id = $1`, [lodgeId]);

    // Delete lodge
    await pool.query(`DELETE FROM lodges WHERE id = $1`, [lodgeId]);

    res.status(200).json({ message: "Lodge deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete lodge" });
  }
});

// Get all lodges (visible)
router.get("/visible", async (_, res) => {
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
    res.status(200).json({ lodges: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch visible lodges" });
  }
});

// Display status toggle route
router.patch("/:id/display", authMiddleware, async (req, res) => {
  const lodgeId = req.params.id;
  const { status } = req.body;

  try {
    // Update display status for lodge
    await pool.query(
      `UPDATE lodges SET display_status = $1 WHERE id = $2 AND landlord_id = $3`,
      [status, lodgeId, req.user.id]
    );
    res.json({ message: `Lodge ${status ? "shown" : "hidden"}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update lodge visibility" });
  }
});

export default router;
