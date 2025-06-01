import express from "express";
import { body, validationResult } from "express-validator";
import authMiddleware from "../middlewares/auth.js";
import { lodgeUpload } from "../utils/upload.js";
import { pool } from "../config/db.js";

const router = express.Router();

// ADD LODGE
router.post(
  "/add",
  authMiddleware,
  lodgeUpload.single("image"),
  [
    body("name").optional().notEmpty().withMessage("Name is required"),
    body("address").optional().notEmpty().withMessage("Address is required"),

    // Allow string values that can be converted to numbers
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
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      console.log("Received body:", req.body);

      const landlordId = req.user.id;
      const { name, description, address, price, capacity, available_rooms } =
        req.body;

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
router.get("/", async (req, res) => {
  try {
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

    // Get all lodges with images
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
// UPDATE LODGE
router.put(
  "/:id",
  authMiddleware,
  lodgeUpload.single("image"),
  [
    body("name").optional().notEmpty().withMessage("Name is required"),
    body("address").optional().notEmpty().withMessage("Address is required"),

    // Allow string values that can be converted to numbers
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
    const { name, description, address } = req.body;
    const price = req.body.price ? Number(req.body.price) : null;
    const capacity = req.body.capacity ? Number(req.body.capacity) : null;
    const available_rooms = req.body.available_rooms
      ? Number(req.body.available_rooms)
      : null;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Check ownership
      const check = await pool.query(
        `SELECT id FROM lodges WHERE id = $1 AND landlord_id = $2`,
        [lodgeId, landlordId]
      );
      if (check.rowCount === 0) {
        return res
          .status(403)
          .json({ error: "Unauthorized or lodge not found" });
      }

      // Update lodge
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

      // If a new image is uploaded, insert new image row (or optionally update existing)
      if (req.file) {
        const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
        await pool.query(
          `INSERT INTO lodge_images (lodge_id, image_url) VALUES ($1, $2)`,
          [lodgeId, imageUrl]
        );
      }

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

// Get all lodges

router.get("/visible", async (req, res) => {
  try {
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

export default router;
