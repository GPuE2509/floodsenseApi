// Cloudinary utilities
const {
    uploadImage,
    uploadMultipleImages,
    deleteImage,
    deleteMultipleImages,
    getImageInfo,
    getResizedImageUrl,
    getThumbnailUrl,
    getAvatarUrl
} = require('./uploadCloudinary');

// Multer configuration
const {
    uploadSingleImage,
    uploadMultipleImages: uploadMultipleImagesMiddleware,
    uploadMixed,
    upload
} = require('./multerConfig');

// Upload helpers
const {
    handleImageUpload,
    handleMultipleImageUpload,
    validateFile,
    validateMultipleFiles,
    sanitizePublicId,
    getImageVariants,
    cleanupLocalFile
} = require('./uploadHelper');

module.exports = {
    // Cloudinary utilities
    uploadImage,
    uploadMultipleImages,
    deleteImage,
    deleteMultipleImages,
    getImageInfo,
    getResizedImageUrl,
    getThumbnailUrl,
    getAvatarUrl,
    
    // Multer middlewares
    uploadSingleImage,
    uploadMultipleImagesMiddleware,
    uploadMixed,
    upload,
    
    // Upload helpers
    handleImageUpload,
    handleMultipleImageUpload,
    validateFile,
    validateMultipleFiles,
    sanitizePublicId,
    getImageVariants,
    cleanupLocalFile
};
