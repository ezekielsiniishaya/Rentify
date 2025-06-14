import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

// 📦 Storage for landlord images
const landlordStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "rentify/landlords",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 500, height: 500, crop: "limit" }],
  },
});

// 📦 Storage for lodge images
const lodgeStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "rentify/lodges",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 800, height: 600, crop: "limit" }],
  },
});

// ✅ File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const ext = file.originalname.toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only .jpeg, .jpg, .png files are allowed"), false);
  }
};

// ✅ Export middleware
export const landlordUpload = multer({
  storage: landlordStorage,
  fileFilter,
});

export const lodgeUpload = multer({
  storage: lodgeStorage,
  fileFilter,
});

export async function deleteOldImage(imageUrl) {
  if (!imageUrl || !imageUrl.includes("res.cloudinary.com")) return;

  try {
    const segments = imageUrl.split("/");
    const publicIdWithExtension = segments.slice(-1)[0]; // e.g. abc123.png
    const folder = segments.slice(-2)[0]; // e.g. landlords or lodges
    const publicId = `rentify/${folder}/${publicIdWithExtension.split(".")[0]}`;

    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Failed to delete image from Cloudinary:", err);
  }
}

