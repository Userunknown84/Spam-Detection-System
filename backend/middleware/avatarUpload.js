// Avatar upload hardening (issue #447): validate file size and MIME type
// before the upload is fully buffered into memory, and translate multer's
// rejections into clear 400 responses instead of leaking 500s.
const multer = require('multer');

// 5MB cap. multer enforces this against the stream, so oversized uploads are
// rejected before the whole file is buffered into RAM.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Only real raster image types the avatar pipeline (sharp) can process.
const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // A plain Error (not a MulterError) so the handler below surfaces this
    // specific message rather than a generic multer code.
    cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_AVATAR_BYTES },
});

// Wraps `upload.single('avatar')` so multer/filter errors become 400s with a
// clear message instead of propagating to the global handler as a 500.
const handleAvatarUpload = (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (!err) {
      return next();
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const maxMb = MAX_AVATAR_BYTES / (1024 * 1024);
        return res
          .status(400)
          .json({ error: `File too large. Maximum size is ${maxMb}MB.` });
      }
      return res.status(400).json({ error: err.message });
    }
    // fileFilter rejection (invalid type) or any other upload error.
    return res.status(400).json({ error: err.message || 'File upload failed.' });
  });
};

module.exports = {
  handleAvatarUpload,
  MAX_AVATAR_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
};
