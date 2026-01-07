const { TestPackage, TestBooking } = require('../models/TestPackage');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const cloudinary = require('../config/cloudinary');
const Razorpay = require('razorpay');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Get all test packages
const getTestPackages = async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      search,
      homeCollection,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    let filter = { isActive: true };

    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'tests.testName': { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Home collection filter
    if (homeCollection !== undefined) {
      filter.homeCollectionAvailable = homeCollection === 'true';
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'price') {
      sortOptions.price = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'popularity') {
      sortOptions.totalBookings = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const testPackages = await TestPackage.find(filter)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await TestPackage.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        testPackages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get test packages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test packages',
      error: error.message
    });
  }
};

// Get test package by ID
const getTestPackageById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const testPackage = await TestPackage.findOne({
      _id: id,
      isActive: true
    });

    if (!testPackage) {
      return res.status(404).json({
        success: false,
        message: 'Test package not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { testPackage }
    });
  } catch (error) {
    console.error('Get test package error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test package',
      error: error.message
    });
  }
};

// Book test appointment
const bookTestAppointment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    // Check if patient has complete address
    const patient = await User.findById(req.user._id);
    if (!patient || !patient.address || !patient.address.street || !patient.address.city || !patient.address.state || !patient.address.zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile address before booking a lab test. Address (street, city, state, and zip code) is required.'
      });
    }

    const {
      testPackageId,
      appointmentDate,
      timeSlot,
      type, // 'home_visit' or 'lab_visit'
      selectedLab,
      homeAddress,
      notes
    } = req.body;

    // Verify test package exists
    const testPackage = await TestPackage.findOne({
      _id: testPackageId,
      isActive: true
    });

    if (!testPackage) {
      return res.status(404).json({
        success: false,
        message: 'Test package not found'
      });
    }

    // Check if home collection is available if requested
    if (type === 'home_visit' && !testPackage.homeCollectionAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Home collection not available for this test'
      });
    }

    // Calculate total amount
    let totalAmount = testPackage.discountPrice || testPackage.price;
    if (type === 'home_visit') {
      totalAmount += testPackage.homeCollectionFee;
    }

    const advanceAmount = Math.round(totalAmount * 0.3); // 30% advance

    // Create booking
    const booking = new TestBooking({
      patient: req.user._id,
      testPackage: testPackageId,
      appointmentDate: new Date(appointmentDate),
      timeSlot,
      type,
      selectedLab: type === 'lab_visit' ? selectedLab : undefined,
      homeAddress: type === 'home_visit' ? homeAddress : undefined,
      payment: {
        amount: totalAmount,
        advanceAmount,
        status: 'pending'
      },
      notes: {
        patientNotes: notes
      }
    });

    await booking.save();

    // Populate booking details
    await booking.populate([
      { path: 'testPackage', select: 'name category price tests preparationInstructions' },
      { path: 'patient', select: 'firstName lastName email phone' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Test appointment booked successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Book test appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book test appointment',
      error: error.message
    });
  }
};

// Get user's test bookings
const getUserTestBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    let filter = { patient: userId };
    if (status) {
      filter.status = status;
    }

    const bookings = await TestBooking.find(filter)
      .populate('testPackage', 'name category price tests reportDeliveryTime')
      .populate('labAssistant', 'firstName lastName phone')
      .sort({ appointmentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await TestBooking.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user test bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test bookings',
      error: error.message
    });
  }
};

// Get test booking by ID
const getTestBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const booking = await TestBooking.findById(id)
      .populate('testPackage')
      .populate('patient', 'firstName lastName email phone dateOfBirth')
      .populate('labAssistant', 'firstName lastName phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Test booking not found'
      });
    }

    // Check access rights
    const hasAccess = req.user.role === 'admin' || 
                     req.user.role === 'lab_assistant' ||
                     booking.patient._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { booking }
    });
  } catch (error) {
    console.error('Get test booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test booking',
      error: error.message
    });
  }
};

