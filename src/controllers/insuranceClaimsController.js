const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { MedicineOrder } = require('../models/MedicineOrder');
const { TestBooking } = require('../models/TestPackage');
const { HospitalBooking } = require('../models/Hospital');
const cloudinary = require('../config/cloudinary');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Insurance Claim Schema - Create if doesn't exist
let InsuranceClaim;
try {
  InsuranceClaim = require('../models/InsuranceClaim');
} catch {
  const claimSchema = new mongoose.Schema({
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    claimType: {
      type: String,
      enum: ['appointment', 'medicine', 'test', 'hospital', 'other'],
      required: true
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true // ID of appointment, medicine order, test booking, etc.
    },
    claimNumber: {
      type: String,
      unique: true,
      required: true
    },
    insuranceProvider: {
      name: {
        type: String,
        required: true
      },
      policyNumber: {
        type: String,
        required: true
      },
      groupNumber: String,
      phoneNumber: String,
      email: String
    },
    claimAmount: {
      totalBillAmount: {
        type: Number,
        required: true
      },
      claimedAmount: {
        type: Number,
        required: true
      },
      approvedAmount: Number,
      deductibleAmount: Number,
      copayAmount: Number,
      paidAmount: Number
    },
    documents: [{
      type: {
        type: String,
        enum: ['medical_bill', 'prescription', 'test_report', 'discharge_summary', 'insurance_card', 'id_proof', 'other'],
        required: true
      },
      name: String,
      url: String,
      publicId: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    status: {
      type: String,
      enum: ['draft', 'submitted', 'under_review', 'additional_info_required', 'approved', 'rejected', 'partially_approved', 'paid'],
      default: 'draft'
    },
    submittedAt: Date,
    reviewedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,
    paidAt: Date,
    notes: {
      patientNotes: String,
      reviewerNotes: String,
      rejectionReason: String
    },
    reviewHistory: [{
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      status: String,
      notes: String,
      reviewedAt: {
        type: Date,
        default: Date.now
      }
    }],
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User' // Insurance reviewer
    },
    paymentReference: String,
    processingDays: Number
  }, {
    timestamps: true
  });

  InsuranceClaim = mongoose.model('InsuranceClaim', claimSchema);
}

// Generate unique claim number
const generateClaimNumber = () => {
  const prefix = 'HC'; // HealthCare
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

// Create a new insurance claim
const createClaim = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      claimType,
      relatedId,
      insuranceProvider,
      claimedAmount,
      patientNotes
    } = req.body;

    const patientId = req.user._id;

    // Validate the related record exists
    let relatedRecord;
    let totalBillAmount;

    switch (claimType) {
      case 'appointment':
        relatedRecord = await Appointment.findOne({
          _id: relatedId,
          patient: patientId
        });
        totalBillAmount = relatedRecord?.payment?.totalAmount;
        break;
      case 'medicine':
        relatedRecord = await MedicineOrder.findOne({
          _id: relatedId,
          patient: patientId
        });
        totalBillAmount = relatedRecord?.pricing?.total;
        break;
      case 'test':
        relatedRecord = await TestBooking.findOne({
          _id: relatedId,
          patient: patientId
        });
        totalBillAmount = relatedRecord?.payment?.amount;
        break;
      case 'hospital':
        relatedRecord = await HospitalBooking.findOne({
          _id: relatedId,
          patient: patientId
        });
        totalBillAmount = relatedRecord?.payment?.estimatedTotal || relatedRecord?.billing?.totalCharges;
        break;
    }

    if (!relatedRecord) {
      return res.status(404).json({
        success: false,
        message: 'Related record not found or access denied'
      });
    }

    // Check if claim already exists for this record
    const existingClaim = await InsuranceClaim.findOne({
      claimType,
      relatedId,
      patient: patientId,
      status: { $nin: ['rejected', 'paid'] }
    });

    if (existingClaim) {
      return res.status(400).json({
        success: false,
        message: 'An active claim already exists for this record'
      });
    }

    // Create claim
    const claim = new InsuranceClaim({
      patient: patientId,
      claimType,
      relatedId,
      claimNumber: generateClaimNumber(),
      insuranceProvider,
      claimAmount: {
        totalBillAmount,
        claimedAmount
      },
      notes: {
        patientNotes
      }
    });

    await claim.save();

    res.status(201).json({
      success: true,
      message: 'Insurance claim created successfully',
      data: { claim }
    });
  } catch (error) {
    console.error('Create claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create insurance claim',
      error: error.message
    });
  }
};

