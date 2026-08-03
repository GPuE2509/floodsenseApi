const multer = require('multer');
const path = require('path');

// Configure storage (temporary storage before uploading to Cloudinary)
const storage = multer.memoryStorage(); // Save to RAM, no temporary file needed

// Filter file
const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files accepted (JPEG, PNG, GIF, WebP)'), false);
    }
};

// Multer instance
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

/**
 * Single image upload middleware
 * Field name: 'image'
 */
const uploadSingleImage = upload.single('image');

/**
 * Multiple images upload middleware
 * Field name: 'images'
 * Max files: 10
 */
const uploadMultipleImages = upload.array('images', 10);

/**
 * Image upload middleware with different fields
 * Allows:
 * - 1 avatar image (field: 'avatar')
 * - 5 post images (field: 'post_images')
 */
const uploadMixed = upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'post_images', maxCount: 5 }
]);

module.exports = {
    uploadSingleImage,
    uploadMultipleImages,
    uploadMixed,
    upload
};
