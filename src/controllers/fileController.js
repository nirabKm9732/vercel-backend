const { 
  uploadConfig, 
  deleteFromCloudinary, 
  getOptimizedUrl, 
  generateSignedUrl 
} = require('../config/cloudinary');
const User = require('../models/User');
const Prescription = require('../models/Prescription');

// Upload profile image
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const userId = req.user._id;
    const imageUrl = req.file.path;
    const publicId = req.file.filename;

    // Update user profile with new image URL
    const user = await User.findByIdAndUpdate(
      userId,
      { profileImage: imageUrl },
      { new: true }
    ).select('-password');

    // Delete old profile image if exists
    if (user.profileImage && user.profileImage !== imageUrl) {
      try {
        const oldPublicId = user.profileImage.split('/').pop().split('.')[0];
        await deleteFromCloudinary(oldPublicId);
      } catch (error) {
        console.error('Error deleting old profile image:', error);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl,
        publicId,
        user
      }
    });
  } catch (error) {
    console.error('Upload profile image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile image',
      error: error.message
    });
  }
};

// Upload prescription image
const uploadPrescription = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No prescription file uploaded'
      });
    }

    const { appointmentId } = req.body;
    const doctorId = req.user._id;
    
    // Verify user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can upload prescriptions'
      });
    }

    const prescriptionUrl = req.file.path;
    const publicId = req.file.filename;

    res.status(200).json({
      success: true,
      message: 'Prescription uploaded successfully',
      data: {
        prescriptionUrl,
        publicId,
        appointmentId
      }
    });
  } catch (error) {
    console.error('Upload prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload prescription',
      error: error.message
    });
  }
};

// Upload test report
const uploadTestReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No test report file uploaded'
      });
    }

    const { testBookingId } = req.body;
    const labAssistantId = req.user._id;
    
    // Verify user is a lab assistant
    if (req.user.role !== 'lab_assistant') {
      return res.status(403).json({
        success: false,
        message: 'Only lab assistants can upload test reports'
      });
    }

    const reportUrl = req.file.path;
    const publicId = req.file.filename;

    res.status(200).json({
      success: true,
      message: 'Test report uploaded successfully',
      data: {
        reportUrl,
        publicId,
        testBookingId
      }
    });
  } catch (error) {
    console.error('Upload test report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload test report',
      error: error.message
    });
  }
};

// Upload prescription image for medicine order (patients can upload)
const uploadMedicineOrderPrescription = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No prescription file uploaded'
      });
    }

    const prescriptionUrl = req.file.path;
    const publicId = req.file.filename;

    res.status(200).json({
      success: true,
      message: 'Prescription uploaded successfully',
      data: {
        prescriptionUrl,
        publicId
      }
    });
  } catch (error) {
    console.error('Upload medicine order prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload prescription',
      error: error.message
    });
  }
};

// Upload blog image
const uploadBlogImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No blog image uploaded'
      });
    }

    // Verify user is a doctor (only doctors can write blogs)
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can upload blog images'
      });
    }

    const imageUrl = req.file.path;
    const publicId = req.file.filename;

    res.status(200).json({
      success: true,
      message: 'Blog image uploaded successfully',
      data: {
        imageUrl,
        publicId
      }
    });
  } catch (error) {
    console.error('Upload blog image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload blog image',
      error: error.message
    });
  }
};

// Delete file
const deleteFile = async (req, res) => {
  try {
    const { publicId, fileType } = req.body;
    
    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required'
      });
    }

    // Delete from Cloudinary
    const result = await deleteFromCloudinary(publicId);

    if (result.result === 'ok') {
      // Update database records if necessary
      if (fileType === 'profileImage') {
        await User.findByIdAndUpdate(
          req.user._id,
          { profileImage: '' }
        );
      }

      res.status(200).json({
        success: true,
        message: 'File deleted successfully',
        data: { result }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to delete file'
      });
    }
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
};

// Get optimized image URL
const getOptimizedImage = async (req, res) => {
  try {
    const { publicId } = req.params;
    const { 
      width, 
      height, 
      quality = 'auto', 
      format = 'auto' 
    } = req.query;

    const options = {
      quality,
      fetch_format: format
    };

    if (width) options.width = parseInt(width);
    if (height) options.height = parseInt(height);

    const optimizedUrl = getOptimizedUrl(publicId, options);

    res.status(200).json({
      success: true,
      data: { optimizedUrl }
    });
  } catch (error) {
    console.error('Get optimized image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get optimized image',
      error: error.message
    });
  }
};

// Generate signed upload URL for frontend
const getSignedUploadUrl = async (req, res) => {
  try {
    const { folder, fileType } = req.body;
    const userId = req.user._id;
    
    if (!folder || !fileType) {
      return res.status(400).json({
        success: false,
        message: 'Folder and file type are required'
      });
    }

    const publicId = `${fileType}_${userId}_${Date.now()}`;
    const signedUrl = generateSignedUrl(folder, publicId);

    res.status(200).json({
      success: true,
      message: 'Signed URL generated successfully',
      data: {
        uploadUrl: 'https://api.cloudinary.com/v1_1/' + process.env.CLOUDINARY_CLOUD_NAME + '/image/upload',
        ...signedUrl
      }
    });
  } catch (error) {
    console.error('Generate signed URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate signed URL',
      error: error.message
    });
  }
};

// Get user's uploaded files
const getUserFiles = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fileType, page = 1, limit = 20 } = req.query;

    // This would typically query a files collection
    // For now, we'll return user's profile image and related files
    let files = [];

    const user = await User.findById(userId).select('profileImage');
    if (user.profileImage) {
      files.push({
        type: 'profile',
        url: user.profileImage,
        uploadedAt: user.updatedAt
      });
    }

    res.status(200).json({
      success: true,
      data: {
        files,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: files.length,
          pages: Math.ceil(files.length / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user files',
      error: error.message
    });
  }
};

module.exports = {
  uploadProfileImage,
  uploadPrescription,
  uploadMedicineOrderPrescription,
  uploadTestReport,
  uploadBlogImage,
  deleteFile,
  getOptimizedImage,
  getSignedUploadUrl,
  getUserFiles
};
