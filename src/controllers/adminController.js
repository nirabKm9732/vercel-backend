const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Medicine = require('../models/Medicine');
const MedicineOrder = require('../models/MedicineOrder');
const { TestPackage, TestBooking } = require('../models/TestPackage');
const { Hospital, HospitalBooking } = require('../models/Hospital');
const Blog = require('../models/Blog');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Middleware to ensure admin access
const ensureAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

// Dashboard Overview
const getDashboardOverview = async (req, res) => {
  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    // Get overview statistics
    const [
      totalUsers,
      totalDoctors,
      totalPatients,
      totalAppointments,
      todayAppointments,
      thisMonthAppointments,
      totalRevenue,
      thisMonthRevenue,
      pendingApprovals,
      activeTests,
      hospitalAdmissions
    ] = await Promise.all([
      // User statistics
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'doctor', isActive: true }),
      User.countDocuments({ role: 'patient', isActive: true }),
      
      // Appointment statistics
      Appointment.countDocuments(),
      Appointment.countDocuments({
        appointmentDate: { $gte: today, $lt: new Date(today.getTime() + 24*60*60*1000) }
      }),
      Appointment.countDocuments({
        appointmentDate: { $gte: thisMonth }
      }),
      
      // Revenue statistics
      Appointment.aggregate([
        { $match: { 'payment.finalPaymentStatus': 'paid' } },
        { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
      ]),
      Appointment.aggregate([
        { 
          $match: { 
            'payment.finalPaymentStatus': 'paid',
            createdAt: { $gte: thisMonth }
          }
        },
        { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
      ]),
      
      // Pending approvals
      User.countDocuments({ isVerified: false, role: { $in: ['doctor', 'hospital'] } }),
      
      // Active tests
      TestBooking.countDocuments({ status: { $in: ['confirmed', 'sample_collected', 'processing'] } }),
      
      // Hospital admissions
      HospitalBooking.countDocuments({ status: 'admitted' })
    ]);

    // Recent activities
    const recentAppointments = await Appointment.find()
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentUsers = await User.find({ isActive: true })
      .select('firstName lastName role createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    // Monthly statistics for charts
    const monthlyStats = await Appointment.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(today.getFullYear(), today.getMonth() - 11, 1) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          appointments: { $sum: 1 },
          revenue: { $sum: '$payment.totalAmount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalDoctors,
          totalPatients,
          totalAppointments,
          todayAppointments,
          thisMonthAppointments,
          totalRevenue: totalRevenue[0]?.total || 0,
          thisMonthRevenue: thisMonthRevenue[0]?.total || 0,
          pendingApprovals,
          activeTests,
          hospitalAdmissions
        },
        recentActivities: {
          appointments: recentAppointments,
          users: recentUsers
        },
        monthlyStats
      }
    });
  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard overview',
      error: error.message
    });
  }
};

// User Management
const getAllUsers = async (req, res) => {
  try {
    const {
      role,
      isVerified,
      isActive,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let filter = {};

    if (role) filter.role = role;
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(filter)
      .select('-password')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user-specific statistics
    let userStats = {};
    
    if (user.role === 'doctor') {
      const [appointmentCount, totalRevenue, averageRating] = await Promise.all([
        Appointment.countDocuments({ doctor: id }),
        Appointment.aggregate([
          { $match: { doctor: mongoose.Types.ObjectId(id), 'payment.finalPaymentStatus': 'paid' } },
          { $group: { _id: null, total: { $sum: '$payment.totalAmount' } } }
        ]),
        Appointment.aggregate([
          { $match: { doctor: mongoose.Types.ObjectId(id), rating: { $exists: true } } },
          { $group: { _id: null, avgRating: { $avg: '$rating' } } }
        ])
      ]);

      userStats = {
        appointmentCount,
        totalRevenue: totalRevenue[0]?.total || 0,
        averageRating: averageRating[0]?.avgRating || 0
      };
    } else if (user.role === 'patient') {
      const [appointmentCount, medicineOrderCount, testBookingCount] = await Promise.all([
        Appointment.countDocuments({ patient: id }),
        MedicineOrder.countDocuments({ patient: id }),
        TestBooking.countDocuments({ patient: id })
      ]);

      userStats = {
        appointmentCount,
        medicineOrderCount,
        testBookingCount
      };
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        stats: userStats
      }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow password updates through this endpoint
    delete updates.password;

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deactivated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user',
      error: error.message
    });
  }
};

const verifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified, notes } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { 
        isVerified: verified,
        verificationNotes: notes,
        verifiedBy: req.user._id,
        verifiedAt: verified ? new Date() : null
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${verified ? 'verified' : 'unverified'} successfully`,
      data: { user }
    });
  } catch (error) {
    console.error('Verify user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user verification',
      error: error.message
    });
  }
};

// Appointment Management
const getAllAppointments = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      consultationType,
      startDate,
      endDate,
      doctorId,
      patientId,
      page = 1,
      limit = 20
    } = req.query;

    let filter = {};

    if (status) filter.status = status;
    if (paymentStatus) filter['payment.finalPaymentStatus'] = paymentStatus;
    if (consultationType) filter.consultationType = consultationType;
    if (doctorId) filter.doctor = doctorId;
    if (patientId) filter.patient = patientId;

    if (startDate || endDate) {
      filter.appointmentDate = {};
      if (startDate) filter.appointmentDate.$gte = new Date(startDate);
      if (endDate) filter.appointmentDate.$lte = new Date(endDate);
    }

    const appointments = await Appointment.find(filter)
      .populate('doctor', 'firstName lastName specialization')
      .populate('patient', 'firstName lastName email phone')
      .sort({ appointmentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Appointment.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        appointments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const appointment = await Appointment.findByIdAndUpdate(
      id,
      { 
        status,
        adminNotes,
        updatedBy: req.user._id
      },
      { new: true }
    ).populate('doctor', 'firstName lastName')
      .populate('patient', 'firstName lastName');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Appointment status updated successfully',
      data: { appointment }
    });
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update appointment status',
      error: error.message
    });
  }
};

// Medicine Management
const getAllMedicines = async (req, res) => {
  try {
    const {
      search,
      category,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    let filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const medicines = await Medicine.find(filter)
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Medicine.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        medicines,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all medicines error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicines',
      error: error.message
    });
  }
};

const createMedicine = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const medicine = new Medicine({
      ...req.body,
      createdBy: req.user._id
    });

    await medicine.save();

    res.status(201).json({
      success: true,
      message: 'Medicine created successfully',
      data: { medicine }
    });
  } catch (error) {
    console.error('Create medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create medicine',
      error: error.message
    });
  }
};

const updateMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const medicine = await Medicine.findByIdAndUpdate(
      id,
      { ...updates, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Medicine updated successfully',
      data: { medicine }
    });
  } catch (error) {
    console.error('Update medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update medicine',
      error: error.message
    });
  }
};

// Test Package Management
const getAllTestPackages = async (req, res) => {
  try {
    const {
      search,
      category,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    let filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const testPackages = await TestPackage.find(filter)
      .sort({ name: 1 })
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
    console.error('Get all test packages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test packages',
      error: error.message
    });
  }
};

const createTestPackage = async (req, res) => {
  try {
    const testPackage = new TestPackage({
      ...req.body,
      createdBy: req.user._id
    });

    await testPackage.save();

    res.status(201).json({
      success: true,
      message: 'Test package created successfully',
      data: { testPackage }
    });
  } catch (error) {
    console.error('Create test package error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test package',
      error: error.message
    });
  }
};

// Hospital Management
const getAllHospitals = async (req, res) => {
  try {
    const {
      search,
      city,
      type,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    let filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (city) filter['address.city'] = { $regex: city, $options: 'i' };
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const hospitals = await Hospital.find(filter)
      .sort({ name: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Hospital.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        hospitals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospitals',
      error: error.message
    });
  }
};

// Reports and Analytics
const getSystemReports = async (req, res) => {
  try {
    const { reportType, startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let reportData = {};

    switch (reportType) {
      case 'revenue':
        reportData = await generateRevenueReport(start, end);
        break;
      case 'appointments':
        reportData = await generateAppointmentReport(start, end);
        break;
      case 'users':
        reportData = await generateUserReport(start, end);
        break;
      case 'medicines':
        reportData = await generateMedicineReport(start, end);
        break;
      default:
        // Generate comprehensive report
        reportData = {
          revenue: await generateRevenueReport(start, end),
          appointments: await generateAppointmentReport(start, end),
          users: await generateUserReport(start, end),
          medicines: await generateMedicineReport(start, end)
        };
    }

    res.status(200).json({
      success: true,
      data: {
        reportType: reportType || 'comprehensive',
        period: { start, end },
        ...reportData
      }
    });
  } catch (error) {
    console.error('Get system reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate reports',
      error: error.message
    });
  }
};

// Helper functions for reports
const generateRevenueReport = async (start, end) => {
  const [appointmentRevenue, medicineRevenue, testRevenue, hospitalRevenue] = await Promise.all([
    Appointment.aggregate([
      {
        $match: {
          'payment.finalPaymentStatus': 'paid',
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment.totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]),
    MedicineOrder.aggregate([
      {
        $match: {
          'payment.status': 'completed',
          'payment.paidAt': { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
          count: { $sum: 1 }
        }
      }
    ]),
    TestBooking.aggregate([
      {
        $match: {
          'payment.status': 'paid',
          'payment.paidAt': { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment.amount' },
          count: { $sum: 1 }
        }
      }
    ]),
    HospitalBooking.aggregate([
      {
        $match: {
          'payment.status': { $in: ['advance_paid', 'fully_paid'] },
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment.advanceAmount' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  return {
    appointments: appointmentRevenue[0] || { total: 0, count: 0 },
    medicines: medicineRevenue[0] || { total: 0, count: 0 },
    tests: testRevenue[0] || { total: 0, count: 0 },
    hospitals: hospitalRevenue[0] || { total: 0, count: 0 }
  };
};

const generateAppointmentReport = async (start, end) => {
  return await Appointment.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

const generateUserReport = async (start, end) => {
  return await User.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 }
      }
    }
  ]);
};

const generateMedicineReport = async (start, end) => {
  return await MedicineOrder.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$pricing.total' }
      }
    }
  ]);
};

module.exports = {
  ensureAdmin,
  getDashboardOverview,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  verifyUser,
  getAllAppointments,
  updateAppointmentStatus,
  getAllMedicines,
  createMedicine,
  updateMedicine,
  getAllTestPackages,
  createTestPackage,
  getAllHospitals,
  getSystemReports
};
