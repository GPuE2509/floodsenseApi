/**
 * HƯỚNG DẪN SỬ DỤNG CLOUDINARY UPLOAD
 * 
 * 1. CÀI ĐẶT DEPENDENCIES
 * npm install cloudinary multer
 * 
 * 2. TẠO FILE .env
 * CLOUDINARY_CLOUD_NAME=your_cloud_name
 * CLOUDINARY_API_KEY=your_api_key
 * CLOUDINARY_API_SECRET=your_api_secret
 */

// ===== ROUTE EXAMPLE =====

const express = require('express');
const router = express.Router();
const { uploadSingleImage, uploadMultipleImages } = require('../utils/multerConfig');
const { uploadImage, uploadMultipleImages: uploadMulti, deleteImage } = require('../utils/uploadCloudinary');
const { authenticateUser } = require('../middleware');

/**
 * UPLOAD ẢNH ĐƠN
 * 
 * POST /api/upload/single
 * Content-Type: multipart/form-data
 * Body: { image: <file> }
 */
router.post('/upload/single', 
    authenticateUser,
    uploadSingleImage, 
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'Không có file được upload' });
            }

            // Upload từ buffer (multer sử dụng memoryStorage)
            const result = await uploadImage(
                req.file.buffer,
                `smart-flood-traffic/users/${req.user._id}`,
                `avatar-${req.user._id}`
            );

            res.json({
                message: 'Upload thành công',
                data: result
            });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
);

/**
 * UPLOAD NHIỀU ẢNH
 * 
 * POST /api/upload/multiple
 * Content-Type: multipart/form-data
 * Body: { images: [<file1>, <file2>, ...] }
 */
router.post('/upload/multiple',
    authenticateUser,
    uploadMultipleImages,
    async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ message: 'Không có file được upload' });
            }

            // Convert multer files to buffers
            const fileBuffers = req.files.map(file => file.buffer);

            const results = await uploadMulti(
                fileBuffers,
                `smart-flood-traffic/incidents/${req.user._id}`
            );

            res.json({
                message: `Upload ${results.length} ảnh thành công`,
                data: results
            });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
);

/**
 * UPLOAD ẢNH BÀI VIẾT DIỄN ĐÀN
 * 
 * POST /api/forum/posts
 * Body: {
 *   title: "...",
 *   content: "...",
 *   images: [url1, url2, ...]
 * }
 */
router.post('/forum/posts',
    authenticateUser,
    uploadMultipleImages,
    async (req, res) => {
        try {
            let imageUrls = [];

            if (req.files && req.files.length > 0) {
                const fileBuffers = req.files.map(file => file.buffer);
                const results = await uploadMulti(
                    fileBuffers,
                    `smart-flood-traffic/forum/${req.user._id}`
                );
                imageUrls = results.map(r => r.secure_url);
            }

            // Lưu vào database
            const post = {
                author_id: req.user._id,
                title: req.body.title,
                content: req.body.content,
                images: imageUrls.join(',') // Hoặc lưu dưới dạng JSON array
            };

            // Save to database...
            res.json({ message: 'Tạo bài viết thành công', data: post });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
);

/**
 * UPLOAD AVATAR NGƯỜI DÙNG
 * 
 * PUT /api/users/:id/avatar
 */
router.put('/users/:id/avatar',
    authenticateUser,
    uploadSingleImage,
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'Không có file được upload' });
            }

            // Nếu user cũ có avatar, xóa avatar cũ
            if (req.user.avatar_url) {
                const oldPublicId = req.user.avatar_url.split('/').pop().split('.')[0];
                await deleteImage(`smart-flood-traffic/users/${req.user._id}/${oldPublicId}`);
            }

            // Upload avatar mới
            const result = await uploadImage(
                req.file.buffer,
                `smart-flood-traffic/users/${req.user._id}`,
                `avatar-${req.user._id}`
            );

            // Update database
            const user = await User.findByIdAndUpdate(
                req.user._id,
                { avatar_url: result.secure_url },
                { new: true }
            );

            res.json({
                message: 'Cập nhật avatar thành công',
                data: { avatar_url: result.secure_url }
            });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
);

/**
 * UPLOAD BÁNG CÁO SỰ CỐ
 * 
 * POST /api/incident-reports
 */
router.post('/incident-reports',
    authenticateUser,
    uploadMultipleImages,
    async (req, res) => {
        try {
            let imageUrls = [];

            if (req.files && req.files.length > 0) {
                const fileBuffers = req.files.map(file => file.buffer);
                const results = await uploadMulti(
                    fileBuffers,
                    `smart-flood-traffic/reports/${req.user._id}`
                );
                imageUrls = results.map(r => r.secure_url);
            }

            const report = {
                reporter_id: req.user._id,
                title: req.body.title,
                description: req.body.description,
                images: imageUrls.join(','),
                lng: req.body.lng,
                lat: req.body.lat,
                report_type: req.body.report_type
            };

            // Save to database...
            res.json({ message: 'Báo cáo được tạo thành công', data: report });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
);

module.exports = router;

/**
 * ===== CÁC HÀNG KHÁC TRONG uploadCloudinary.js =====
 * 
 * uploadImage(file, folder, publicId)
 *   - Upload ảnh đơn
 *   - Trả về: { url, secure_url, public_id, width, height, size, format }
 * 
 * uploadMultipleImages(files, folder)
 *   - Upload nhiều ảnh
 *   - Trả về: Array of objects
 * 
 * deleteImage(publicId)
 *   - Xóa ảnh từ Cloudinary
 *   - Trả về: boolean
 * 
 * deleteMultipleImages(publicIds)
 *   - Xóa nhiều ảnh
 *   - Trả về: số lượng ảnh đã xóa
 * 
 * getImageInfo(publicId)
 *   - Lấy thông tin ảnh
 *   - Trả về: { url, secure_url, public_id, width, height, size, created_at }
 * 
 * getResizedImageUrl(publicId, width, height, crop)
 *   - Tạo URL ảnh resize
 *   - crop: 'fill', 'scale', 'fit', 'thumb', etc.
 * 
 * getThumbnailUrl(publicId, size)
 *   - Lấy thumbnail (mặc định 150x150)
 * 
 * getAvatarUrl(publicId)
 *   - Lấy URL avatar (200x200)
 * 
 * ===== CẤU HÌNH MỚI TRONG .env =====
 * 
 * # Cloudinary Configuration
 * CLOUDINARY_CLOUD_NAME=your_cloud_name
 * CLOUDINARY_API_KEY=your_api_key
 * CLOUDINARY_API_SECRET=your_api_secret
 */
