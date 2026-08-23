const ForumPost = require('../../models/Forum');
const PostReport = require('../../models/PostReport');
const PostComment = require('../../models/PostComment');
const CommentReport = require('../../models/CommentReport');
const Notification = require('../../models/Notification');
const cloudinary = require('../../config/cloudinary');

exports.createPost = async (user, data, options = {}) => {
  const { title, content, category, images } = data;
  const author_id = user._id;

  let parsedImages = [];
  if (images) {
    if (typeof images === 'string') {
      try {
        parsedImages = JSON.parse(images);
      } catch (e) {
        parsedImages = [images];
      }
    } else if (Array.isArray(images)) {
      parsedImages = images;
    }
  }

  const uploadPromises = parsedImages.map(async (img) => {
    let base64Data = typeof img === 'string' ? img : (img && img.url ? img.url : '');
    if (base64Data && base64Data.startsWith('data:image')) {
      try {
        const result = await cloudinary.uploader.upload(base64Data, {
          folder: 'sftr_forum_posts'
        });
        return result.secure_url;
      } catch (error) {
        console.error('Cloudinary upload error in forum:', error);
        return null;
      }
    }
    return base64Data; // Return direct URL if already hosted
  });

  const uploadedUrls = (await Promise.all(uploadPromises)).filter(url => url !== null);

  const newPost = new ForumPost({
    author_id,
    title: title || '',
    content: content || '',
    category: category || options.defaultCategory || 'Experience',
    images: uploadedUrls,
    status: options.status || 'pending',
    is_pinned: options.is_pinned || false,
    is_official: options.is_official || false,
  });

  const savedPost = await newPost.save();
  await savedPost.populate('author_id', 'full_name avatar_url role');
  return savedPost;
};

exports.updatePost = async (postId, user, data) => {
  const { title, content, category, images } = data;
  const post = await ForumPost.findById(postId).populate('author_id');

  if (!post) {
    throw new Error('Post not found');
  }

  const isOwner = post.author_id._id.toString() === user._id.toString();
  const isAdminOrManager = user.role === 'Admin' || user.role === 'Manager';
  const isAuthorAdminOrManager = post.author_id.role === 'Admin' || post.author_id.role === 'Manager';

  if (!isOwner) {
    // If not owner, only allow Admin/Manager to edit posts created by Admin/Manager
    if (!isAdminOrManager || !isAuthorAdminOrManager) {
      throw new Error('Unauthorized to edit this post');
    }
  }

  let parsedImages = [];
  if (images) {
    if (typeof images === 'string') {
      try {
        parsedImages = JSON.parse(images);
      } catch (e) {
        parsedImages = [images];
      }
    } else if (Array.isArray(images)) {
      parsedImages = images;
    }
  }

  let uploadedUrls = [];
  if (parsedImages.length > 0) {
    for (const img of parsedImages) {
      if (img.startsWith('data:image')) {
        const result = await cloudinary.uploader.upload(img, { folder: 'forum' });
        uploadedUrls.push(result.secure_url);
      } else {
        uploadedUrls.push(img);
      }
    }
    post.images = uploadedUrls;
  } else if (images !== undefined) {
    post.images = [];
  }

  if (title !== undefined) post.title = title;
  if (content !== undefined) post.content = content;
  if (category !== undefined) post.category = category;

  const savedPost = await post.save();
  await savedPost.populate('author_id', 'full_name avatar_url role');
  return savedPost;
};

exports.deletePost = async (postId, user) => {
  const post = await ForumPost.findById(postId).populate('author_id');

  if (!post) {
    throw new Error('Post not found');
  }

  // Verify ownership or check if Admin/Manager
  const isAuthor = post.author_id._id.toString() === user._id.toString();
  const isAdminOrManager = ['Admin', 'Manager'].includes(user.role);

  if (!isAuthor && !isAdminOrManager) {
    throw new Error('Unauthorized to delete this post');
  }

  await post.deleteOne();
  
  // Also delete associated reports
  await PostReport.deleteMany({ post_id: postId });

  return true;
};

