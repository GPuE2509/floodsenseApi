const mongoose = require('mongoose');
const WorkshopReview = require('../../models/WorkshopReview');
const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');

exports.getReviewsByWorkshopId = async (workshopId) => {
  try {
    const reviews = await WorkshopReview.find({ workshop_id: workshopId })
      .populate('user_id', 'full_name avatar_url')
      .populate('replies.user_id', 'full_name avatar_url')
      .sort({ created_at: -1 })
      .lean();
      
    // Format response to be client-friendly
    return reviews.map(r => ({
      _id: r._id,
      workshop_id: r.workshop_id,
      rating: r.rating,
      content: r.content,
      images: r.images || [],
      owner_response: r.owner_response ? {
        content: r.owner_response.content,
        images: r.owner_response.images || [],
        created_at: r.owner_response.created_at,
        updated_at: r.owner_response.updated_at
      } : (Array.isArray(r.replies) && r.replies.length > 0 ? {
        content: r.replies[r.replies.length - 1].content,
        images: r.replies[r.replies.length - 1].images || [],
        created_at: r.replies[r.replies.length - 1].created_at,
        updated_at: r.replies[r.replies.length - 1].updated_at
      } : null),
      replies: Array.isArray(r.replies) ? r.replies.map(rep => ({
        _id: rep._id,
        content: rep.content,
        images: rep.images || [],
        created_at: rep.created_at,
        updated_at: rep.updated_at,
        user: rep.user_id ? {
          _id: rep.user_id._id || rep.user_id,
          full_name: rep.user_id.full_name || 'Workshop Owner',
          avatar_url: rep.user_id.avatar_url || ''
        } : {
          full_name: 'Workshop Owner',
          avatar_url: ''
        }
      })) : [],
      created_at: r.created_at,
      updated_at: r.updated_at,
      user: r.user_id ? {
        _id: r.user_id._id,
        full_name: r.user_id.full_name,
        avatar_url: r.user_id.avatar_url
      } : {
        full_name: 'Anonymous',
        avatar_url: ''
      }
    }));
  } catch (error) {
    console.error('Error in reviewService.getReviewsByWorkshopId:', error);
    throw new Error('Failed to fetch reviews.');
  }
};

exports.addReview = async (userId, workshopId, rating, content, images = []) => {
  try {
    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      const err = new Error('Rating score must be an integer between 1 and 5.');
      err.status = 400;
      throw err;
    }

    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      const error = new Error('Workshop not found.');
      error.status = 404;
      throw error;
    }

    const ownerLink = await WorkshopStaff.findOne({ workshop_id: workshopId, is_owner: true }).lean();
    if (ownerLink && String(ownerLink.user_id) === String(userId)) {
      const error = new Error('You cannot rate your own workshop.');
      error.status = 403;
      throw error;
    }

    const review = await WorkshopReview.findOneAndUpdate(
      { workshop_id: workshopId, user_id: userId },
      { 
        $set: { 
          rating: parsedRating, 
          content: content ? content.trim() : '', 
          images: Array.isArray(images) ? images : [],
          updated_at: new Date() 
        } 
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const stats = await WorkshopReview.aggregate([
      { $match: { workshop_id: new mongoose.Types.ObjectId(workshopId) } },
      {
        $group: {
          _id: '$workshop_id',
          count: { $sum: 1 },
          average: { $avg: '$rating' }
        }
      }
    ]);

    const count = stats.length > 0 ? stats[0].count : 0;
    const average = stats.length > 0 ? parseFloat(stats[0].average.toFixed(1)) : 0;

    workshop.rating_average = average;
    workshop.rating_count = count;
    await workshop.save();

    const populated = await WorkshopReview.findById(review._id)
      .populate('user_id', 'full_name avatar_url')
      .populate('replies.user_id', 'full_name avatar_url')
      .lean();

    return {
      _id: populated._id,
      workshop_id: populated.workshop_id,
      rating: populated.rating,
      content: populated.content,
      images: populated.images || [],
      owner_response: populated.owner_response ? {
        content: populated.owner_response.content,
        images: populated.owner_response.images || [],
        created_at: populated.owner_response.created_at,
        updated_at: populated.owner_response.updated_at
      } : (Array.isArray(populated.replies) && populated.replies.length > 0 ? {
        content: populated.replies[populated.replies.length - 1].content,
        images: populated.replies[populated.replies.length - 1].images || [],
        created_at: populated.replies[populated.replies.length - 1].created_at,
        updated_at: populated.replies[populated.replies.length - 1].updated_at
      } : null),
      replies: Array.isArray(populated.replies) ? populated.replies.map(rep => ({
        _id: rep._id,
        content: rep.content,
        images: rep.images || [],
        created_at: rep.created_at,
        updated_at: rep.updated_at,
        user: rep.user_id ? {
          _id: rep.user_id._id || rep.user_id,
          full_name: rep.user_id.full_name || 'Workshop Owner',
          avatar_url: rep.user_id.avatar_url || ''
        } : {
          full_name: 'Workshop Owner',
          avatar_url: ''
        }
      })) : [],
      created_at: populated.created_at,
      updated_at: populated.updated_at,
      user: populated.user_id ? {
        _id: populated.user_id._id,
        full_name: populated.user_id.full_name,
        avatar_url: populated.user_id.avatar_url
      } : {
        full_name: 'Anonymous',
        avatar_url: ''
      }
    };
  } catch (error) {
    console.error('Error in reviewService.addReview:', error);
    throw error;
  }
};

