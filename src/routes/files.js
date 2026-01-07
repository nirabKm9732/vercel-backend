const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { uploadConfig } = require('../config/cloudinary');
const {
  uploadProfileImage,
  uploadPrescription,
  uploadMedicineOrderPrescription,
  uploadTestReport,
  uploadBlogImage,
  deleteFile,
  getOptimizedImage,
  getSignedUploadUrl,
  getUserFiles
} = require('../controllers/fileController');

const router = express.Router();

// All file routes require authentication
router.use(authenticateToken);

// Upload profile image
router.post('/upload/profile-image', 
  uploadConfig.profileImage,
  uploadProfileImage
);

// Upload prescription (doctors only)
router.post('/upload/prescription',
  authorizeRoles('doctor'),
  uploadConfig.prescription,
  uploadPrescription
);

// Upload prescription for medicine order (patients can upload)
router.post('/upload/medicine-order-prescription',
  uploadConfig.medicineOrderPrescription,
  uploadMedicineOrderPrescription
);

// Upload test report (lab assistants only)
router.post('/upload/test-report',
  authorizeRoles('lab_assistant'),
  uploadConfig.testReport,
  uploadTestReport
);

// Upload blog image (doctors only)
router.post('/upload/blog-image',
  authorizeRoles('doctor'),
  uploadConfig.blogImage,
  uploadBlogImage
);

// Delete file
router.delete('/delete', [
  body('publicId').notEmpty().withMessage('Public ID is required'),
  body('fileType').optional().isIn(['profileImage', 'prescription', 'testReport', 'blogImage'])
], deleteFile);

// Get optimized image URL
router.get('/optimize/:publicId', [
  param('publicId').notEmpty().withMessage('Public ID is required')
], getOptimizedImage);

// Generate signed upload URL for frontend direct upload
router.post('/signed-url', [
  body('folder').notEmpty().withMessage('Folder is required'),
  body('fileType').notEmpty().withMessage('File type is required')
], getSignedUploadUrl);

// Get user's uploaded files
router.get('/my-files', getUserFiles);

// Handle multer errors
router.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File size too large. Maximum size is 10MB.'
    });
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'File upload error',
    error: error.message
  });
});

module.exports = router;
