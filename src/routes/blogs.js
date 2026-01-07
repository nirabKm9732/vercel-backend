const express = require('express');
const { body } = require('express-validator');
const jwt = require('jsonwebtoken');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const User = require('../models/User');
const {
  createBlog,
  getBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  getTrendingBlogs,
  toggleBlogLike,
  addComment,
  deleteComment
} = require('../controllers/blogController');

const router = express.Router();

// Optional authentication middleware
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        if (user && user.isActive) {
          req.user = user;
        } else {
          req.user = null;
        }
      } catch (error) {
        req.user = null;
      }
    } else {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
};

// Public routes - getBlogById can be accessed without auth, but will check auth if provided
router.get('/', getBlogs);
router.get('/trending', getTrendingBlogs);
router.get('/:id', optionalAuth, getBlogById);

// Protected routes
router.use(authenticateToken);

// Like/Unlike blog
router.post('/:id/like', toggleBlogLike);

// Comment routes
router.post('/:id/comments', [
  body('comment').trim().notEmpty().withMessage('Comment is required').isLength({ min: 1, max: 1000 }).withMessage('Comment must be between 1 and 1000 characters')
], addComment);

router.delete('/:id/comments/:commentId', deleteComment);

// Create blog (doctors only)
router.post('/', [
  authorizeRoles('doctor'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('summary').optional().trim().isLength({ max: 300 }).withMessage('Summary must be less than 300 characters'),
  body('category').trim().notEmpty().withMessage('Category is required')
], createBlog);

// Update blog
router.put('/:id', [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
  body('content').optional().trim().notEmpty().withMessage('Content cannot be empty'),
  body('summary').optional().trim().isLength({ max: 300 }).withMessage('Summary must be less than 300 characters')
], updateBlog);

// Delete blog
router.delete('/:id', deleteBlog);

module.exports = router;
