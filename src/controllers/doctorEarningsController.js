const Appointment = require('../models/Appointment');

// Get doctor earnings summary
const getEarningsSummary = async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can access earnings'
      });
    }

    const doctorId = req.user._id;
    const { period = 'month' } = req.query; // day, week, month, year, all

    // Calculate date range based on period
    let startDate = new Date();
    const endDate = new Date();

    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'all':
        startDate = null;
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    const filter = {
      doctor: doctorId,
      status: 'completed',
      'payment.finalPaymentStatus': 'paid'
    };

    if (startDate) {
      filter.appointmentDate = { $gte: startDate, $lte: endDate };
    } else {
      filter.appointmentDate = { $lte: endDate };
    }

    // Get all completed and paid appointments
    const appointments = await Appointment.find(filter)
      .populate('patient', 'firstName lastName')
      .sort({ appointmentDate: -1 });

    // Calculate earnings
    const totalEarnings = appointments.reduce((sum, apt) => {
      return sum + (apt.payment?.totalAmount || 0);
    }, 0);

    // Calculate pending earnings (completed but not paid)
    const pendingFilter = {
      doctor: doctorId,
      status: 'completed',
      'payment.finalPaymentStatus': { $ne: 'paid' }
    };
    if (startDate) {
      pendingFilter.appointmentDate = { $gte: startDate, $lte: endDate };
    } else {
      pendingFilter.appointmentDate = { $lte: endDate };
    }

    const pendingAppointments = await Appointment.find(pendingFilter);
    const pendingEarnings = pendingAppointments.reduce((sum, apt) => {
      return sum + (apt.payment?.totalAmount || 0);
    }, 0);

    // Calculate by status
    const totalAppointments = appointments.length;
    const totalPending = pendingAppointments.length;

    // Calculate monthly breakdown for the last 12 months
    const monthlyBreakdown = await Appointment.aggregate([
      {
        $match: {
          doctor: doctorId,
          status: 'completed',
          'payment.finalPaymentStatus': 'paid',
          appointmentDate: {
            $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1))
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$appointmentDate' },
            month: { $month: '$appointmentDate' }
          },
          totalEarnings: { $sum: '$payment.totalAmount' },
          appointmentCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalEarnings,
          pendingEarnings,
          totalAppointments,
          totalPending,
          period
        },
        monthlyBreakdown,
        recentPayments: appointments.slice(0, 10).map(apt => ({
          id: apt._id,
          patientName: `${apt.patient.firstName} ${apt.patient.lastName}`,
          appointmentDate: apt.appointmentDate,
          amount: apt.payment?.totalAmount || 0,
          paymentStatus: apt.payment?.finalPaymentStatus || 'pending',
          consultationType: apt.consultationType
        }))
      }
    });
  } catch (error) {
    console.error('Get earnings summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings summary',
      error: error.message
    });
  }
};

// Get payment history with filters
const getPaymentHistory = async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can access payment history'
      });
    }

    const doctorId = req.user._id;
    const {
      status = 'all', // all, paid, pending
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    const filter = {
      doctor: doctorId,
      status: 'completed'
    };

    // Filter by payment status
    if (status === 'paid') {
      filter['payment.finalPaymentStatus'] = 'paid';
    } else if (status === 'pending') {
      filter['payment.finalPaymentStatus'] = { $ne: 'paid' };
    }

    // Date range filter
    if (startDate || endDate) {
      filter.appointmentDate = {};
      if (startDate) filter.appointmentDate.$gte = new Date(startDate);
      if (endDate) filter.appointmentDate.$lte = new Date(endDate);
    }

    const appointments = await Appointment.find(filter)
      .populate('patient', 'firstName lastName email phone')
      .sort({ appointmentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Appointment.countDocuments(filter);

    const payments = appointments.map(apt => ({
      id: apt._id,
      patient: {
        name: `${apt.patient.firstName} ${apt.patient.lastName}`,
        email: apt.patient.email,
        phone: apt.patient.phone
      },
      appointmentDate: apt.appointmentDate,
      timeSlot: apt.timeSlot,
      consultationType: apt.consultationType,
      amount: apt.payment?.totalAmount || 0,
      advanceAmount: apt.payment?.advanceAmount || 0,
      remainingAmount: apt.payment?.remainingAmount || 0,
      advancePaymentStatus: apt.payment?.advancePaymentStatus || 'pending',
      finalPaymentStatus: apt.payment?.finalPaymentStatus || 'pending',
      paymentId: apt.payment?.paymentId,
      orderId: apt.payment?.orderId,
      createdAt: apt.createdAt,
      updatedAt: apt.updatedAt
    }));

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message
    });
  }
};

// Get earnings statistics
const getEarningsStats = async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can access earnings stats'
      });
    }

    const doctorId = req.user._id;
    const { startDate, endDate } = req.query;

    const filter = {
      doctor: doctorId,
      status: 'completed',
      'payment.finalPaymentStatus': 'paid'
    };

    if (startDate || endDate) {
      filter.appointmentDate = {};
      if (startDate) filter.appointmentDate.$gte = new Date(startDate);
      if (endDate) filter.appointmentDate.$lte = new Date(endDate);
    }

    // Get statistics
    const stats = await Appointment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$payment.totalAmount' },
          totalAppointments: { $sum: 1 },
          avgEarningPerAppointment: { $avg: '$payment.totalAmount' },
          minEarning: { $min: '$payment.totalAmount' },
          maxEarning: { $max: '$payment.totalAmount' }
        }
      }
    ]);

    // Get earnings by consultation type
    const earningsByType = await Appointment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$consultationType',
          totalEarnings: { $sum: '$payment.totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get daily earnings for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const dailyEarnings = await Appointment.aggregate([
      {
        $match: {
          ...filter,
          appointmentDate: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$appointmentDate' },
            month: { $month: '$appointmentDate' },
            day: { $dayOfMonth: '$appointmentDate' }
          },
          totalEarnings: { $sum: '$payment.totalAmount' },
          appointmentCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        stats: stats[0] || {
          totalEarnings: 0,
          totalAppointments: 0,
          avgEarningPerAppointment: 0,
          minEarning: 0,
          maxEarning: 0
        },
        earningsByType,
        dailyEarnings
      }
    });
  } catch (error) {
    console.error('Get earnings stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch earnings statistics',
      error: error.message
    });
  }
};

module.exports = {
  getEarningsSummary,
  getPaymentHistory,
  getEarningsStats
};







