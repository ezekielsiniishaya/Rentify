import { Router } from "express";
import { hash, compare } from "bcryptjs";
import { landlordUpload } from "../utils/upload.js";
import { body, validationResult } from "express-validator";
import authMiddleware from "../middlewares/auth.js";
import pkg from "jsonwebtoken";
import { deleteOldImage } from "../utils/upload.js";
import supabase from "../config/supabase.js";
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import sendVerificationEmail from "../utils/mail.js";

const { sign } = pkg;
const router = Router();

// POST /api/landlords/register
router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone_number")
      .notEmpty()
      .withMessage("Phone number is required")
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

      const { email, phone_number, password } = req.body;

      const { data: existingLandlords, error: existingError } = await supabase
        .from("landlords")
        .select("id, email, phone_number")
        .or(`email.eq.${email},phone_number.eq.${phone_number}`);

      if (existingError) {
        return res
          .status(500)
          .json({ error: "Database error: " + existingError.message });
      }
      if (existingLandlords && existingLandlords.length > 0) {
        const existing = existingLandlords[0];
        let errorMsg = "Account already registered";
        if (existing.email === req.body.email) {
          errorMsg = "Email already registered";
        } else if (existing.phone_number === req.body.phone_number) {
          errorMsg = "Phone number already registered";
        }
        return res.status(400).json({ error: errorMsg });
      }
      // Hash the password and generate email token
      const hashedPassword = await hash(password, 10);
      const emailToken = crypto.randomBytes(32).toString("hex");

      const { data, error } = await supabase
        .from("landlords")
        .insert([
          {
            email,
            phone_number,
            password: hashedPassword,
            email_token: emailToken,
            display_status: false,
          },
        ])
        .select("id, email");

      if (error) {
        return res
          .status(500)
          .json({ error: "Database error: " + error.message });
      }

      await sendVerificationEmail(email, emailToken);

      res.status(201).json({
        message:
          "Registration successful. Please check your email to verify your account.",
        landlord: data && data.length > 0 ? data[0] : null,
      });
    } catch (err) {
      console.error(err);
      if (err.code === "23505") {
        let errorMsg = "Duplicate entry";
        if (err.detail && err.detail.includes("email")) {
          errorMsg = "Email already registered";
        } else if (err.detail && err.detail.includes("phone_number")) {
          errorMsg = "Phone number already registered";
        }
        return res.status(400).json({ error: errorMsg });
      }
      res.status(500).json({ error: "Registration failed: " + err.message });
    }
  }
);
// GET /api/landlords/verify-email?token=xyz
router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  const { data: users, error } = await supabase
    .from("landlords")
    .select("*")
    .eq("email_token", token)
    .limit(1);

  if (error || !users || users.length === 0) {
    return res.redirect("/login.html?message=Invalid%20or%20expired%20token");
  }

  const user = users[0];

  const { error: updateError } = await supabase
    .from("landlords")
    .update({
      display_status: true,
      email_token: null,
    })
    .eq("id", user.id);

  if (updateError) {
    return res.redirect("/login.html?message=Verification%20failed");
  }

  // Redirect with success message
  return res.redirect("/login.html?message=Email%20successfully%20verified");
});

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
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const { data: landlord, error } = await supabase
        .from("landlords")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (error || !landlord) {
        return res.status(400).json({ error: "Email does not exist" });
      }
      if (!user.display_status) {
        return res
          .status(403)
          .json({ error: "Please verify your email first." });
      }

      const isMatch = await compare(password, landlord.password);
      if (!isMatch) {
        return res.status(400).json({ error: "Wrong password" });
      }

      const token = sign(
        { id: landlord.id, role: "landlord" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
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
      res.status(500).json({ error: "Login failed" });
    }
  }
);

