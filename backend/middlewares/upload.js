import multer, { diskStorage } from "multer";
import { extname } from "path";
import { v4 as uuidv4 } from "uuid";

// Configure local storage
const storage = diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/landlords");
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const ext = extname(file.originalname).toLowerCase();
  cb(null, allowedTypes.test(ext));
};

const upload = multer({ storage, fileFilter });

export default upload;
