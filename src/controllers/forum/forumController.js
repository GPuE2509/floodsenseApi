const ForumPost = require('../../models/Forum');
const User = require('../../models/User');
const PostComment = require('../../models/PostComment');
const CommentReport = require('../../models/CommentReport');
const PostReport = require('../../models/PostReport');
const Notification = require('../../models/Notification');
const forumService = require('../../services/forum/forumService');
const wsHelper = require('../../utils/wsHelper');
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

// Create a new forum post (defaults to status: 'pending')
exports.createPost = async (req, res) => {
  try {
    const savedPost = await forumService.createPost(req.user, req.body, {
      defaultCategory: 'Experience',
      status: 'pending'
    });
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(201).json({ success: true, data: savedPost });
  } catch (error) {
    console.error('Error creating forum post:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Create an official pinned post (Admin/Manager only, defaults to status: 'approved', is_pinned: true)
exports.createOfficialPinnedPost = async (req, res) => {
  try {
    const savedPost = await forumService.createPost(req.user, req.body, {
      defaultCategory: 'Announcement',
      status: 'approved',
      is_pinned: true
    });
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(201).json({ success: true, data: savedPost });
  } catch (error) {
    console.error('Error creating official pinned post:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Get forum posts (approved posts for public, or filtering by author/status)
exports.getPosts = async (req, res) => {
  try {
    const { my_posts, status, category, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const filter = {};
    
    if (my_posts === 'true') {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required to view your posts.' });
      }
      filter.author_id = req.user._id;
    } else {
      // Default to showing only approved posts
      filter.status = status || 'approved';
    }

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      
      // 1. Find users whose full_name matches searchRegex
      const users = await User.find({ full_name: searchRegex }).select('_id');
      const userIds = users.map(u => u._id);
      
      // 2. Filter posts by content OR matching userIds
      filter.$or = [
        { content: searchRegex },
        { author_id: { $in: userIds } }
      ];
    }

    // Get total matching documents for pagination
    const total = await ForumPost.countDocuments(filter);

    const posts = await ForumPost.find(filter)
      .populate('author_id', 'full_name avatar_url role')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    let userCommentReports = [];
    let userPostReports = [];
    if (req.user) {
      userCommentReports = await CommentReport.find({ reporter_id: req.user._id });
      userPostReports = await PostReport.find({ reporter_id: req.user._id });
    }

    const reportMap = {};
    userCommentReports.forEach(r => {
      reportMap[r.comment_id.toString()] = { reason: r.reason, details: r.details };
    });

    const postReportMap = {};
    userPostReports.forEach(r => {
      postReportMap[r.post_id.toString()] = { reason: r.reason, details: r.details };
    });

    const postsWithComments = await Promise.all(posts.map(async (post) => {
      const comments = await PostComment.find({ post_id: post._id, parent_id: null })
        .populate('author_id', 'full_name avatar_url role')
        .sort({ created_at: 1 });

      const commentsWithReplies = await Promise.all(comments.map(async (comment) => {
        const replies = await PostComment.find({ parent_id: comment._id })
          .populate('author_id', 'full_name avatar_url role')
          .sort({ created_at: 1 });
        
        const mappedReplies = replies.map(r => {
          const report = reportMap[r._id.toString()];
          return {
            ...r.toObject(),
            reportedByMe: !!report,
            myReportReason: report?.reason,
            myReportDetails: report?.details
          };
        });

        const cReport = reportMap[comment._id.toString()];
        return {
          ...comment.toObject(),
          replies: mappedReplies,
          reportedByMe: !!cReport,
          myReportReason: cReport?.reason,
          myReportDetails: cReport?.details
        };
      }));

      const totalComments = await PostComment.countDocuments({ post_id: post._id });
      const pReport = postReportMap[post._id.toString()];

      return {
        ...post.toObject(),
        comments: commentsWithReplies,
        totalComments,
        reportedByMe: !!pReport,
        myReportReason: pReport?.reason,
        myReportDetails: pReport?.details
      };
    }));

    res.status(200).json({
      success: true,
      data: postsWithComments,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching forum posts:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// View all forum posts
exports.getAllPosts = async (req, res) => {
  try {
    const posts = await forumService.getAllPosts();
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    console.error('Error fetching all posts:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// View Reported Forum Posts (Dedicated API)
exports.getReportedPosts = async (req, res) => {
  try {
    const posts = await forumService.getReportedPosts();
    res.status(200).json({ success: true, data: posts });
  } catch (error) {
    console.error('Error fetching reported posts:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Moderate Forum Posts Queue
// Approve a pending post
exports.approvePost = async (req, res) => {
  try {
    const updatedPost = await forumService.updatePostStatus(req.params.id, 'approved');
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });

    // Notify the post author that their post has been approved
    try {
      const postAuthorId = updatedPost.author_id?._id || updatedPost.author_id;
      if (postAuthorId) {
        await Notification.create({
          recipient_id: postAuthorId,
          title: 'Post Approved',
          body: `Your post "${updatedPost.title || 'untitled'}" has been approved by the moderator and is now visible on the forum.`,
          type: 'Post_Approved',
          reference_id: updatedPost._id,
          reference_type: 'forum_posts',
          metadata: {
            web_url: `/forum?postId=${updatedPost._id}`,
            app_screen: 'forum'
          }
        });
      }
    } catch (notifErr) {
      console.error('Failed to send post approved notification:', notifErr);
    }

    res.status(200).json({ success: true, data: updatedPost });
  } catch (error) {
    console.error('Error approving post:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Reject a pending post
exports.rejectPost = async (req, res) => {
  try {
    const updatedPost = await forumService.updatePostStatus(req.params.id, 'rejected');
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });

    // Notify the post author that their post has been rejected
    try {
      const postAuthorId = updatedPost.author_id?._id || updatedPost.author_id;
      if (postAuthorId) {
        await Notification.create({
          recipient_id: postAuthorId,
          title: 'Post Rejected',
          body: `Your post "${updatedPost.title || 'untitled'}" has been rejected by the moderator and will not be published.`,
          type: 'Post_Rejected',
          reference_id: updatedPost._id,
          reference_type: 'forum_posts',
          metadata: {
            app_screen: 'forum'
          }
        });
      }
    } catch (notifErr) {
      console.error('Failed to send post rejected notification:', notifErr);
    }

    res.status(200).json({ success: true, data: updatedPost });
  } catch (error) {
    console.error('Error rejecting post:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Toggle pin status of a post
exports.togglePinPost = async (req, res) => {
  try {
    const post = await forumService.togglePinStatus(req.params.id);
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, data: post });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a violating post (Admin/Manager only)
exports.deleteViolatingPost = async (req, res) => {
  try {
    const deletedPostId = await forumService.deleteViolatingPost(req.params.id);
    
    // Log DELETE_POST action
    if (req.user) {
      try {
        const SystemLog = require('../../models/SystemLog');
        await SystemLog.create({
          operator_id: req.user._id,
          action: 'DELETE_POST',
          target_id: deletedPostId,
          reason: req.body.reason || `Deleted violating post (ID: ${deletedPostId})`
        });
      } catch (logErr) {
        console.error('Failed to create system log for violating post deletion:', logErr);
      }
    }
    
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, message: 'Violating post deleted successfully', data: { id: deletedPostId } });
  } catch (error) {
    console.error('Error deleting violating post:', error);
    if (error.message === 'Post not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Dismiss Forum Post Reports
exports.dismissReports = async (req, res) => {
  try {
    const postId = await forumService.dismissReports(req.params.id);
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, message: 'Reports dismissed successfully', data: { id: postId } });
  } catch (error) {
    console.error('Error dismissing reports:', error);
    if (error.message === 'Post not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update/edit a forum post (resets status to 'pending')
exports.updatePost = async (req, res) => {
  try {
    const savedPost = await forumService.updatePost(req.params.id, req.user, req.body);
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.json({ success: true, post: savedPost });
  } catch (error) {
    if (error.message === 'Post not found') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    if (error.message === 'Unauthorized to edit this post') {
      return res.status(403).json({ success: false, message: 'Unauthorized to edit this post' });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a forum post
exports.deletePost = async (req, res) => {
  try {
    await forumService.deletePost(req.params.id, req.user);
    
    // Log DELETE_POST action
    if (req.user) {
      try {
        const SystemLog = require('../../models/SystemLog');
        await SystemLog.create({
          operator_id: req.user._id,
          action: 'DELETE_POST',
          target_id: req.params.id,
          reason: `Deleted forum post (ID: ${req.params.id})`
        });
      } catch (logErr) {
        console.error('Failed to create system log for post deletion:', logErr);
      }
    }

    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    if (error.message === 'Post not found') {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    if (error.message === 'Unauthorized to delete this post') {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this post' });
    }
    console.error('Error deleting forum post:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Toggle reaction (like/heart) on a forum post
exports.reactPost = async (req, res) => {
  try {
    const { type } = req.body; // 'like' or 'heart'
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (!post.likes) post.likes = [];
    if (!post.hearts) post.hearts = [];

    const userIdStr = req.user._id.toString();
    let isAdding = false; // track whether user is adding (not removing) a reaction

    if (type === 'like') {
      const index = post.likes.findIndex(id => id.toString() === userIdStr);
      if (index > -1) {
        post.likes.splice(index, 1); // remove like
      } else {
        post.likes.push(req.user._id); // add like
        isAdding = true;
        // remove from hearts
        const heartIdx = post.hearts.findIndex(id => id.toString() === userIdStr);
        if (heartIdx > -1) post.hearts.splice(heartIdx, 1);
      }
    } else if (type === 'heart') {
      const index = post.hearts.findIndex(id => id.toString() === userIdStr);
      if (index > -1) {
        post.hearts.splice(index, 1); // remove heart
      } else {
        post.hearts.push(req.user._id); // add heart
        isAdding = true;
        // remove from likes
        const likeIdx = post.likes.findIndex(id => id.toString() === userIdStr);
        if (likeIdx > -1) post.likes.splice(likeIdx, 1);
      }
    }

    const savedPost = await post.save();
    
    // Broadcast websocket update
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });

    // Notify post author when someone adds a reaction (not when removing)
    // Do not notify if the reactor IS the post author
    if (isAdding) {
      try {
        const postAuthorId = post.author_id?.toString();
        if (postAuthorId && postAuthorId !== userIdStr) {
          const reactorName = req.user.full_name || 'Someone';
          const reactionLabel = type === 'heart' ? '❤️ loved' : '👍 liked';
          await Notification.create({
            recipient_id: post.author_id,
            title: 'New Interaction on Your Post',
            body: `${reactorName} ${reactionLabel} your post "${post.title || 'untitled'}".`,
            type: 'New_Reaction_On_Post',
            reference_id: post._id,
            reference_type: 'forum_posts',
            metadata: {
              sender_name: reactorName,
              avatar_url: req.user.avatar_url || '',
              web_url: `/forum?postId=${post._id}`,
              app_screen: 'forum'
            }
          });
        }
      } catch (notifErr) {
        console.error('Failed to send reaction notification:', notifErr);
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        likes: savedPost.likes,
        hearts: savedPost.hearts
      }
    });
  } catch (error) {
    console.error('Error reacting to forum post:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Create a comment or reply on a forum post
exports.createComment = async (req, res) => {
  try {
    const { content, parent_id } = req.body;
    const post_id = req.params.id;

    const post = await ForumPost.findById(post_id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const comment = new PostComment({
      post_id,
      author_id: req.user._id,
      parent_id: parent_id || null,
      content
    });

    const savedComment = await comment.save();
    await savedComment.populate('author_id', 'full_name avatar_url role');

    wsHelper.broadcast({ type: 'FORUM_UPDATE' });

    // Send notifications asynchronously (do not block response)
    (async () => {
      try {
        const commenterIdStr = req.user._id.toString();
        const commenterName = req.user.full_name || 'Someone';
        const commenterAvatar = req.user.avatar_url || '';
        const postTitle = post.title || 'your post';

        if (parent_id) {
          // ── This is a REPLY to an existing comment ──
          const parentComment = await PostComment.findById(parent_id);
          if (parentComment) {
            const parentAuthorId = parentComment.author_id?.toString();

            // 1. Notify parent comment author (if different from replier)
            if (parentAuthorId && parentAuthorId !== commenterIdStr) {
              await Notification.create({
                recipient_id: parentComment.author_id,
                title: 'Someone replied to your comment',
                body: `${commenterName} replied: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`,
                type: 'New_Reply_On_Comment',
                reference_id: savedComment._id,
                reference_type: 'post_comments',
                metadata: {
                  sender_name: commenterName,
                  avatar_url: commenterAvatar,
                  web_url: `/forum?postId=${post_id}`,
                  app_screen: 'forum'
                }
              });
            }

            // 2. Also notify post author if different from both replier AND parent comment author
            const postAuthorId = post.author_id?.toString();
            if (
              postAuthorId &&
              postAuthorId !== commenterIdStr &&
              postAuthorId !== parentAuthorId
            ) {
              await Notification.create({
                recipient_id: post.author_id,
                title: 'New comment on your post',
                body: `${commenterName} commented: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`,
                type: 'New_Comment_On_Post',
                reference_id: post._id,
                reference_type: 'forum_posts',
                metadata: {
                  sender_name: commenterName,
                  avatar_url: commenterAvatar,
                  web_url: `/forum?postId=${post._id}`,
                  app_screen: 'forum'
                }
              });
            }
          }
        } else {
          // ── This is a top-level COMMENT on the post ──
          const postAuthorId = post.author_id?.toString();
          if (postAuthorId && postAuthorId !== commenterIdStr) {
            await Notification.create({
              recipient_id: post.author_id,
              title: 'New comment on your post',
              body: `${commenterName} commented: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}" in post "${postTitle}"`,
              type: 'New_Comment_On_Post',
              reference_id: post._id,
              reference_type: 'forum_posts',
              metadata: {
                sender_name: commenterName,
                avatar_url: commenterAvatar,
                web_url: `/forum?postId=${post._id}`,
                app_screen: 'forum'
              }
            });
          }
        }
      } catch (notifErr) {
        console.error('Failed to send comment/reply notification:', notifErr);
      }
    })();

    res.status(201).json({ success: true, data: savedComment });
  } catch (error) {
    console.error('Error creating forum comment:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a forum comment
exports.deleteComment = async (req, res) => {
  try {
    const comment = await PostComment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Verify ownership or Admin/Manager
    const isAuthor = comment.author_id.toString() === req.user._id.toString();
    const isAdminOrManager = ['Admin', 'Manager'].includes(req.user.role);

    if (!isAuthor && !isAdminOrManager) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this comment' });
    }

    // Only delete replies if it is a parent comment
    if (!comment.parent_id) {
      await Promise.all([
        PostComment.deleteMany({ parent_id: comment._id }),
        PostComment.findByIdAndDelete(comment._id)
      ]);
    } else {
      await comment.deleteOne();
    }

    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, message: 'Comment deleted successfully', data: { id: comment._id } });
  } catch (error) {
    console.error('Error deleting forum comment:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Update a forum comment
exports.updateComment = async (req, res) => {
  try {
    const { content } = req.body;
    const comment = await PostComment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Verify ownership
    if (comment.author_id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to edit this comment' });
    }

    comment.content = content;
    const updated = await comment.save();
    await updated.populate('author_id', 'full_name avatar_url role');

    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating forum comment:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Report a forum comment
exports.reportComment = async (req, res) => {
  try {
    const { reason, details } = req.body;
    const comment_id = req.params.id;
    const reporter_id = req.user._id;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Report reason is required' });
    }

    const comment = await PostComment.findById(comment_id);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    // Check if the user is trying to report their own comment
    if (comment.author_id.toString() === reporter_id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot report your own comment' });
    }

    // Check if already reported
    const existingReport = await CommentReport.findOne({ comment_id, reporter_id });
    if (existingReport) {
      return res.status(400).json({ success: false, message: 'You have already reported this comment' });
    }

    const report = new CommentReport({
      comment_id,
      reporter_id,
      reason,
      details
    });
    
    await report.save();

    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, message: 'Comment reported successfully' });
  } catch (error) {
    console.error('Error reporting forum comment:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already reported this comment' });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};


exports.reportPost = async (req, res) => {
  try {
    const { reason, details } = req.body;
    const post_id = req.params.id;
    const reporter_id = req.user._id;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Report reason is required' });
    }

    const post = await ForumPost.findById(post_id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    if (post.author_id.toString() === reporter_id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot report your own post' });
    }

    const existingReport = await PostReport.findOne({ post_id, reporter_id });
    if (existingReport) {
      return res.status(400).json({ success: false, message: 'You have already reported this post' });
    }

    const report = new PostReport({
      post_id,
      reporter_id,
      reason,
      details
    });
    
    await report.save();
    
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(201).json({ success: true, message: 'Report submitted successfully', data: report });
  } catch (error) {
    console.error('Error reporting post:', error);
    res.status(500).json({ success: false, message: 'Failed to report post' });
  }
};

// Moderation for Comments

// View Reported Comments (Legacy, kept for general view)
exports.getAllComments = async (req, res) => {
  try {
    const comments = await forumService.getAllComments();
    res.status(200).json({ success: true, data: comments });
  } catch (error) {
    console.error('Error fetching all comments:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// View Reported Comments (Dedicated API)
exports.getReportedComments = async (req, res) => {
  try {
    const comments = await forumService.getReportedComments();
    res.status(200).json({ success: true, data: comments });
  } catch (error) {
    console.error('Error fetching reported comments:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Delete a violating comment (Admin/Manager only)
exports.deleteViolatingComment = async (req, res) => {
  try {
    const deletedCommentId = await forumService.deleteViolatingComment(req.params.id);
    
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, message: 'Violating comment deleted successfully', data: { id: deletedCommentId } });
  } catch (error) {
    console.error('Error deleting violating comment:', error);
    if (error.message === 'Comment not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// Dismiss Comment Reports
exports.dismissCommentReports = async (req, res) => {
  try {
    const commentId = await forumService.dismissCommentReports(req.params.id);
    wsHelper.broadcast({ type: 'FORUM_UPDATE' });
    res.status(200).json({ success: true, message: 'Comment reports dismissed successfully', data: { id: commentId } });
  } catch (error) {
    console.error('Error dismissing comment reports:', error);
    if (error.message === 'Comment not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
