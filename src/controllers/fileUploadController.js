const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const { TestBooking } = require('../models/TestPackage');
const { HospitalBooking } = require('../models/Hospital');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/temp/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    medical: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf', 'application/dicom']
  };

  const uploadType = req.body.uploadType || 'document';
  const allowed = allowedTypes[uploadType] || allowedTypes.document;

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowed.join(', ')}`), false);
  }
};

// Multer upload configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
});

// Upload middleware configurations
const uploadSingle = upload.single('file');
const uploadMultiple = upload.array('files', 5); // Max 5 files
const uploadFields = upload.fields([
  { name: 'prescription', maxCount: 1 },
  { name: 'medicalRecords', maxCount: 3 },
  { name: 'insuranceDocuments', maxCount: 2 }
]);

// Helper function to upload file to Cloudinary
const uploadToCloudinary = async (filePath, folder, options = {}) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `healthcare/${folder}`,
      resource_type: 'auto',
      transformation: options.transformation || [
        { quality: 'auto', fetch_format: 'auto' }
      ],
      ...options
    });

    // Delete temporary file
    fs.unlinkSync(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      originalName: path.basename(filePath),
      size: result.bytes,
      format: result.format
    };
  } catch (error) {
    // Clean up temporary file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
};

// Upload prescription document
const uploadPrescription = async (req, res) => {
  try {
    uploadSingle(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      const { appointmentId } = req.body;
      
      // Verify appointment exists and user has access
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        fs.unlinkSync(req.file.path); // Clean up
        return res.status(404).json({
          success: false,
          message: 'Appointment not found'
        });
      }

      // Check access rights
      const hasAccess = req.user.role === 'admin' || 
                       appointment.doctor.toString() === req.user._id.toString() ||
                       appointment.patient.toString() === req.user._id.toString();

      if (!hasAccess) {
        fs.unlinkSync(req.file.path); // Clean up
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(
        req.file.path, 
        'prescriptions',
        {
          transformation: [
            { quality: 'auto', fetch_format: 'auto' },
            { flags: 'sanitize' } // For PDFs
          ]
        }
      );

      // Update appointment with prescription document
      appointment.prescription = appointment.prescription || {};
      appointment.prescription.documentUrl = uploadResult.url;
      appointment.prescription.documentPublicId = uploadResult.publicId;
      appointment.prescription.uploadedAt = new Date();
      appointment.prescription.uploadedBy = req.user._id;

      await appointment.save();

      res.status(200).json({
        success: true,
        message: 'Prescription uploaded successfully',
        data: {
          url: uploadResult.url,
          appointmentId: appointment._id
        }
      });
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
    uploadSingle(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      const { bookingId } = req.body;
      
      // Verify test booking exists
      const booking = await TestBooking.findById(bookingId);
      if (!booking) {
        fs.unlinkSync(req.file.path); // Clean up
        return res.status(404).json({
          success: false,
          message: 'Test booking not found'
        });
      }

      // Check if user is lab assistant or admin
      if (!['admin', 'lab_assistant'].includes(req.user.role)) {
        fs.unlinkSync(req.file.path); // Clean up
        return res.status(403).json({
          success: false,
          message: 'Only lab assistants can upload test reports'
        });
      }

      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(
        req.file.path, 
        'test-reports',
        {
          transformation: [
            { quality: 'auto', fetch_format: 'auto' }
          ]
        }
      );

      // Update booking with test report
      booking.testReport = {
        reportUrl: uploadResult.url,
        reportPublicId: uploadResult.publicId,
        uploadedAt: new Date(),
        uploadedBy: req.user._id,
        originalName: req.file.originalname
      };
      
      booking.status = 'completed';
      await booking.save();

      res.status(200).json({
        success: true,
        message: 'Test report uploaded successfully',
        data: {
          url: uploadResult.url,
          bookingId: booking._id
        }
      });
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

// Upload medical documents for hospital admission
const uploadMedicalDocuments = async (req, res) => {
  try {
    uploadMultiple(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files provided'
        });
      }

      const { bookingId } = req.body;
      
      // Verify hospital booking exists
      const booking = await HospitalBooking.findById(bookingId);
      if (!booking) {
        // Clean up files
        req.files.forEach(file => fs.unlinkSync(file.path));
        return res.status(404).json({
          success: false,
          message: 'Hospital booking not found'
        });
      }

      // Check access rights
      const hasAccess = req.user.role === 'admin' || 
                       req.user.role === 'hospital' ||
                       booking.patient.toString() === req.user._id.toString();

      if (!hasAccess) {
        // Clean up files
        req.files.forEach(file => fs.unlinkSync(file.path));
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const uploadedDocuments = [];

      // Upload each file to Cloudinary
      for (const file of req.files) {
        try {
          const uploadResult = await uploadToCloudinary(
            file.path, 
            'medical-documents',
            {
              transformation: [
                { quality: 'auto', fetch_format: 'auto' }
              ]
            }
          );

          uploadedDocuments.push({
            type: uploadResult.url,
            description: file.originalname || 'Medical Document',
            uploadedAt: new Date(),
            uploadedBy: req.user._id,
            publicId: uploadResult.publicId,
            size: uploadResult.size
          });
        } catch (uploadError) {
          console.error('Error uploading file:', file.originalname, uploadError);
          // Continue with other files
        }
      }

      // Add documents to booking
      booking.documents = booking.documents || [];
      booking.documents.push(...uploadedDocuments);
      await booking.save();

      res.status(200).json({
        success: true,
        message: `${uploadedDocuments.length} documents uploaded successfully`,
        data: {
          uploadedDocuments,
          bookingId: booking._id
        }
      });
    });
  } catch (error) {
    console.error('Upload medical documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload medical documents',
      error: error.message
    });
  }
};

// Upload user profile image
const uploadProfileImage = async (req, res) => {
  try {
    uploadSingle(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file provided'
        });
      }

      // Validate image file
      if (!req.file.mimetype.startsWith('image/')) {
        fs.unlinkSync(req.file.path); // Clean up
        return res.status(400).json({
          success: false,
          message: 'Only image files are allowed'
        });
      }

      // Upload to Cloudinary with image transformations
      const uploadResult = await uploadToCloudinary(
        req.file.path, 
        'profile-images',
        {
          transformation: [
            { width: 300, height: 300, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        }
      );

      // Update user profile
      const user = await User.findById(req.user._id);
      
      // Delete old profile image if exists
      if (user.profileImage && user.profileImagePublicId) {
        try {
          await cloudinary.uploader.destroy(user.profileImagePublicId);
        } catch (deleteError) {
          console.error('Error deleting old profile image:', deleteError);
        }
      }

      user.profileImage = uploadResult.url;
      user.profileImagePublicId = uploadResult.publicId;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Profile image uploaded successfully',
        data: {
          url: uploadResult.url,
          userId: user._id
        }
      });
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

// Upload insurance documents
const uploadInsuranceDocuments = async (req, res) => {
  try {
    uploadFields(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: 'File upload error',
          error: err.message
        });
      }

      const uploadedFiles = {};
      const allFiles = [];

      // Collect all uploaded files
      Object.keys(req.files || {}).forEach(fieldName => {
        req.files[fieldName].forEach(file => {
          allFiles.push({ ...file, fieldName });
        });
      });

      if (allFiles.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files provided'
        });
      }

      // Upload each file category
      for (const file of allFiles) {
        try {
          const uploadResult = await uploadToCloudinary(
            file.path, 
            `insurance/${file.fieldName}`,
            {
              transformation: [
                { quality: 'auto', fetch_format: 'auto' }
              ]
            }
          );

          if (!uploadedFiles[file.fieldName]) {
            uploadedFiles[file.fieldName] = [];
          }

          uploadedFiles[file.fieldName].push({
            url: uploadResult.url,
            publicId: uploadResult.publicId,
            originalName: file.originalname,
            uploadedAt: new Date()
          });
        } catch (uploadError) {
          console.error('Error uploading insurance file:', file.originalname, uploadError);
        }
      }

      // Update user insurance documents
      const user = await User.findById(req.user._id);
      user.insurance = user.insurance || {};
      user.insurance.documents = { ...user.insurance.documents, ...uploadedFiles };
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Insurance documents uploaded successfully',
        data: uploadedFiles
      });
    });
  } catch (error) {
    console.error('Upload insurance documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload insurance documents',
      error: error.message
    });
  }
};

// Get file/document
const getFile = async (req, res) => {
  try {
    const { type, id, fileId } = req.params;

    let record;
    let fileInfo;

    switch (type) {
      case 'prescription':
        record = await Appointment.findById(id);
        fileInfo = record?.prescription;
        break;
      case 'test-report':
        record = await TestBooking.findById(id);
        fileInfo = record?.testReport;
        break;
      case 'medical-document':
        record = await HospitalBooking.findById(id);
        fileInfo = record?.documents?.find(doc => doc._id.toString() === fileId);
        break;
      case 'profile-image':
        record = await User.findById(id);
        fileInfo = { reportUrl: record?.profileImage };
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid file type'
        });
    }

    if (!record || !fileInfo) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Check access rights based on type
    let hasAccess = false;
    switch (type) {
      case 'prescription':
        hasAccess = req.user.role === 'admin' || 
                   record.doctor.toString() === req.user._id.toString() ||
                   record.patient.toString() === req.user._id.toString();
        break;
      case 'test-report':
        hasAccess = req.user.role === 'admin' || 
                   req.user.role === 'lab_assistant' ||
                   record.patient.toString() === req.user._id.toString();
        break;
      case 'medical-document':
        hasAccess = req.user.role === 'admin' || 
                   req.user.role === 'hospital' ||
                   record.patient.toString() === req.user._id.toString();
        break;
      case 'profile-image':
        hasAccess = true; // Profile images are generally accessible
        break;
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        url: fileInfo.reportUrl || fileInfo.type,
        uploadedAt: fileInfo.uploadedAt,
        originalName: fileInfo.originalName || fileInfo.description
      }
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve file',
      error: error.message
    });
  }
};

// Delete file
const deleteFile = async (req, res) => {
  try {
    const { type, id, fileId } = req.params;

    let record;
    let fileInfo;
    let publicId;

    switch (type) {
      case 'prescription':
        record = await Appointment.findById(id);
        if (record?.prescription?.documentPublicId) {
          publicId = record.prescription.documentPublicId;
          record.prescription = undefined;
        }
        break;
      case 'test-report':
        record = await TestBooking.findById(id);
        if (record?.testReport?.reportPublicId) {
          publicId = record.testReport.reportPublicId;
          record.testReport = undefined;
        }
        break;
      case 'medical-document':
        record = await HospitalBooking.findById(id);
        if (record?.documents) {
          const docIndex = record.documents.findIndex(doc => doc._id.toString() === fileId);
          if (docIndex > -1) {
            publicId = record.documents[docIndex].publicId;
            record.documents.splice(docIndex, 1);
          }
        }
        break;
      case 'profile-image':
        record = await User.findById(id);
        if (record?.profileImagePublicId) {
          publicId = record.profileImagePublicId;
          record.profileImage = undefined;
          record.profileImagePublicId = undefined;
        }
        break;
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    // Check access rights (admin or owner)
    const hasAccess = req.user.role === 'admin' || 
                     record.patient?.toString() === req.user._id.toString() ||
                     record.doctor?.toString() === req.user._id.toString() ||
                     record._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete from Cloudinary
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.error('Error deleting from Cloudinary:', deleteError);
      }
    }

    // Save updated record
    await record.save();

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
};

module.exports = {
  uploadPrescription,
  uploadTestReport,
  uploadMedicalDocuments,
  uploadProfileImage,
  uploadInsuranceDocuments,
  getFile,
  deleteFile
};
