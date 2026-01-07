const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['general_health', 'nutrition', 'mental_health', 'fitness', 'disease_prevention', 'treatment_updates', 'medical_research', 'other']
  },
  tags: [String],
  featuredImage: {
    type: String, // Cloudinary URL
    default: ''
  },
  summary: {
    type: String,
    required: true,
    maxlength: 300
  },
  readTime: {
    type: Number, // in minutes
    required: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    comment: {
      type: String,
      required: true
    },
    commentedAt: {
      type: Date,
      default: Date.now
    },
    isApproved: {
      type: Boolean,
      default: false
    }
  }],
  seoKeywords: [String],
  metaDescription: String
}, {
  timestamps: true
});


// Indexes
blogSchema.index({ author: 1, isPublished: 1 });
blogSchema.index({ category: 1, isPublished: 1 });
blogSchema.index({ publishedAt: -1 });
blogSchema.index({ title: 'text', content: 'text', tags: 'text' });


const Blog = mongoose.model('Blog', blogSchema);

module.exports = { Blog };
