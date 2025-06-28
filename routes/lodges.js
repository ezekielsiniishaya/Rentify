// Imports
import express from "express";
import { body, validationResult } from "express-validator";
import authMiddleware from "../middlewares/auth.js";
import supabase from "../config/supabase.js";
import { deleteOldImage } from "../utils/upload.js";
import { lodgeUpload } from "../utils/upload.js";

const router = express.Router();

// Get all areas
router.get("/areas", authMiddleware, async (req, res) => {
  try {
    const { data: areas, error } = await supabase
      .from("areas")
      .select("name")
      .order("name", { ascending: true });

    if (error) throw error;

    res.json({ areas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch areas" });
  }
});
// Add lodge route (using Supabase)
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
        // Check if area exists in areas table by name
        const { data, error } = await supabase
          .from("areas")
          .select("id")
          .eq("name", value)
          .single();
        if (error || !data) {
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
        return res.status(400).json({
          errors: errors.array(),
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
      const { data: existing, error: existingError } = await supabase
        .from("lodges")
        .select("id")
        .eq("landlord_id", landlordId)
        .eq("name", name)
        .maybeSingle();
      if (existing) {
        return res.status(409).json({
          error: "A lodge with this name already exists.",
        });
      }

      // Get area_id from areas by area name
      const { data: areaData, error: areaError } = await supabase
        .from("areas")
        .select("id")
        .eq("name", area)
        .single();
      if (areaError || !areaData) {
        return res.status(400).json({
          error: "Selected area does not exist",
        });
      }
      const area_id = areaData.id;

      // Insert lodge into database, now including area_id
      const { data: lodgeData, error: lodgeError } = await supabase
        .from("lodges")
        .insert([
          {
            landlord_id: landlordId,
            name,
            description,
            address,
            price,
            capacity,
            available_rooms,
            area_id,
          },
        ])
        .select("id, name")
        .single();
      if (lodgeError) {
        return res.status(500).json({
          error: "Failed to create lodge",
        });
      }
      const lodgeId = lodgeData.id;

      // If images uploaded, save files to cloudinary
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const imageUrl = file.path;
          const { error: imageInsertError } = await supabase
            .from("lodge_images")
            .insert([{ lodge_id: lodgeId, image_url: imageUrl }]);

          if (imageInsertError) {
            console.error("Image insert error:", imageInsertError.message);
          }
        }
      }

      res.status(201).json({
        message: "Lodge created successfully",
        lodge: lodgeData,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to create lodge",
      });
    }
  }
);
// Search route (Supabase version)
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { area_id, min_price, max_price, name, min_rooms, max_rooms } =
      req.query;

    let query = supabase
      .from("lodges")
      .select(
        `
        id, name, description, address, price, capacity, available_rooms, display_status, created_at,
        lodge_images:image_url[]
        `
      )
      .eq("display_status", true);

    if (area_id) query = query.eq("area_id", area_id);
    if (min_price) query = query.gte("price", min_price);
    if (max_price) query = query.lte("price", max_price);
    if (min_rooms) query = query.gte("available_rooms", min_rooms);
    if (max_rooms) query = query.lte("available_rooms", max_rooms);
    if (name) query = query.ilike("name", `%${name}%`);

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to search lodges" });
    }

    // If you want to flatten images to an array of URLs:
    const lodges = (data || []).map((lodge) => ({
      ...lodge,
      images: Array.isArray(lodge.lodge_images)
        ? lodge.lodge_images.map((img) => img.image_url || img)
        : [],
    }));

    res.status(200).json({ lodges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search lodges" });
  }
});
// GET BASIC LODGES (with minimal landlord info) - Supabase version
router.get("/", authMiddleware, async (_, res) => {
  try {
    // Fetch all lodges with landlord info and images using Supabase
    const { data, error } = await supabase
      .from("lodges")
      .select(
        `
        id, name, description, address, price, capacity, available_rooms, display_status,
        landlord:landlord_id (
          id, name, profile_picture, verification_status
        ),
        lodge_images:image_url[]
        `
      )
      .eq("display_status", true);

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch lodges" });
    }

    // Flatten images to array of URLs
    const lodges = (data || []).map((lodge) => ({
      ...lodge,
      images: Array.isArray(lodge.lodge_images)
        ? lodge.lodge_images.map((img) => img.image_url || img)
        : [],
    }));

    res.status(200).json({
      lodges,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch lodges",
    });
  }
});