exports.respondToReview = async (userId, workshopId, reviewId, content, images = []) => {
  try {
    if (!content || !content.trim()) {
      const err = new Error('Reply content is required and cannot be empty.');
      err.status = 400;
      throw err;
    }

    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      const error = new Error('Workshop not found.');
      error.status = 404;
      throw error;
    }

    const staffLink = await WorkshopStaff.findOne({ workshop_id: workshopId, user_id: userId }).lean();
    const isOwner = (workshop.owner_id && String(workshop.owner_id) === String(userId)) || (staffLink && staffLink.is_owner);
    if (!isOwner) {
      const error = new Error('Only the repair workshop owner can respond to service reviews.');
      error.status = 403;
      throw error;
    }

    const review = await WorkshopReview.findOne({ _id: reviewId, workshop_id: workshopId });
    if (!review) {
      const error = new Error('Review not found.');
      error.status = 404;
      throw error;
    }

    const trimmedContent = content.trim();
    const now = new Date();
    const responseImages = Array.isArray(images) ? images : [];

    review.owner_response = {
      content: trimmedContent,
      images: responseImages,
      created_at: review.owner_response?.created_at || now,
      updated_at: now
    };

    if (!Array.isArray(review.replies)) {
      review.replies = [];
    }

    const existingIdx = review.replies.findIndex(r => String(r.user_id) === String(userId));
    if (existingIdx >= 0) {
      review.replies[existingIdx].content = trimmedContent;
      review.replies[existingIdx].images = responseImages;
      review.replies[existingIdx].updated_at = now;
    } else {
      review.replies.push({
        user_id: userId,
        content: trimmedContent,
        images: responseImages,
        created_at: now,
        updated_at: now
      });
    }

    await review.save();

    const populated = await WorkshopReview.findById(review._id)
      .populate('user_id', 'full_name avatar_url')
      .populate('replies.user_id', 'full_name avatar_url')
      .lean();

    return {
      _id: populated._id,
      workshop_id: populated.workshop_id,
      rating: populated.rating,
      content: populated.content,
      images: populated.images || [],
      owner_response: populated.owner_response ? {
        content: populated.owner_response.content,
        images: populated.owner_response.images || [],
        created_at: populated.owner_response.created_at,
        updated_at: populated.owner_response.updated_at
      } : (Array.isArray(populated.replies) && populated.replies.length > 0 ? {
        content: populated.replies[populated.replies.length - 1].content,
        images: populated.replies[populated.replies.length - 1].images || [],
        created_at: populated.replies[populated.replies.length - 1].created_at,
        updated_at: populated.replies[populated.replies.length - 1].updated_at
      } : null),
      replies: Array.isArray(populated.replies) ? populated.replies.map(rep => ({
        _id: rep._id,
        content: rep.content,
        images: rep.images || [],
        created_at: rep.created_at,
        updated_at: rep.updated_at,
        user: rep.user_id ? {
          _id: rep.user_id._id || rep.user_id,
          full_name: rep.user_id.full_name || 'Workshop Owner',
          avatar_url: rep.user_id.avatar_url || ''
        } : {
          full_name: 'Workshop Owner',
          avatar_url: ''
        }
      })) : [],
      created_at: populated.created_at,
      updated_at: populated.updated_at,
      user: populated.user_id ? {
        _id: populated.user_id._id,
        full_name: populated.user_id.full_name,
        avatar_url: populated.user_id.avatar_url
      } : {
        full_name: 'Anonymous',
        avatar_url: ''
      }
    };
  } catch (error) {
    console.error('Error in reviewService.respondToReview:', error);
    throw error;
  }
};

