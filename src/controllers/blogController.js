const { Blog } = require('../models/Blog');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Helper function to calculate read time
const calculateReadTime = (content) => {
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
};

// Create a new blog post (doctors only)
const createBlog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    // Only doctors can create blog posts
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can create blog posts'
      });
    }

    const { title, content, category, tags, summary, featuredImage, isPublished } = req.body;

    // Calculate read time
    const readTime = calculateReadTime(content);

    // Default to published unless explicitly false
    const shouldPublish = isPublished === false ? false : true;

    const blog = new Blog({
      title,
      content,
      summary: summary || content.substring(0, 300),
      category,
      tags: tags || [],
      featuredImage: featuredImage || '',
      readTime,
      isPublished: shouldPublish,
      author: req.user._id,
      publishedAt: shouldPublish ? new Date() : null
    });

    await blog.save();
    await blog.populate('author', 'firstName lastName specialization profileImage');

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      data: { blog }
    });
  } catch (error) {
    console.error('Create blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create blog post',
      error: error.message
    });
  }
};

// Get all blog posts with filtering and pagination
const getBlogs = async (req, res) => {
  try {
    const {
      category,
      author,
      search,
      tags,
      published = 'true',
      page = 1,
      limit = 10,
      sort = '-createdAt'
    } = req.query;

    let filter = {};

    // Only show published blogs for non-admin users
    if (published === 'true') {
      filter.isPublished = true;
    }

    if (category) {
      filter.category = { $regex: category, $options: 'i' };
    }

    if (author) {
      filter.author = author;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      filter.tags = { $in: tagArray };
    }

    const blogs = await Blog.find(filter)
      .populate('author', 'firstName lastName specialization profileImage qualification')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Blog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        blogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blog posts',
      error: error.message
    });
  }
};

// Get a single blog post by ID
const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id)
      .populate('author', 'firstName lastName specialization profileImage qualification experience');

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Only show unpublished blogs to their authors and admins
    if (!blog.isPublished && req.user?.role !== 'admin' && blog.author._id.toString() !== req.user?._id.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Populate comments with user info
    await blog.populate('comments.user', 'firstName lastName profileImage role');

    // Increment view count
    blog.views += 1;
    await blog.save();

    res.status(200).json({
      success: true,
      data: { blog }
    });
  } catch (error) {
    console.error('Get blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blog post',
      error: error.message
    });
  }
};

// Update blog post (author or admin only)
const updateBlog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Check if user has permission to update
    const canUpdate = req.user.role === 'admin' || blog.author.toString() === req.user._id.toString();

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.author; // Prevent author change
    delete updateData.createdAt;

    // Update the blog
    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'firstName lastName specialization profileImage');

    res.status(200).json({
      success: true,
      message: 'Blog post updated successfully',
      data: { blog: updatedBlog }
    });
  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update blog post',
      error: error.message
    });
  }
};

// Delete blog post (author or admin only)
const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Check if user has permission to delete
    const canDelete = req.user.role === 'admin' || blog.author.toString() === req.user._id.toString();

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await Blog.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Blog post deleted successfully'
    });
  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete blog post',
      error: error.message
    });
  }
};

// Get popular/trending blog posts
const getTrendingBlogs = async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    // Get blogs with highest view count in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendingBlogs = await Blog.find({
      isPublished: true,
      createdAt: { $gte: thirtyDaysAgo }
    })
      .populate('author', 'firstName lastName specialization profileImage')
      .sort({ views: -1, 'likes.length': -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: { blogs: trendingBlogs }
    });
  } catch (error) {
    console.error('Get trending blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending blogs',
      error: error.message
    });
  }
};

// Like/Unlike a blog post
const toggleBlogLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    if (!blog.isPublished) {
      return res.status(403).json({
        success: false,
        message: 'Cannot like unpublished blog post'
      });
    }

    // Check if user has already liked
    const existingLike = blog.likes.find(like => like.user && like.user.toString() === userId.toString());

    if (existingLike) {
      // Unlike the blog
      blog.likes = blog.likes.filter(like => like.user.toString() !== userId.toString());
    } else {
      // Like the blog
      blog.likes.push({ user: userId, likedAt: new Date() });
    }

    await blog.save();

    res.status(200).json({
      success: true,
      message: existingLike ? 'Blog unliked' : 'Blog liked',
      data: {
        liked: !existingLike,
        likeCount: blog.likes.length
      }
    });
  } catch (error) {
    console.error('Toggle blog like error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle blog like',
      error: error.message
    });
  }
};

// Add a comment to a blog post
const addComment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user._id;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    if (!blog.isPublished) {
      return res.status(403).json({
        success: false,
        message: 'Cannot comment on unpublished blog post'
      });
    }

    // Add comment (auto-approve for now, can be changed to require moderation)
    const newComment = {
      user: userId,
      comment: comment.trim(),
      commentedAt: new Date(),
      isApproved: true
    };

    blog.comments.push(newComment);
    await blog.save();

    // Populate the new comment with user info
    await blog.populate('comments.user', 'firstName lastName profileImage role');
    const addedComment = blog.comments[blog.comments.length - 1];

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: { comment: addedComment }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment',
      error: error.message
    });
  }
};

// Delete a comment
const deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const userId = req.user._id;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    const comment = blog.comments.id(commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found'
      });
    }

    // Check if user has permission (comment owner, blog author, or admin)
    const canDelete = 
      req.user.role === 'admin' || 
      blog.author.toString() === userId.toString() ||
      comment.user.toString() === userId.toString();

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    comment.deleteOne();
    await blog.save();

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully'
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete comment',
      error: error.message
    });
  }
};

module.exports = {
  createBlog,
  getBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  getTrendingBlogs,
  toggleBlogLike,
  addComment,
  deleteComment
};
