const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME || process.env.cloudinary_cloud_name || 'dviwebqke',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: (req, file) => {
      // Organize uploads by type
      if (file.fieldname === 'prescription') return 'healthcare/prescriptions';
      if (file.fieldname === 'testReport') return 'healthcare/test-reports';
      if (file.fieldname === 'profileImage') return 'healthcare/profiles';
      if (file.fieldname === 'blogImage') return 'healthcare/blogs';
      return 'healthcare/misc';
    },
    allowed_formats: (req, file) => {
      if (file.fieldname === 'profileImage' || file.fieldname === 'blogImage') {
        return ['jpg', 'jpeg', 'png', 'webp'];
      }
      return ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'];
    },
    resource_type: 'auto',
    public_id: (req, file) => {
      const timestamp = Date.now();
      const userId = req.user?._id || 'anonymous';
      return `${file.fieldname}_${userId}_${timestamp}`;
    },
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, and Word documents are allowed.'), false);
  }
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Upload configurations for different use cases
const uploadConfig = {
  // Single file uploads
  prescription: upload.single('prescription'),
  medicineOrderPrescription: upload.single('prescription'),
  testReport: upload.single('testReport'),
  profileImage: upload.single('profileImage'),
  blogImage: upload.single('blogImage'),
  
  // Multiple file uploads
  prescriptionFiles: upload.array('prescriptionFiles', 5),
  testReportFiles: upload.array('testReportFiles', 3),
  
  // Mixed uploads
  appointmentFiles: upload.fields([
    { name: 'prescription', maxCount: 1 },
    { name: 'testReports', maxCount: 3 }
  ])
};

// Utility functions
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

const getOptimizedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    quality: 'auto',
    fetch_format: 'auto',
    ...options
  };
  
  return cloudinary.url(publicId, defaultOptions);
};

// Generate signed URL for secure uploads from frontend
const generateSignedUrl = (folder, publicId) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  
  const params = {
    timestamp: timestamp,
    folder: folder,
    public_id: publicId
  };
  
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  
  return {
    timestamp,
    signature,
    api_key: process.env.CLOUDINARY_API_KEY,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
    public_id: publicId
  };
};

module.exports = {
  cloudinary,
  upload,
  uploadConfig,
  deleteFromCloudinary,
  getOptimizedUrl,
  generateSignedUrl
};