// Upload documents for a claim
const uploadClaimDocuments = async (req, res) => {
  try {
    const { claimId } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No documents provided'
      });
    }

    const claim = await InsuranceClaim.findOne({
      _id: claimId,
      patient: req.user._id
    });

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    if (['submitted', 'under_review', 'approved', 'paid'].includes(claim.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot upload documents to a claim in this status'
      });
    }

    const uploadedDocuments = [];

    // Upload files to Cloudinary
    for (const file of req.files) {
      try {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'healthcare/insurance-claims',
          resource_type: 'auto',
          transformation: [
            { quality: 'auto', fetch_format: 'auto' }
          ]
        });

        uploadedDocuments.push({
          type: file.fieldname || 'other',
          name: file.originalname,
          url: result.secure_url,
          publicId: result.public_id
        });

        // Clean up temporary file
        require('fs').unlinkSync(file.path);
      } catch (uploadError) {
        console.error('Document upload error:', uploadError);
      }
    }

    // Add documents to claim
    claim.documents.push(...uploadedDocuments);
    await claim.save();

    res.status(200).json({
      success: true,
      message: `${uploadedDocuments.length} documents uploaded successfully`,
      data: {
        uploadedDocuments,
        totalDocuments: claim.documents.length
      }
    });
  } catch (error) {
    console.error('Upload claim documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload documents',
      error: error.message
    });
  }
};