exports.deleteOwnerResponse = async (userId, workshopId, reviewId) => {
  try {
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      const error = new Error('Workshop not found.');
      error.status = 404;
      throw error;
    }

    const staffLink = await WorkshopStaff.findOne({ workshop_id: workshopId, user_id: userId }).lean();
    const isOwner = (workshop.owner_id && String(workshop.owner_id) === String(userId)) || (staffLink && staffLink.is_owner);
    if (!isOwner) {
      const error = new Error('Only the repair workshop owner can delete their response.');
      error.status = 403;
      throw error;
    }

    const review = await WorkshopReview.findOne({ _id: reviewId, workshop_id: workshopId });
    if (!review) {
      const error = new Error('Review not found.');
      error.status = 404;
      throw error;
    }

    // Clear owner_response
    review.owner_response = undefined;

    // Remove owner's reply from replies array
    if (Array.isArray(review.replies)) {
      review.replies = review.replies.filter(r => String(r.user_id) !== String(userId));
    }

    await review.save();

    const populated = await WorkshopReview.findById(review._id)
      .populate('user_id', 'full_name avatar_url')
      .populate('replies.user_id', 'full_name avatar_url')
      .lean();

    return {
      _id: populated._id,
      workshop_id: populated.workshop_id,
      rating: populated.rating,
      content: populated.content,
      images: populated.images || [],
      owner_response: null,
      replies: [],
      created_at: populated.created_at,
      updated_at: populated.updated_at,
      user: populated.user_id ? {
        _id: populated.user_id._id,
        full_name: populated.user_id.full_name,
        avatar_url: populated.user_id.avatar_url
      } : { full_name: 'Anonymous', avatar_url: '' }
    };
  } catch (error) {
    console.error('Error in reviewService.deleteOwnerResponse:', error);
    throw error;
  }
};

exports.deleteReview = async (userId, workshopId, reviewId, userRole = '') => {
  try {
    const review = await WorkshopReview.findOne({ _id: reviewId, workshop_id: workshopId });
    if (!review) {
      const error = new Error('Review not found.');
      error.status = 404;
      throw error;
    }

    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      const error = new Error('Workshop not found.');
      error.status = 404;
      throw error;
    }

    const isAuthor = String(review.user_id) === String(userId);
    const isAdminOrManager = userRole === 'Admin' || userRole === 'Manager';

    if (!isAuthor && !isAdminOrManager) {
      const error = new Error('Only the review author can delete their comment.');
      error.status = 403;
      throw error;
    }

    await WorkshopReview.deleteOne({ _id: reviewId });

    const stats = await WorkshopReview.aggregate([
      { $match: { workshop_id: new mongoose.Types.ObjectId(workshopId) } },
      {
        $group: {
          _id: '$workshop_id',
          count: { $sum: 1 },
          average: { $avg: '$rating' }
        }
      }
    ]);

    const count = stats.length > 0 ? stats[0].count : 0;
    const average = stats.length > 0 ? parseFloat(stats[0].average.toFixed(1)) : 0;

    workshop.rating_average = average;
    workshop.rating_count = count;
    await workshop.save();

    return { success: true, id: reviewId, newCount: count, newAverage: average };
  } catch (error) {
    console.error('Error in reviewService.deleteReview:', error);
    throw error;
  }
};
