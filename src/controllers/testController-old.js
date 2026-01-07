const { TestPackage, TestBooking } = require('../models/TestPackage');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Get all test packages
const getTestPackages = async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      fastingRequired,
      homeCollection,
      search,
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

    // Fasting required filter
    if (fastingRequired !== undefined) {
      filter.fastingRequired = fastingRequired === 'true';
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

// Create test booking
const createTestBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const patientId = req.user._id;
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

    // Check if home collection is requested but not available
    if (type === 'home_visit' && !testPackage.homeCollectionAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Home collection not available for this test'
      });
    }

    // Calculate pricing
    let totalAmount = testPackage.discountPrice || testPackage.price;
    if (type === 'home_visit') {
      totalAmount += testPackage.homeCollectionFee;
    }
    
    const advanceAmount = Math.round(totalAmount * 0.3); // 30% advance

    // Create booking
    const booking = new TestBooking({
      patient: patientId,
      testPackage: testPackageId,
      appointmentDate: new Date(appointmentDate),
      timeSlot,
      type,
      selectedLab: type === 'lab_visit' ? selectedLab : undefined,
      homeAddress: type === 'home_visit' ? homeAddress : undefined,
      payment: {
        amount: totalAmount,
        advanceAmount
      },
      notes: {
        patientNotes: notes
      }
    });

    await booking.save();

    // Populate booking details
    await booking.populate([
      { path: 'testPackage', select: 'name description price discountPrice reportDeliveryTime' },
      { path: 'patient', select: 'firstName lastName email phone' }
    ]);

    // Update package booking count
    await TestPackage.findByIdAndUpdate(
      testPackageId,
      { $inc: { totalBookings: 1 } }
    );

    res.status(201).json({
      success: true,
      message: 'Test booking created successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Create test booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message
    });
  }
};

// Get user's test bookings
const getUserBookings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    let filter = { patient: userId };
    if (status) {
      filter.status = status;
    }

    const bookings = await TestBooking.find(filter)
      .populate('testPackage', 'name description price discountPrice reportDeliveryTime')
      .populate('labAssistant', 'firstName lastName labName phone')
      .sort({ createdAt: -1 })
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
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
};

// Get booking by ID
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const booking = await TestBooking.findById(id)
      .populate('testPackage')
      .populate('patient', 'firstName lastName email phone address')
      .populate('labAssistant', 'firstName lastName labName phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check access permissions
    const hasAccess = booking.patient._id.toString() === userId.toString() ||
                     (booking.labAssistant && booking.labAssistant._id.toString() === userId.toString()) ||
                     req.user.role === 'admin';

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
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message
    });
  }
};

// Update booking status (lab assistant only)
const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const labAssistantId = req.user._id;

    if (req.user.role !== 'lab_assistant' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only lab assistants can update booking status'
      });
    }

    const booking = await TestBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Assign lab assistant if not already assigned
    if (!booking.labAssistant) {
      booking.labAssistant = labAssistantId;
    }

    booking.status = status;
    
    if (notes) {
      booking.notes.labNotes = notes;
    }

    // Add sample collection details if status is sample_collected
    if (status === 'sample_collected') {
      booking.sampleCollectionDetails = {
        collectedAt: new Date(),
        collectedBy: labAssistantId,
        sampleId: `S${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`
      };
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
    const { id } = req.params;
    const { reportUrl } = req.body;
    const labAssistantId = req.user._id;

    if (req.user.role !== 'lab_assistant' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only lab assistants can upload test reports'
      });
    }

    const booking = await TestBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Can only upload report when booking is in processing status'
      });
    }

    booking.testReport = {
      reportUrl,
      uploadedAt: new Date(),
      uploadedBy: labAssistantId
    };
    booking.status = 'completed';

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Test report uploaded successfully',
      data: { booking }
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

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const booking = await TestBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user can cancel this booking
    if (booking.patient.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if booking can be cancelled
    if (['sample_collected', 'processing', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel booking at this stage'
      });
    }

    booking.status = 'cancelled';
    booking.notes.patientNotes = reason;

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message
    });
  }
};

// Get lab assistant's assigned bookings
const getLabBookings = async (req, res) => {
  try {
    if (req.user.role !== 'lab_assistant') {
      return res.status(403).json({
        success: false,
        message: 'Only lab assistants can access this endpoint'
      });
    }

    const labAssistantId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    let filter = { labAssistant: labAssistantId };
    if (status) {
      filter.status = status;
    }

    const bookings = await TestBooking.find(filter)
      .populate('testPackage', 'name description tests')
      .populate('patient', 'firstName lastName email phone')
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
    console.error('Get lab bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lab bookings',
      error: error.message
    });
  }
};

// Get test package categories
const getTestCategories = async (req, res) => {
  try {
    const categories = await TestPackage.distinct('category', { isActive: true });
    
    res.status(200).json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    console.error('Get test categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

module.exports = {
  getTestPackages,
  getTestPackageById,
  createTestBooking,
  getUserBookings,
  getBookingById,
  updateBookingStatus,
  uploadTestReport,
  cancelBooking,
  getLabBookings,
  getTestCategories
};