// GET ALL LODGES BY LANDLORD ID (Supabase version)
router.get("/landlord/:landlordId", authMiddleware, async (req, res) => {
  try {
    const { landlordId } = req.params;

    // Get landlord info
    const { data: landlord, error: landlordError } = await supabase
      .from("landlords")
      .select(
        "id, name, email, phone_number, profile_picture, verification_status, account_created"
      )
      .eq("id", landlordId)
      .single();

    if (landlordError || !landlord) {
      return res.status(404).json({
        error: "Landlord not found",
      });
    }

    // Get all lodges with images for this landlord
    const { data: lodges, error: lodgesError } = await supabase
      .from("lodges")
      .select(
        `
        *,
        lodge_images:image_url[]
      `
      )
      .eq("landlord_id", landlordId)
      .eq("display_status", true);

    if (lodgesError) {
      console.error(lodgesError);
      return res.status(500).json({
        error: "Failed to fetch landlord lodges",
      });
    }

    // Flatten images to array of URLs
    const lodgesWithImages = (lodges || []).map((lodge) => ({
      ...lodge,
      images: Array.isArray(lodge.lodge_images)
        ? lodge.lodge_images.map((img) => img.image_url || img)
        : [],
    }));

    res.status(200).json({
      landlord,
      lodges: lodgesWithImages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch landlord lodges",
    });
  }
});

// Get all VISIBLE lodges (Supabase version)
router.get("/visible", authMiddleware, async (_, res) => {
  try {
    // Fetch all visible lodges with images (primary first if available)
    const { data, error } = await supabase
      .from("lodges")
      .select(
        `
        id, name, description, address, price, capacity, available_rooms, created_at,
        lodge_images:image_url(*)
        `
      )
      .eq("display_status", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Failed to fetch visible lodges" });
    }

    // Reformat images: sort by is_primary DESC, id ASC, then map to URLs
    const lodges = (data || []).map((lodge) => ({
      ...lodge,
      images: Array.isArray(lodge.lodge_images)
        ? lodge.lodge_images
            .sort((a, b) => {
              // Sort by is_primary DESC, then id ASC
              if ((b.is_primary ? 1 : 0) !== (a.is_primary ? 1 : 0)) {
                return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
              }
              return (a.id || 0) - (b.id || 0);
            })
            .map((img) => img.image_url)
        : [],
    }));

    res.status(200).json({
      lodges,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch visible lodges",
    });
  }
});
// Get all lodges from verified landlords
router.get("/verified", authMiddleware, async (req, res) => {
  try {
    const { data: lodges, error } = await supabase.rpc(
      "fetch_verified_lodges",
      {}
    );

    if (error) {
      console.error("Error fetching lodges from SQL function:", error);
      return res
        .status(500)
        .json({ error: "Database error while fetching lodges" });
    }

    res.status(200).json({ lodges: lodges || [] });
  } catch (err) {
    console.error("Unexpected server error:", err.message || err);
    res
      .status(500)
      .json({ error: "Unexpected server error while fetching lodges" });
  }
});

