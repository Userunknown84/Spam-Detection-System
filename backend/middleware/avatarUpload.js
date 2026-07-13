const multer = require('multer');
const { fileTypeFromBuffer } = require('file-type');

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const fileFilter = async (req, file, cb) => {
  try {
    if (!file || !file.buffer) {
      return cb(new Error('No file uploaded'), false);
    }

    const mimeType = file.mimetype;
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(mimeType)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'), false);
    }

    const detectedType = await fileTypeFromBuffer(file.buffer);
    
    if (!detectedType) {
      return cb(new Error('Unable to detect file type. Please upload a valid image.'), false);
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(detectedType.mime)) {
      return cb(new Error(
        `File content is "${detectedType.mime}", but expected an image (${ALLOWED_AVATAR_MIME_TYPES.join(', ')}).`
      ), false);
    }

    if (detectedType.mime !== mimeType) {
      return cb(new Error(
        `MIME type mismatch: declared "${mimeType}" but detected "${detectedType.mime}"`
      ), false);
    }

    cb(null, true);
  } catch (error) {
    cb(new Error(`File validation failed: ${error.message}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_AVATAR_BYTES },
});

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
    return res.status(400).json({ error: err.message || 'File upload failed.' });
  });
};

const validateFileContent = async (fileBuffer) => {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('File is empty');
  }

  if (fileBuffer.length > MAX_AVATAR_BYTES) {
    throw new Error(`File size exceeds ${MAX_AVATAR_BYTES / (1024 * 1024)}MB limit`);
  }

  const detectedType = await fileTypeFromBuffer(fileBuffer);
  if (!detectedType) {
    throw new Error('Unable to detect file type. Please upload a valid image.');
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.includes(detectedType.mime)) {
    throw new Error(`Invalid image type: ${detectedType.mime}. Allowed: ${ALLOWED_AVATAR_MIME_TYPES.join(', ')}`);
  }

  return detectedType;
};

module.exports = {
  handleAvatarUpload,
  MAX_AVATAR_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
  validateFileContent,
};