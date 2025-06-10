import multer from "multer";
import { extname } from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// To be changed to cloudinary before hosting
// __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to ensure upload directories exist
function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ===== Multer config for LANDLORDS =====
const landlordStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = "uploads/landlords/";
    ensureDirExists(dest); // Ensure directory exists
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ===== Multer config for LODGES =====
const lodgeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = "uploads/lodges/";
    ensureDirExists(dest); // Ensure directory exists
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter to allow only jpeg, jpg, png
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const ext = extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only .jpeg, .jpg, .png files are allowed"), false);
  }
};

// Export two different upload middlewares
export const landlordUpload = multer({
  storage: landlordStorage,
  fileFilter,
});

export const lodgeUpload = multer({
  storage: lodgeStorage,
  fileFilter,
});

/**
 * Deletes an old profile picture from the uploads directory.
 * @param {string} imageUrl - The URL of the image to delete.
 * @param {string} type - Either "landlord" or "lodge".
 **/
export function deleteOldImage(imageUrl, type = "landlord") {
  if (!imageUrl) return;

  let folder = "";
  if (type === "landlord") folder = "landlords";
  else if (type === "lodge") folder = "lodges";

  // Check if the imageUrl contains the expected folder path
  if (imageUrl.includes(`/uploads/${folder}/`)) {
    const filename = imageUrl.split(`/uploads/${folder}/`)[1];
    const filepath = path.join(__dirname, "../uploads", folder, filename);

    // Delete the file if it exists
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}