// Update booking status (lab assistant/admin only)
const updateBookingStatus = async (req, res) => {
  try {
    if (!['admin', 'lab_assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { id } = req.params;
    const { status, notes, sampleId } = req.body;

    const booking = await TestBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.status = status;
    
    if (notes) {
      booking.notes.labNotes = notes;
    }

    // If sample is collected, record details
    if (status === 'sample_collected') {
      booking.sampleCollectionDetails = {
        collectedAt: new Date(),
        collectedBy: req.user._id,
        sampleId: sampleId || `SAMPLE-${Date.now()}`
      };
      
      // Assign lab assistant if not already assigned
      if (!booking.labAssistant) {
        booking.labAssistant = req.user._id;
      }
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
      error: error.message
    });
  }
};

// Upload test report (lab assistant only)
const uploadTestReport = async (req, res) => {
  try {
    if (req.user.role !== 'lab_assistant' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only lab assistants can upload test reports'
      });
    }

    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No report file provided'
      });
    }

    const booking = await TestBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Upload to cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'healthcare/test-reports',
      resource_type: 'auto',
      transformation: [
        { quality: 'auto', format: 'auto' }
      ]
    });

    // Update booking with report details
    booking.testReport = {
      reportUrl: result.secure_url,
      uploadedAt: new Date(),
      uploadedBy: req.user._id
    };
    
    booking.status = 'completed';
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Test report uploaded successfully',
      data: {
        reportUrl: result.secure_url
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

// Download test report
const downloadTestReport = async (req, res) => {
  try {
    const { id } = req.params;
    
    const booking = await TestBooking.findById(id)
      .populate('patient', 'firstName lastName')
      .populate('testPackage', 'name');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check access rights
    const hasAccess = req.user.role === 'admin' || 
                     booking.patient._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!booking.testReport || !booking.testReport.reportUrl) {
      return res.status(404).json({
        success: false,
        message: 'Test report not available'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Test report ready for download',
      data: {
        reportUrl: booking.testReport.reportUrl,
        testName: booking.testPackage.name,
        patientName: `${booking.patient.firstName} ${booking.patient.lastName}`,
        uploadedAt: booking.testReport.uploadedAt
      }
    });
  } catch (error) {
    console.error('Download test report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download test report',
      error: error.message
    });
  }
};

// Cancel test booking
const cancelTestBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const booking = await TestBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user can cancel
    const canCancel = req.user.role === 'admin' || 
                     (booking.patient.toString() === req.user._id.toString() && 
                      ['pending', 'confirmed'].includes(booking.status));

    if (!canCancel) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel booking at this stage'
      });
    }

    booking.status = 'cancelled';
    booking.notes.patientNotes = reason;

    // Process refund if payment was made
    if (booking.payment.status === 'paid' && booking.payment.paymentId) {
      try {
        const refundAmount = booking.payment.advanceAmount;
        
        // Update refund status to processing
        booking.payment.refund.status = 'processing';
        booking.payment.refund.amount = refundAmount;
        booking.payment.refund.reason = reason || 'Booking cancelled by customer';
        booking.payment.refund.initiatedAt = new Date();
        booking.payment.refund.notes = `Refund initiated automatically on cancellation. Original payment ID: ${booking.payment.paymentId}`;

        // Initiate refund with Razorpay
        const refund = await razorpay.payments.refund(booking.payment.paymentId, {
          amount: Math.round(refundAmount * 100), // Convert to paise
          notes: {
            reason: reason || 'Test booking cancelled',
            booking_id: booking._id.toString(),
            cancelled_by: req.user._id.toString(),
            refund_type: 'advance_payment'
          }
        });

        // Update booking with refund details
        booking.payment.refund.refundId = refund.id;
        booking.payment.refund.status = refund.status === 'processed' ? 'completed' : 'pending';
        
        if (refund.status === 'processed') {
          booking.payment.refund.completedAt = new Date();
        }

        await booking.save();

        res.status(200).json({
          success: true,
          message: 'Test booking cancelled successfully. Refund has been initiated and will be processed shortly.',
          data: { 
            booking,
            refund: {
              refundId: refund.id,
              amount: refundAmount,
              status: booking.payment.refund.status,
              message: 'Your advance payment will be refunded to your original payment method within 5-7 business days.'
            }
          }
        });
      } catch (refundError) {
        console.error('Refund processing error:', refundError);
        
        // Mark refund as failed but still cancel the booking
        booking.payment.refund.status = 'failed';
        booking.payment.refund.notes = `Refund failed: ${refundError.message || 'Unknown error'}. Please contact support for manual refund.`;
        await booking.save();

        res.status(200).json({
          success: true,
          message: 'Test booking cancelled successfully. However, refund processing encountered an issue. Please contact support for assistance.',
          data: { 
            booking,
            refund: {
              status: 'failed',
              message: 'Refund processing failed. Please contact customer support with your booking ID for manual refund processing.'
            }
          },
          warning: 'Refund processing failed. Please contact support.'
        });
      }
    } else {
      // No payment made, just cancel the booking
      await booking.save();

      res.status(200).json({
        success: true,
        message: 'Test booking cancelled successfully',
        data: { booking }
      });
    }
  } catch (error) {
    console.error('Cancel test booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message
    });
  }
};

// Get lab assistant bookings
const getLabAssistantBookings = async (req, res) => {
  try {
    if (req.user.role !== 'lab_assistant' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { status, date, page = 1, limit = 10 } = req.query;
    
    let filter = {};
    
    if (req.user.role === 'lab_assistant') {
      filter.labAssistant = req.user._id;
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      
      filter.appointmentDate = {
        $gte: startDate,
        $lt: endDate
      };
    }

    const bookings = await TestBooking.find(filter)
      .populate('testPackage', 'name category tests sampleType')
      .populate('patient', 'firstName lastName phone email')
      .sort({ appointmentDate: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await TestBooking.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get lab assistant bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
};

module.exports = {
  getTestPackages,
  getTestPackageById,
  bookTestAppointment,
  getUserTestBookings,
  getTestBookingById,
  updateBookingStatus,
  uploadTestReport,
  downloadTestReport,
  cancelTestBooking,
  getLabAssistantBookings
};