// GET /api/landlords/profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const landlordId = req.user.id;

    // Fetch landlord profile
    const { data: landlord, error: landlordError } = await supabase
      .from("landlords")
      .select(
        "id, email, phone_number, phone_number_2, account_created, address, display_status, gender, name, language_preference, profile_picture, verification_status"
      )
      .eq("id", landlordId)
      .maybeSingle();

    if (landlordError || !landlord) {
      return res.status(404).json({ error: "Landlord not found" });
    }

    // Fetch lodges owned by the landlord
    const { data: lodges, error: lodgesError } = await supabase
      .from("lodges")
      .select(
        "id, name, description, address, price, capacity, available_rooms, verification_status, display_status, created_at"
      )
      .eq("landlord_id", landlordId);

    if (lodgesError) {
      return res.status(500).json({ error: "Failed to fetch lodges" });
    }

    // For each lodge, fetch images and reviews
    const lodgesWithDetails = await Promise.all(
      (lodges || []).map(async (lodge) => {
        // Images
        const { data: images } = await supabase
          .from("lodge_images")
          .select("image_url")
          .eq("lodge_id", lodge.id);

        // Reviews
        const { data: reviews } = await supabase
          .from("lodge_reviews")
          .select(
            "id, rating, review_text, review_date, tenant:tenant_id(id, name)"
          )
          .eq("lodge_id", lodge.id)
          .order("review_date", { ascending: false });

        return {
          ...lodge,
          images: (images || []).map((row) => row.image_url),
          reviews: reviews || [],
        };
      })
    );

    res.status(200).json({
      landlord: {
        ...landlord,
        lodges: lodgesWithDetails,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Update profile
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
        return res.status(400).json({ errors: errors.array() });
      }

      let profile_picture;

      if (req.file && req.file.path) {
        profile_picture = req.file.path; // Cloudinary secure URL

        // Get old image
        const { data: landlord } = await supabase
          .from("landlords")
          .select("profile_picture")
          .eq("id", req.user.id)
          .maybeSingle();

        const oldImageUrl = landlord?.profile_picture;

        // 🧼 Delete previous image from Cloudinary
        if (oldImageUrl && oldImageUrl.includes("res.cloudinary.com")) {
          await deleteOldImage(oldImageUrl); // Calls cloudinary.uploader.destroy
        }
      }

      const updateFields = {};
      [
        "phone_number",
        "phone_number_2",
        "name",
        "address",
        "gender",
        "language_preference",
        "display_status",
      ].forEach((field) => {
        if (req.body[field] !== undefined) {
          updateFields[field] = req.body[field];
        }
      });

      if (profile_picture) {
        updateFields.profile_picture = profile_picture;
      }

      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const { data, error } = await supabase
        .from("landlords")
        .update(updateFields)
        .eq("id", req.user.id)
        .select(
          "phone_number, phone_number_2, address, gender, name, language_preference, profile_picture"
        )
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: "Failed to update profile" });
      }

      res.status(200).json({
        message: "Profile updated successfully",
        landlord: data,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  }
);
// Delete profile picture
router.delete("/profile-picture", authMiddleware, async (req, res) => {
  try {
    const { data: landlord } = await supabase
      .from("landlords")
      .select("profile_picture")
      .eq("id", req.user.id)
      .maybeSingle();

    const oldImageUrl = landlord?.profile_picture;

    if (oldImageUrl && oldImageUrl.includes("res.cloudinary.com")) {
      await deleteOldImage(oldImageUrl);
    }

    const { error } = await supabase
      .from("landlords")
      .update({ profile_picture: null })
      .eq("id", req.user.id);

    if (error) return res.status(500).json({ error: "Failed to remove image" });

    res.status(200).json({ message: "Profile picture removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
// GET /api/landlords/:id
router.get("/:id", authMiddleware, async (req, res) => {
  const landlordId = req.params.id;

  try {
    const { data: landlord, error: landlordError } = await supabase
      .from("landlords")
      .select(
        "id, email, phone_number, phone_number_2, account_created, address, gender, name, language_preference, profile_picture, verification_status"
      )
      .eq("id", landlordId)
      .maybeSingle();

    if (landlordError || !landlord) {
      return res.status(404).json({ error: "Landlord not found" });
    }

    const { data: lodges, error: lodgesError } = await supabase
      .from("lodges")
      .select(
        "id, name, description, address, price, capacity, available_rooms, verification_status, display_status, created_at"
      )
      .eq("landlord_id", landlordId)
      .eq("display_status", true); // Optional: only show visible lodges

    if (lodgesError) {
      return res.status(500).json({ error: "Failed to fetch lodges" });
    }

    const lodgesWithDetails = await Promise.all(
      (lodges || []).map(async (lodge) => {
        const { data: images } = await supabase
          .from("lodge_images")
          .select("image_url")
          .eq("lodge_id", lodge.id);

        const { data: reviews } = await supabase
          .from("lodge_reviews")
          .select(
            "id, rating, review_text, review_date, tenant:tenant_id(name)"
          )
          .eq("lodge_id", lodge.id)
          .order("review_date", { ascending: false });

        return {
          ...lodge,
          images: (images || []).map((img) => img.image_url),
          reviews: reviews || [],
        };
      })
    );

    return res.status(200).json({
      landlord: {
        ...landlord,
        lodges: lodgesWithDetails,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Logout to be handled on the client side

export default router;