// View all forum posts
exports.getAllPosts = async () => {
  // Fetch all posts and populate author
  const posts = await ForumPost.find({})
    .populate('author_id', 'full_name avatar_url role')
    .sort({ created_at: -1 })
    .lean(); // Use lean() to get plain JS objects

  // Get all post IDs
  const postIds = posts.map(p => p._id);

  // Fetch all reports for these posts
  const reports = await PostReport.find({ post_id: { $in: postIds } })
    .populate('reporter_id', 'full_name')
    .sort({ created_at: -1 })
    .lean();

  // Group reports by post_id
  const reportsByPost = reports.reduce((acc, report) => {
    if (!report.post_id) return acc;
    const pId = report.post_id.toString();
    if (!acc[pId]) acc[pId] = [];
    acc[pId].push(report);
    return acc;
  }, {});

  // Attach reports to posts and count comments
  return Promise.all(posts.map(async (post) => {
    const pId = post._id ? post._id.toString() : null;
    const totalComments = post._id ? await PostComment.countDocuments({ post_id: post._id }) : 0;
    return {
      ...post,
      reports: pId ? (reportsByPost[pId] || []) : [],
      reportCount: pId ? (reportsByPost[pId] || []).length : 0,
      totalComments
    };
  }));
};

exports.getReportedPosts = async () => {
  const reportedPostIds = await PostReport.distinct('post_id');
  
  const posts = await ForumPost.find({ _id: { $in: reportedPostIds } })
    .populate('author_id', 'full_name avatar_url role')
    .sort({ created_at: -1 })
    .lean();

  const reports = await PostReport.find({ post_id: { $in: reportedPostIds } })
    .populate('reporter_id', 'full_name')
    .sort({ created_at: -1 })
    .lean();

  const reportsByPost = reports.reduce((acc, report) => {
    if (!report.post_id) return acc;
    const pId = report.post_id.toString();
    if (!acc[pId]) acc[pId] = [];
    acc[pId].push(report);
    return acc;
  }, {});

  const mappedPosts = await Promise.all(posts.map(async (post) => {
    const pId = post._id.toString();
    const totalComments = await PostComment.countDocuments({ post_id: post._id });
    return {
      ...post,
      reports: reportsByPost[pId] || [],
      reportCount: (reportsByPost[pId] || []).length,
      totalComments
    };
  }));

  mappedPosts.sort((a, b) => {
    const latestA = a.reports.length > 0 ? new Date(a.reports[0].created_at || 0).getTime() : 0;
    const latestB = b.reports.length > 0 ? new Date(b.reports[0].created_at || 0).getTime() : 0;
    return latestB - latestA;
  });

  return mappedPosts;
};

// Moderate Forum Posts Queue
exports.updatePostStatus = async (postId, status) => {
  const post = await ForumPost.findById(postId);
  if (!post) {
    throw new Error('Post not found');
  }
  post.status = status;
  return await post.save();
};

exports.togglePinStatus = async (postId) => {
  const post = await ForumPost.findById(postId);
  if (!post) {
    throw new Error('Post not found');
  }
  post.is_pinned = !post.is_pinned;
  if (post.is_pinned) {
    post.pinned_at = new Date();
  } else {
    post.pinned_at = null;
  }
  return await post.save();
};

exports.deleteViolatingPost = async (postId) => {
  const post = await ForumPost.findById(postId);
  if (!post) {
    throw new Error('Post not found');
  }

  const authorId = post.author_id;

  // Delete all comments
  await PostComment.deleteMany({ post_id: postId });

  // Delete all reports
  await PostReport.deleteMany({ post_id: postId });

  // Delete the post
  await ForumPost.findByIdAndDelete(postId);

  // Send notification to author
  if (authorId) {
    const notification = new Notification({
      recipient_id: authorId,
      title: 'Post Removed',
      body: 'Your post has been deleted due to a violation of community guidelines.',
      type: 'System_Alert'
    });
    await notification.save();
  }

  return postId;
};

