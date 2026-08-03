const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

/**
 * Upload single image to Cloudinary
 * @param {string|Buffer} file - File path or Buffer
 * @param {string} folder - Folder on Cloudinary (default: 'smart-flood-traffic')
 * @param {string} publicId - File name on Cloudinary (optional)
 * @returns {Promise<Object>} - Object containing url, public_id, secure_url
 */
const uploadImage = async (file, folder = 'smart-flood-traffic', publicId = null) => {
    try {
        const uploadOptions = {
            folder: folder,
            resource_type: 'auto',
            quality: 'auto',
            fetch_format: 'auto',
            width: 1400,
            crop: 'limit'
        };

        if (publicId) {
            uploadOptions.public_id = publicId;
        }

        let result;

        // If file is Buffer (from multer)
        if (Buffer.isBuffer(file)) {
            result = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                });
                stream.end(file);
            });
        }
        // If file is path or base64 string
        else if (typeof file === 'string') {
            result = await cloudinary.uploader.upload(file, uploadOptions);
            // Delete temporary file if uploaded from server (only runs with valid file path)
            if (file.length < 260 && !file.startsWith('data:') && fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } else {
            throw new Error('File must be a Buffer or string path');
        }

        return {
            url: result.url,
            secure_url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            size: result.bytes,
            format: result.format
        };
    } catch (err) {
        throw new Error(`Image upload error: ${err.message}`);
    }
};

/**
 * Upload multiple images to Cloudinary
 * @param {Array<Buffer>} files - Array of Buffers or paths
 * @param {string} folder - Folder on Cloudinary
 * @returns {Promise<Array>} - Array containing image infos
 */
const uploadMultipleImages = async (files, folder = 'smart-flood-traffic') => {
    try {
        const uploadPromises = files.map((file, index) => {
            const publicId = `image-${Date.now()}-${index}`;
            return uploadImage(file, folder, publicId);
        });

        const results = await Promise.all(uploadPromises);
        return results;
    } catch (err) {
        throw new Error(`Multiple images upload error: ${err.message}`);
    }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Public ID of image on Cloudinary
 * @returns {Promise<boolean>} - True if successfully deleted
 */
const deleteImage = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return result.result === 'ok';
    } catch (err) {
        throw new Error(`Image deletion error: ${err.message}`);
    }
};

/**
 * Delete multiple images from Cloudinary
 * @param {Array<string>} publicIds - Array of public IDs
 * @returns {Promise<number>} - Number of images deleted
 */
const deleteMultipleImages = async (publicIds) => {
    try {
        const deletePromises = publicIds.map(publicId => deleteImage(publicId));
        await Promise.all(deletePromises);
        return publicIds.length;
    } catch (err) {
        throw new Error(`Multiple images deletion error: ${err.message}`);
    }
};

/**
 * Get image info from Cloudinary
 * @param {string} publicId - Public ID of image
 * @returns {Promise<Object>} - Image info
 */
const getImageInfo = async (publicId) => {
    try {
        const result = await cloudinary.api.resource(publicId);
        return {
            url: result.url,
            secure_url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            size: result.bytes,
            created_at: result.created_at
        };
    } catch (err) {
        throw new Error(`Image info fetch error: ${err.message}`);
    }
};

/**
 * Create image URL with custom size
 * @param {string} publicId - Public ID of image
 * @param {number} width - Width (px)
 * @param {number} height - Height (px)
 * @param {string} crop - Crop method (fill, scale, fit, etc.)
 * @returns {string} - Resized image URL
 */
const getResizedImageUrl = (publicId, width = 300, height = 300, crop = 'fill') => {
    try {
        const url = cloudinary.url(publicId, {
            width: width,
            height: height,
            crop: crop,
            quality: 'auto',
            fetch_format: 'auto'
        });
        return url;
    } catch (err) {
        throw new Error(`Image URL creation error: ${err.message}`);
    }
};

/**
 * Get image thumbnail
 * @param {string} publicId - Public ID of image
 * @param {number} size - Size (default: 150)
 * @returns {string} - URL thumbnail
 */
const getThumbnailUrl = (publicId, size = 150) => {
    return getResizedImageUrl(publicId, size, size, 'thumb');
};

/**
 * Create avatar image URL
 * @param {string} publicId - Public ID of image
 * @returns {string} - URL avatar (200x200)
 */
const getAvatarUrl = (publicId) => {
    return getResizedImageUrl(publicId, 200, 200, 'fill');
};

module.exports = {
    uploadImage,
    uploadMultipleImages,
    deleteImage,
    deleteMultipleImages,
    getImageInfo,
    getResizedImageUrl,
    getThumbnailUrl,
    getAvatarUrl
};