// Submit claim for review
const submitClaim = async (req, res) => {
  try {
    const { claimId } = req.params;
    
    const claim = await InsuranceClaim.findOne({
      _id: claimId,
      patient: req.user._id
    });

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    if (claim.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft claims can be submitted'
      });
    }

    // Check if minimum required documents are uploaded
    const requiredDocuments = ['medical_bill', 'insurance_card'];
    const uploadedDocTypes = claim.documents.map(doc => doc.type);
    const missingDocs = requiredDocuments.filter(docType => !uploadedDocTypes.includes(docType));

    if (missingDocs.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required documents: ${missingDocs.join(', ')}`
      });
    }

    // Submit claim
    claim.status = 'submitted';
    claim.submittedAt = new Date();
    
    await claim.save();

    res.status(200).json({
      success: true,
      message: 'Claim submitted successfully',
      data: { claim }
    });
  } catch (error) {
    console.error('Submit claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit claim',
      error: error.message
    });
  }
};

// Get user's insurance claims
const getUserClaims = async (req, res) => {
  try {
    const { status, claimType, page = 1, limit = 10 } = req.query;
    const patientId = req.user._id;

    let filter = { patient: patientId };

    if (status) {
      filter.status = status;
    }

    if (claimType) {
      filter.claimType = claimType;
    }

    const claims = await InsuranceClaim.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await InsuranceClaim.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        claims,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
};

// Get claim details by ID
const getClaimById = async (req, res) => {
  try {
    const { claimId } = req.params;

    let filter = { _id: claimId };

    // Check access permissions
    if (req.user.role === 'patient') {
      filter.patient = req.user._id;
    } else if (!['admin', 'insurance_reviewer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const claim = await InsuranceClaim.findOne(filter)
      .populate('patient', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName')
      .populate('reviewHistory.reviewedBy', 'firstName lastName');

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    // Get related record details
    let relatedRecord;
    switch (claim.claimType) {
      case 'appointment':
        relatedRecord = await Appointment.findById(claim.relatedId)
          .populate('doctor', 'firstName lastName specialization');
        break;
      case 'medicine':
        relatedRecord = await MedicineOrder.findById(claim.relatedId)
          .populate('items.medicine', 'name');
        break;
      case 'test':
        relatedRecord = await TestBooking.findById(claim.relatedId)
          .populate('testPackage', 'name');
        break;
      case 'hospital':
        relatedRecord = await HospitalBooking.findById(claim.relatedId)
          .populate('hospital', 'name');
        break;
    }

    res.status(200).json({
      success: true,
      data: {
        claim,
        relatedRecord
      }
    });
  } catch (error) {
    console.error('Get claim by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claim',
      error: error.message
    });
  }
};

// Admin/Reviewer functions
const getAllClaims = async (req, res) => {
  try {
    if (!['admin', 'insurance_reviewer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const {
      status,
      claimType,
      assignedTo,
      insuranceProvider,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let filter = {};

    if (status) filter.status = status;
    if (claimType) filter.claimType = claimType;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (insuranceProvider) {
      filter['insuranceProvider.name'] = { $regex: insuranceProvider, $options: 'i' };
    }

    // If user is insurance_reviewer, only show assigned claims
    if (req.user.role === 'insurance_reviewer') {
      filter.assignedTo = req.user._id;
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const claims = await InsuranceClaim.find(filter)
      .populate('patient', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await InsuranceClaim.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        claims,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch claims',
      error: error.message
    });
  }
};

// Assign claim to reviewer
const assignClaim = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can assign claims'
      });
    }

    const { claimId } = req.params;
    const { reviewerId } = req.body;

    // Verify reviewer exists and has correct role
    const reviewer = await User.findOne({
      _id: reviewerId,
      role: { $in: ['admin', 'insurance_reviewer'] },
      isActive: true
    });

    if (!reviewer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid reviewer'
      });
    }

    const claim = await InsuranceClaim.findById(claimId);
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    claim.assignedTo = reviewerId;
    if (claim.status === 'submitted') {
      claim.status = 'under_review';
    }
    
    await claim.save();
    await claim.populate('assignedTo', 'firstName lastName');

    res.status(200).json({
      success: true,
      message: 'Claim assigned successfully',
      data: { claim }
    });
  } catch (error) {
    console.error('Assign claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign claim',
      error: error.message
    });
  }
};

// Review claim (approve/reject/request more info)
const reviewClaim = async (req, res) => {
  try {
    if (!['admin', 'insurance_reviewer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { claimId } = req.params;
    const { 
      status, 
      approvedAmount, 
      deductibleAmount, 
      copayAmount, 
      reviewerNotes, 
      rejectionReason 
    } = req.body;

    const claim = await InsuranceClaim.findById(claimId);
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    // Check if reviewer is assigned to this claim
    if (req.user.role === 'insurance_reviewer' && 
        claim.assignedTo?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this claim'
      });
    }

    // Update claim status and amounts
    claim.status = status;
    claim.notes.reviewerNotes = reviewerNotes;

    if (status === 'approved' || status === 'partially_approved') {
      claim.claimAmount.approvedAmount = approvedAmount;
      claim.claimAmount.deductibleAmount = deductibleAmount || 0;
      claim.claimAmount.copayAmount = copayAmount || 0;
      claim.approvedAt = new Date();
    } else if (status === 'rejected') {
      claim.notes.rejectionReason = rejectionReason;
      claim.rejectedAt = new Date();
    }

    claim.reviewedAt = new Date();

    // Calculate processing days
    if (claim.submittedAt) {
      const timeDiff = new Date() - claim.submittedAt;
      claim.processingDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    }

    // Add to review history
    claim.reviewHistory.push({
      reviewedBy: req.user._id,
      status,
      notes: reviewerNotes || rejectionReason,
      reviewedAt: new Date()
    });

    await claim.save();

    res.status(200).json({
      success: true,
      message: 'Claim reviewed successfully',
      data: { claim }
    });
  } catch (error) {
    console.error('Review claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review claim',
      error: error.message
    });
  }
};

// Mark claim as paid
const markClaimPaid = async (req, res) => {
  try {
    if (!['admin', 'insurance_reviewer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { claimId } = req.params;
    const { paymentReference, paidAmount } = req.body;

    const claim = await InsuranceClaim.findById(claimId);
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    if (!['approved', 'partially_approved'].includes(claim.status)) {
      return res.status(400).json({
        success: false,
        message: 'Only approved claims can be marked as paid'
      });
    }

    claim.status = 'paid';
    claim.paidAt = new Date();
    claim.paymentReference = paymentReference;
    claim.claimAmount.paidAmount = paidAmount || claim.claimAmount.approvedAmount;

    await claim.save();

    res.status(200).json({
      success: true,
      message: 'Claim marked as paid successfully',
      data: { claim }
    });
  } catch (error) {
    console.error('Mark claim paid error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark claim as paid',
      error: error.message
    });
  }
};

// Delete claim document
const deleteClaimDocument = async (req, res) => {
  try {
    const { claimId, documentId } = req.params;

    const claim = await InsuranceClaim.findOne({
      _id: claimId,
      patient: req.user._id
    });

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    if (claim.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete documents from submitted claim'
      });
    }

    const docIndex = claim.documents.findIndex(doc => doc._id.toString() === documentId);
    if (docIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const document = claim.documents[docIndex];

    // Delete from Cloudinary
    if (document.publicId) {
      try {
        await cloudinary.uploader.destroy(document.publicId);
      } catch (deleteError) {
        console.error('Error deleting from Cloudinary:', deleteError);
      }
    }

    // Remove from array
    claim.documents.splice(docIndex, 1);
    await claim.save();

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete claim document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message
    });
  }
};

// Get insurance analytics
const getInsuranceAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await Promise.all([
      // Claims by status
      InsuranceClaim.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),

      // Claims by type
      InsuranceClaim.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$claimType', count: { $sum: 1 } } }
      ]),

      // Financial summary
      InsuranceClaim.aggregate([
        { 
          $match: { 
            createdAt: { $gte: start, $lte: end },
            status: { $in: ['approved', 'partially_approved', 'paid'] }
          }
        },
        {
          $group: {
            _id: null,
            totalClaimedAmount: { $sum: '$claimAmount.claimedAmount' },
            totalApprovedAmount: { $sum: '$claimAmount.approvedAmount' },
            totalPaidAmount: { $sum: '$claimAmount.paidAmount' },
            count: { $sum: 1 }
          }
        }
      ]),

      // Average processing time
      InsuranceClaim.aggregate([
        { 
          $match: { 
            createdAt: { $gte: start, $lte: end },
            processingDays: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            averageProcessingDays: { $avg: '$processingDays' },
            count: { $sum: 1 }
          }
        }
      ]),

      // Top insurance providers
      InsuranceClaim.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$insuranceProvider.name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: { start, end },
        statusBreakdown: analytics[0],
        typeBreakdown: analytics[1],
        financialSummary: analytics[2][0] || { 
          totalClaimedAmount: 0, 
          totalApprovedAmount: 0, 
          totalPaidAmount: 0, 
          count: 0 
        },
        processingTime: analytics[3][0] || { averageProcessingDays: 0, count: 0 },
        topProviders: analytics[4]
      }
    });
  } catch (error) {
    console.error('Get insurance analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch insurance analytics',
      error: error.message
    });
  }
};

module.exports = {
  createClaim,
  uploadClaimDocuments,
  submitClaim,
  getUserClaims,
  getClaimById,
  getAllClaims,
  assignClaim,
  reviewClaim,
  markClaimPaid,
  deleteClaimDocument,
  getInsuranceAnalytics
};
