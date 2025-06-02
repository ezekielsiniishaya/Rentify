import multer from "multer";
import { diskStorage } from "multer";
import { extname } from "path";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";                                  import path from "path";
import { fileURLToPath } from "url";
// ===== Multer config for LANDLORDS =====
const landlordStorage = diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/landlords/"); // Saves to `uploads/landlords/`
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ===== Multer config for LODGES =====
const lodgeStorage = diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/lodges/"); // Saves to `uploads/lodges/`
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter (shared by both)
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const ext = extname(file.originalname).toLowerCase();
  cb(null, allowedTypes.test(ext));
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

// __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Deletes an old profile picture from the uploads directory.
 * @param {string} imageUrl - Full URL of the old image (e.g., http://localhost:3000/uploads/landlords/abc.jpg)
 */
export function deleteOldImage(imageUrl) {
  if (imageUrl && imageUrl.includes("/uploads/landlords/")) {
    const filename = imageUrl.split("/uploads/landlords/")[1];
    const filepath = path.join(__dirname, "../uploads/landlords", filename);

    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath); // Or use fs.promises.unlink(filepath)
    }
  }
}