// Get lodge details with landlord and reviews
router.get("/:id", authMiddleware, async (req, res) => {
  const lodgeId = Number(req.params.id);

  try {
    const { data: lodge, error } = await supabase
      .from("lodges")
      .select(
        `
        id,
        name,
        description,
        address,
        price,
        capacity,
        available_rooms,
        display_status,
        lodge_images ( image_url ),
        landlords (
          name,
          verification_status,
          profile_picture
        ),
        lodge_reviews (
  review_text,
  rating,
  review_date,
  tenants (
    name
  )
)
        `
      )
      .eq("id", lodgeId)
      .maybeSingle();

    if (error) {
      console.error("Supabase error:", error);
      return res.status(500).json({ error: "Server error" });
    }

    if (!lodge) {
      return res
        .status(404)
        .json({ error: "Lodge not found or not owned by you" });
    }

    // Extract and flatten data
    const images = Array.isArray(lodge.lodge_images)
      ? lodge.lodge_images.map((img) => img.image_url)
      : [];

    const landlord = lodge.landlords || {
      name: "Unknown",
      verification_status: "Not Available",
      profile_picture: null,
    };

    // Fix: Use lodge.lodge_reviews and extract tenant_id, review_text, rating, review_date, and tenant name
    const reviews = Array.isArray(lodge.lodge_reviews)
      ? lodge.lodge_reviews.map((r) => ({
          tenant_id: r.tenants ? r.tenants.id : null,
          tenant_name: r.tenants ? r.tenants.name : null,
          review_text: r.review_text,
          rating: r.rating,
          review_date: r.review_date,
        }))
      : [];

    res.status(200).json({
      lodge: {
        id: lodge.id,
        name: lodge.name,
        description: lodge.description,
        address: lodge.address,
        price: lodge.price,
        capacity: lodge.capacity,
        available_rooms: lodge.available_rooms,
        display_status: lodge.display_status,
        images,
        host: {
          name: landlord.name,
          verification_status: landlord.verification_status,
          profile_picture: landlord.profile_picture,
        },
        reviews,
      },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

// UPDATE LODGE (Supabase version)
router.put(
  "/:id",
  authMiddleware,
  lodgeUpload.array("images", 10),
  [
    body("name").optional().notEmpty().withMessage("Name is required"),
    body("address").optional().notEmpty().withMessage("Address is required"),
    body("area")
      .optional()
      .custom(async (value) => {
        if (!value) return true;
        const { data, error } = await supabase
          .from("areas")
          .select("id")
          .eq("name", value)
          .single();
        if (error || !data) throw new Error("Selected area does not exist");
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

    const { name, description, address, area } = req.body;
    const price = req.body.price ? Number(req.body.price) : undefined;
    const capacity = req.body.capacity ? Number(req.body.capacity) : undefined;
    const available_rooms = req.body.available_rooms
      ? Number(req.body.available_rooms)
      : undefined;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { data: lodgeCheck, error: lodgeCheckError } = await supabase
        .from("lodges")
        .select("id")
        .eq("id", lodgeId)
        .eq("landlord_id", landlordId)
        .maybeSingle();
      if (lodgeCheckError || !lodgeCheck) {
        return res
          .status(403)
          .json({ error: "Unauthorized or lodge not found" });
      }

      if (name) {
        const { data: conflict } = await supabase
          .from("lodges")
          .select("id")
          .eq("landlord_id", landlordId)
          .eq("name", name)
          .neq("id", lodgeId)
          .maybeSingle();
        if (conflict) {
          return res.status(409).json({
            error: "A lodge with this name already exists.",
          });
        }
      }

      const imagesToDelete = req.body.imagesToDelete
        ? JSON.parse(req.body.imagesToDelete)
        : [];

      // 🗑️ Delete old images from Cloudinary and Supabase
      for (const imageUrl of imagesToDelete) {
        await deleteOldImage(imageUrl); // cloudinary public_id must be extracted inside this function
        await superbase
          .from("lodge_images")
          .delete()
          .eq("lodge_id", lodgeId)
          .eq("image_url", imageUrl);
      }

      // 📤 Upload new images to Supabase (Cloudinary already handled storage)
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await superbase
            .from("lodge_images")
            .insert([{ lodge_id: lodgeId, image_url: file.path }]); // file.path is Cloudinary URL
        }
      }

      // 📌 Convert area name to ID if provided
      let area_id;
      if (area) {
        const { data: areaData, error: areaError } = await supabase
          .from("areas")
          .select("id")
          .eq("name", area)
          .single();
        if (areaError || !areaData) {
          return res
            .status(400)
            .json({ error: "Selected area does not exist" });
        }
        area_id = areaData.id;
      }

      const updateObj = {};
      if (name !== undefined) updateObj.name = name;
      if (description !== undefined) updateObj.description = description;
      if (address !== undefined) updateObj.address = address;
      if (price !== undefined) updateObj.price = price;
      if (capacity !== undefined) updateObj.capacity = capacity;
      if (available_rooms !== undefined)
        updateObj.available_rooms = available_rooms;
      if (area_id !== undefined) updateObj.area_id = area_id;

      const { data: updated, error: updateError } = await supabase
        .from("lodges")
        .update(updateObj)
        .eq("id", lodgeId)
        .select("*")
        .single();

      if (updateError) {
        return res.status(500).json({ error: "Failed to update lodge" });
      }

      res.status(200).json({
        message: "Lodge updated",
        lodge: updated,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update lodge" });
    }
  }
);

// DELETE LODGE (Supabase version)
router.delete("/:id", authMiddleware, async (req, res) => {
  const lodgeId = req.params.id;
  const landlordId = req.user.id;

  try {
    // Confirm ownership
    const { data: check, error: checkError } = await supabase
      .from("lodges")
      .select("id")
      .eq("id", lodgeId)
      .eq("landlord_id", landlordId)
      .maybeSingle();
    if (checkError || !check) {
      return res.status(403).json({ error: "Unauthorized or lodge not found" });
    }

    // 🔍 Fetch all images first (to delete from Cloudinary)
    const { data: images } = await supabase
      .from("lodge_images")
      .select("image_url")
      .eq("lodge_id", lodgeId);

    // 🗑️ Delete each image from Cloudinary
    if (images && images.length > 0) {
      for (const { image_url } of images) {
        await deleteOldImage(image_url, "lodge"); // your util should handle public_id extraction
      }
    }

    // 🧹 Clean up DB
    await supabase.from("lodge_images").delete().eq("lodge_id", lodgeId);
    await supabase.from("lodges").delete().eq("id", lodgeId);

    res.status(200).json({ message: "Lodge deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete lodge" });
  }
});

// Display status toggle route (Supabase version)
router.patch("/:id/display", authMiddleware, async (req, res) => {
  const lodgeId = req.params.id;
  const { status } = req.body;
  const landlordId = req.user.id;

  try {
    // Check if lodge exists and belongs to the landlord
    const { data: check, error: checkError } = await supabase
      .from("lodges")
      .select("id")
      .eq("id", lodgeId)
      .eq("landlord_id", landlordId)
      .maybeSingle();

    if (checkError || !check) {
      return res.status(404).json({
        error: "Lodge not found or unauthorized",
      });
    }

    // Update display status for lodge
    const { error: updateError } = await supabase
      .from("lodges")
      .update({ display_status: status })
      .eq("id", lodgeId)
      .eq("landlord_id", landlordId);

    if (updateError) {
      throw updateError;
    }

    res.json({
      message: `Lodge ${status ? "shown" : "hidden"}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to update lodge visibility",
    });
  }
});

// Add lodge to favorite route (Supabase version)
router.post("/:lodgeId/favorite", authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.id;
    const lodgeId = req.params.lodgeId;

    // Check if lodge exists
    const { data: lodge, error: lodgeError } = await supabase
      .from("lodges")
      .select("id")
      .eq("id", lodgeId)
      .maybeSingle();

    if (lodgeError || !lodge) {
      return res.status(404).json({
        error: "Lodge not found",
      });
    }

    // Add lodge to favorite
    const { data: favorite, error: favError } = await supabase
      .from("tenant_favorites")
      .insert([{ tenant_id: tenantId, lodge_id: lodgeId }])
      .select("id, tenant_id, lodge_id")
      .single();

    if (favError) {
      throw favError;
    }

    res.status(201).json({
      message: "favorite lodge added successfully",
      result: favorite,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to add lodge to favorite",
    });
  }
});

// Lodge review route (Supabase version)
router.post(
  "/:lodgeId/reviews",
  authMiddleware,
  [
    body("rating")
      .isInt({
        min: 1,
        max: 5,
      })
      .withMessage("Rating must be between 1 and 5"),
    body("review_text")
      .optional()
      .isString()
      .isLength({
        max: 500,
      })
      .withMessage("Comment must be at most 500 characters"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array(),
        });
      }

      const tenantId = req.user.id;
      const lodgeId = req.params.lodgeId;
      const { rating, review_text } = req.body;

      // Check if user is a tenant
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id")
        .eq("id", tenantId)
        .maybeSingle();

      if (tenantError || !tenant) {
        return res.status(403).json({
          error: "Only tenants can leave a review",
        });
      }

      // Check if lodge exists
      const { data: lodge, error: lodgeError } = await supabase
        .from("lodges")
        .select("id")
        .eq("id", lodgeId)
        .maybeSingle();

      if (lodgeError || !lodge) {
        return res.status(404).json({
          error: "Lodge not found",
        });
      }

      // Insert review
      const { data: review, error: reviewError } = await supabase
        .from("lodge_reviews")
        .insert([
          {
            tenant_id: tenantId,
            lodge_id: lodgeId,
            rating,
            review_text: review_text || null,
          },
        ])
        .select("id, tenant_id, lodge_id, rating, review_text, review_date")
        .single();

      if (reviewError) {
        throw reviewError;
      }

      res.status(201).json({
        message: "Review submitted successfully",
        review,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Failed to submit review",
      });
    }
  }
);

// Remove from favorites (Supabase version)
router.delete("/:lodgeId/favorite", authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.id;
    const lodgeId = parseInt(req.params.lodgeId, 10);

    // Check if lodge exists
    const { data: lodge, error: lodgeError } = await supabase
      .from("lodges")
      .select("id")
      .eq("id", lodgeId)
      .maybeSingle();

    if (lodgeError || !lodge) {
      return res.status(404).json({
        error: "Lodge not found",
      });
    }

    // Remove from favorites
    const { error: delError } = await supabase
      .from("tenant_favorites")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("lodge_id", lodgeId);

    if (delError) {
      throw delError;
    }

    res.status(200).json({
      message: "Lodge removed from favorites",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to remove from favorites",
    });
  }
});

// Favorite lodges
router.get("/tenant/favorite", authMiddleware, async (req, res) => {
  try {
    const tenantId = req.user.id;

    // Step 1: Get all favorite lodge IDs for this tenant
    const { data: favorites, error: favError } = await supabase
      .from("tenant_favorites")
      .select("lodge_id")
      .eq("tenant_id", tenantId);

    if (favError) {
      console.error("Favorite fetch error:", favError);
      return res.status(500).json({ error: "Failed to fetch favorites" });
    }

    const lodgeIds = (favorites || []).map((fav) => fav.lodge_id);

    if (lodgeIds.length === 0) {
      return res.status(200).json({ lodges: [] });
    }

    // Step 2: Fetch detailed lodge info for all favorite lodge IDs
    const { data: lodges, error: lodgesError } = await supabase
      .from("lodges")
      .select(
        `
        id, name, description, address, price, capacity, available_rooms, display_status, created_at,
        landlord:landlord_id (
          id, name, profile_picture, verification_status
        ),
        lodge_images (
          image_url
        )
      `
      )
      .in("id", lodgeIds)
      .eq("display_status", true);

    if (lodgesError) {
      console.error("Lodge fetch error:", lodgesError);
      return res.status(500).json({ error: "Failed to fetch favorite lodges" });
    }

    // Step 3: Flatten the lodge_images to an array of image URLs
    const lodgesWithImages = (lodges || []).map((lodge) => ({
      ...lodge,
      images: (lodge.lodge_images || []).map((img) => img.image_url),
    }));

    return res.status(200).json({ lodges: lodgesWithImages });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Failed to fetch favorite lodges" });
  }
});

// Change Lodge visibility (Supabase version)
router.patch("/:id/visibility", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { display_status } = req.body;
  const userId = req.user.id;

  if (typeof display_status !== "boolean") {
    return res.status(400).json({ error: "display_status must be a boolean" });
  }

  try {
    // Check lodge exists and belongs to the landlord
    const { data: lodge, error: findError } = await supabase
      .from("lodges")
      .select("id, landlord_id")
      .eq("id", id)
      .single();

    if (findError) throw findError;
    if (!lodge) {
      return res.status(404).json({ error: "Lodge not found" });
    }

    if (lodge.landlord_id !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update display status
    const { error: updateError } = await supabase
      .from("lodges")
      .update({ display_status })
      .eq("id", id);

    if (updateError) throw updateError;

    return res.status(200).json({
      message: `Lodge is now marked as ${
        display_status ? "Available" : "Full"
      }`,
    });
  } catch (error) {
    console.error("Update visibility error:", error.message || error);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