// Dismiss Forum Post Reports
exports.dismissReports = async (postId) => {
  const post = await ForumPost.findById(postId);
  if (!post) {
    throw new Error('Post not found');
  }

  // Delete all reports for this post
  await PostReport.deleteMany({ post_id: postId });

  return postId;
};

// View Reported Comments (Legacy, kept for general view)
exports.getAllComments = async () => {
  // Fetch all comments and populate author and post info
  const comments = await PostComment.find({})
    .populate('author_id', 'full_name avatar_url role')
    .populate('post_id', 'title content')
    .sort({ created_at: 1 })
    .lean();

  const commentIds = comments.map(c => c._id);

  // Fetch all reports for these comments
  const reports = await CommentReport.find({ comment_id: { $in: commentIds } })
    .populate('reporter_id', 'full_name')
    .sort({ created_at: -1 })
    .lean();

  // Group reports by comment_id
  const reportsByComment = reports.reduce((acc, report) => {
    if (!report.comment_id) return acc;
    const cId = report.comment_id.toString();
    if (!acc[cId]) acc[cId] = [];
    acc[cId].push(report);
    return acc;
  }, {});

  // Attach reports to comments
  return comments.map((comment) => {
    const cId = comment._id ? comment._id.toString() : null;
    return {
      ...comment,
      reports: cId ? (reportsByComment[cId] || []) : [],
      reportCount: cId ? (reportsByComment[cId] || []).length : 0
    };
  });
};

// View Reported Comments (Dedicated API)
exports.getReportedComments = async () => {
  const reportedCommentIds = await CommentReport.distinct('comment_id');
  
  const comments = await PostComment.find({ _id: { $in: reportedCommentIds } })
    .populate('author_id', 'full_name avatar_url role')
    .populate('post_id', 'title content')
    .lean();

  const reports = await CommentReport.find({ comment_id: { $in: reportedCommentIds } })
    .populate('reporter_id', 'full_name')
    .sort({ created_at: -1 })
    .lean();

  const reportsByComment = reports.reduce((acc, report) => {
    if (!report.comment_id) return acc;
    const cId = report.comment_id.toString();
    if (!acc[cId]) acc[cId] = [];
    acc[cId].push(report);
    return acc;
  }, {});

  const mappedComments = comments.map((comment) => {
    const cId = comment._id.toString();
    return {
      ...comment,
      reports: reportsByComment[cId] || [],
      reportCount: (reportsByComment[cId] || []).length
    };
  });

  // Sort by the most recent report
  mappedComments.sort((a, b) => {
    const latestA = a.reports.length > 0 ? new Date(a.reports[0].created_at || 0).getTime() : 0;
    const latestB = b.reports.length > 0 ? new Date(b.reports[0].created_at || 0).getTime() : 0;
    return latestB - latestA;
  });

  return mappedComments;
};

exports.deleteViolatingComment = async (commentId) => {
  const comment = await PostComment.findById(commentId);
  if (!comment) {
    throw new Error('Comment not found');
  }

  const authorId = comment.author_id;

  // Delete all reports for this comment
  await CommentReport.deleteMany({ comment_id: commentId });

  // Delete the comment itself
  await PostComment.findByIdAndDelete(commentId);

  // Send notification to author
  if (authorId) {
    const notification = new Notification({
      recipient_id: authorId,
      title: 'Comment Removed',
      body: 'Your comment has been deleted due to a violation of community guidelines.',
      type: 'System_Alert'
    });
    await notification.save();
  }

  return commentId;
};

// Dismiss Comment Reports
exports.dismissCommentReports = async (commentId) => {
  const comment = await PostComment.findById(commentId);
  if (!comment) {
    throw new Error('Comment not found');
  }

  // Delete all reports for this comment
  await CommentReport.deleteMany({ comment_id: commentId });

  return commentId;
};
