import multer from "multer";
import { diskStorage } from "multer";
import { extname } from "path";
import { v4 as uuidv4 } from "uuid";

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
