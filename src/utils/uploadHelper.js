const { uploadImage, deleteImage } = require('./uploadCloudinary');
const fs = require('fs');
const path = require('path');

/**
 * Handle image upload with error handling
 * @param {Buffer|string} file - File buffer or path
 * @param {string} folder - Cloudinary folder
 * @param {string} userId - User ID
 * @param {string} type - Upload type (avatar, post, report, etc.)
 * @returns {Promise<Object>}
 */
const handleImageUpload = async (file, folder, userId, type = 'general') => {
    try {
        const publicId = `${type}-${userId}-${Date.now()}`;
        const result = await uploadImage(file, folder, publicId);
        
        return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            metadata: {
                width: result.width,
                height: result.height,
                size: result.size,
                format: result.format
            }
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
};

/**
 * Handle multiple image uploads
 * @param {Array<Buffer>} files - Array of buffers
 * @param {string} folder - Cloudinary folder
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
const handleMultipleImageUpload = async (files, folder, userId) => {
    const results = {
        success: [],
        failed: [],
        count: files.length
    };

    for (let i = 0; i < files.length; i++) {
        const result = await handleImageUpload(files[i], folder, userId, `image-${i}`);
        
        if (result.success) {
            results.success.push(result);
        } else {
            results.failed.push({
                index: i,
                error: result.error
            });
        }
    }

    return results;
};

/**
 * Validate file before upload
 * @param {File} file - Multer file object
 * @returns {Object}
 */
const validateFile = (file) => {
    const errors = [];

    if (!file) {
        errors.push('No file selected');
        return { valid: false, errors };
    }

    // Check size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        errors.push(`File too large. Maximum 10MB, your file is ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }

    // Check MIME type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
        errors.push('Unsupported file format. Only accepted: JPEG, PNG, GIF, WebP');
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Validate multiple files
 * @param {Array<File>} files - Array of files
 * @param {number} maxFiles - Maximum number of files
 * @returns {Object}
 */
const validateMultipleFiles = (files, maxFiles = 10) => {
    const errors = [];

    if (!files || files.length === 0) {
        errors.push('No file selected');
        return { valid: false, errors };
    }

    if (files.length > maxFiles) {
        errors.push(`Can only upload a maximum of ${maxFiles} files, you selected ${files.length}`);
    }

    // Validate each file
    for (let i = 0; i < files.length; i++) {
        const fileErrors = validateFile(files[i]).errors;
        if (fileErrors.length > 0) {
            errors.push(`File ${i + 1} (${files[i].originalname}): ${fileErrors.join(', ')}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Sanitize public ID (remove invalid characters)
 * @param {string} str - String to sanitize
 * @returns {string}
 */
const sanitizePublicId = (str) => {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/--+/g, '-')
        .substring(0, 63); // Cloudinary max public_id length is 63
};

/**
 * Create different image versions
 * @param {string} public_id - Public ID on Cloudinary
 * @returns {Object}
 */
const getImageVariants = (public_id) => {
    const cloudinary = require('../config/cloudinary');
    
    return {
        original: cloudinary.url(public_id, { quality: 'auto', fetch_format: 'auto' }),
        thumbnail: cloudinary.url(public_id, { width: 150, height: 150, crop: 'thumb', quality: 'auto' }),
        small: cloudinary.url(public_id, { width: 300, height: 300, crop: 'limit', quality: 'auto' }),
        medium: cloudinary.url(public_id, { width: 600, height: 600, crop: 'limit', quality: 'auto' }),
        large: cloudinary.url(public_id, { width: 1000, height: 1000, crop: 'limit', quality: 'auto' }),
        avatar: cloudinary.url(public_id, { width: 200, height: 200, crop: 'fill', quality: 'auto' })
    };
};

/**
 * Cleanup - Delete temporary file on server
 * @param {string} filePath - File path
 */
const cleanupLocalFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error('Error deleting temporary file:', err.message);
    }
};

module.exports = {
    handleImageUpload,
    handleMultipleImageUpload,
    validateFile,
    validateMultipleFiles,
    sanitizePublicId,
    getImageVariants,
    cleanupLocalFile
};
