const reviewService = require('../../services/workshop/reviewService');
const { uploadImage } = require('../../utils/uploadCloudinary');

exports.getWorkshopReviews = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Workshop ID parameter is required.'
      });
    }

    const reviews = await reviewService.getReviewsByWorkshopId(id);
    return res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error in getWorkshopReviews controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while fetching reviews.'
    });
  }
};

exports.createWorkshopReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, content } = req.body;
    const user = req.user;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Workshop ID is required.'
      });
    }

    // Block Guest role from submitting reviews
    if (!user || user.role === 'Guest') {
      return res.status(403).json({
        success: false,
        message: 'Please log in with a valid account to submit a review.'
      });
    }

    if (rating === undefined || rating === null) {
      return res.status(400).json({
        success: false,
        message: 'Rating score is required.'
      });
    }

    // Process image attachments (from multer files OR base64/url string array in req.body.images)
    let rawImages = [];
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      rawImages = req.files.map(f => f.buffer);
    } else if (req.body.images) {
      if (Array.isArray(req.body.images)) {
        rawImages = req.body.images;
      } else if (typeof req.body.images === 'string') {
        try {
          const parsed = JSON.parse(req.body.images);
          rawImages = Array.isArray(parsed) ? parsed : [req.body.images];
        } catch (e) {
          rawImages = [req.body.images];
        }
      }
    }

    const uploadPromises = rawImages.map(async (item) => {
      if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
        return item;
      } else if (Buffer.isBuffer(item) || (typeof item === 'string' && item.startsWith('data:image'))) {
        try {
          const result = await uploadImage(item, 'sftr_workshop_reviews');
          return result ? (result.secure_url || result.url) : null;
        } catch (err) {
          console.error('Error uploading review image to Cloudinary:', err);
          return null;
        }
      }
      return null;
    });

    const processedImageUrls = (await Promise.all(uploadPromises)).filter(Boolean);

    const review = await reviewService.addReview(user._id, id, rating, content, processedImageUrls);

    // Broadcast real-time update via WebSocket
    const wss = req.app.get('wss');
    if (wss) {
      const payload = JSON.stringify({
        type: 'WORKSHOP_REVIEW_UPDATED',
        workshopId: String(id),
        review
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
      });
    }

    return res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error('Error in createWorkshopReview controller:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Server error while submitting review.'
    });
  }
};

exports.respondToReview = async (req, res) => {
  try {
    const { id, reviewId } = req.params;
    const { content, response, reply, images } = req.body;
    const user = req.user;

    const replyContent = content || response || reply;
    const replyImages = Array.isArray(images) ? images : [];

    if (!id || !reviewId) {
      return res.status(400).json({
        success: false,
        message: 'Workshop ID and Review ID are required.'
      });
    }

    if (!user || user.role === 'Guest') {
      return res.status(403).json({
        success: false,
        message: 'Please log in with a valid account.'
      });
    }

    if (!replyContent || !replyContent.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reply content is required and cannot be empty.'
      });
    }

    const uploadPromises = replyImages.map(async (item) => {
      if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) {
        return item;
      } else if (Buffer.isBuffer(item) || (typeof item === 'string' && item.startsWith('data:image'))) {
        try {
          const result = await uploadImage(item, 'sftr_workshop_reviews');
          return result ? (result.secure_url || result.url) : null;
        } catch (err) {
          console.error('Error uploading response image to Cloudinary:', err);
          return null;
        }
      }
      return null;
    });

    const processedReplyImages = (await Promise.all(uploadPromises)).filter(Boolean);

    const updatedReview = await reviewService.respondToReview(user._id, id, reviewId, replyContent, processedReplyImages);

    // Broadcast real-time update via WebSocket
    const wss = req.app.get('wss');
    if (wss) {
      const payload = JSON.stringify({
        type: 'WORKSHOP_REVIEW_UPDATED',
        workshopId: String(id),
        review: updatedReview
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedReview
    });
  } catch (error) {
    console.error('Error in respondToReview controller:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Server error while responding to review.'
    });
  }
};

exports.deleteOwnerResponse = async (req, res) => {
  try {
    const { id, reviewId } = req.params;
    const user = req.user;

    if (!id || !reviewId) {
      return res.status(400).json({
        success: false,
        message: 'Workshop ID and Review ID are required.'
      });
    }

    if (!user || user.role === 'Guest') {
      return res.status(403).json({
        success: false,
        message: 'Please log in with a valid account.'
      });
    }

    const updatedReview = await reviewService.deleteOwnerResponse(user._id, id, reviewId);

    // Broadcast real-time update via WebSocket
    const wss = req.app.get('wss');
    if (wss) {
      const payload = JSON.stringify({
        type: 'WORKSHOP_REVIEW_UPDATED',
        workshopId: String(id),
        review: updatedReview
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedReview
    });
  } catch (error) {
    console.error('Error in deleteOwnerResponse controller:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Server error while deleting response.'
    });
  }
};

exports.deleteWorkshopReview = async (req, res) => {
  try {
    const { id, reviewId } = req.params;
    const user = req.user;

    if (!id || !reviewId) {
      return res.status(400).json({
        success: false,
        message: 'Workshop ID and Review ID are required.'
      });
    }

    if (!user) {
      return res.status(403).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    const result = await reviewService.deleteReview(user._id, id, reviewId, user.role);

    // Broadcast real-time update via WebSocket
    const wss = req.app.get('wss');
    if (wss) {
      const payload = JSON.stringify({
        type: 'WORKSHOP_REVIEW_UPDATED',
        workshopId: String(id),
        deletedReviewId: reviewId
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(payload);
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Review deleted successfully.',
      data: result
    });
  } catch (error) {
    console.error('Error in deleteWorkshopReview controller:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Server error while deleting review.'
    });
  }
};

