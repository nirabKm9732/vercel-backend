const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { validationResult } = require('express-validator');
const moment = require('moment');

// Get doctor's availability for a specific date or date range
const getDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, startDate, endDate } = req.query;

    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor',
      isActive: true,
      isVerified: true
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    let availabilityData = {};

    if (date) {
      // Get availability for a specific date
      availabilityData = await getDayAvailability(doctorId, new Date(date));
    } else if (startDate && endDate) {
      // Get availability for a date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = [];
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayAvailability = await getDayAvailability(doctorId, new Date(d));
        days.push({
          date: new Date(d).toISOString().split('T')[0],
          ...dayAvailability
        });
      }
      
      availabilityData = { days };
    } else {
      // Get next 7 days availability by default
      const today = new Date();
      const days = [];
      
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + i);
        
        const dayAvailability = await getDayAvailability(doctorId, currentDate);
        days.push({
          date: currentDate.toISOString().split('T')[0],
          ...dayAvailability
        });
      }
      
      availabilityData = { days };
    }

    res.status(200).json({
      success: true,
      data: {
        doctor: {
          id: doctor._id,
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specialization,
          consultationFee: doctor.consultationFee,
          consultationModes: doctor.consultationModes || ['in-person']
        },
        availability: availabilityData
      }
    });
  } catch (error) {
    console.error('Get doctor availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor availability',
      error: error.message
    });
  }
};

// Helper function to get availability for a specific day
const getDayAvailability = async (doctorId, date) => {
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  
  const doctor = await User.findById(doctorId);
  const doctorAvailability = doctor.availability?.[dayOfWeek];

  if (!doctorAvailability || !doctorAvailability.isAvailable) {
    return {
      isAvailable: false,
      timeSlots: [],
      reason: 'Doctor not available on this day'
    };
  }

  // Check if the date is in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return {
      isAvailable: false,
      timeSlots: [],
      reason: 'Date is in the past'
    };
  }

  // Get existing appointments for this date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const existingAppointments = await Appointment.find({
    doctor: doctorId,
    appointmentDate: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['confirmed', 'scheduled', 'in_progress'] }
  }).select('timeSlot appointmentDate');

  const bookedSlots = existingAppointments.map(apt => apt.timeSlot);

  // Generate available time slots
  const timeSlots = generateTimeSlots(
    doctorAvailability.startTime,
    doctorAvailability.endTime,
    doctor.consultationDuration || 30,
    bookedSlots,
    date
  );

  return {
    isAvailable: timeSlots.length > 0,
    timeSlots,
    workingHours: {
      start: doctorAvailability.startTime,
      end: doctorAvailability.endTime
    },
    consultationDuration: doctor.consultationDuration || 30
  };
};

// Helper function to generate time slots
const generateTimeSlots = (startTime, endTime, duration, bookedSlots, date) => {
  const slots = [];
  const start = moment(startTime, 'HH:mm');
  const end = moment(endTime, 'HH:mm');
  const now = moment();
  const slotDate = moment(date);

  // If it's today, start from current time + buffer
  const isToday = slotDate.isSame(now, 'day');
  const currentTime = isToday ? now.add(30, 'minutes') : start; // 30 min buffer for same day

  let current = moment.max(start, currentTime);

  while (current.clone().add(duration, 'minutes').isSameOrBefore(end)) {
    const timeSlot = current.format('HH:mm');
    const endSlot = current.clone().add(duration, 'minutes').format('HH:mm');
    
    // Check if slot is not already booked
    if (!bookedSlots.includes(timeSlot)) {
      slots.push({
        startTime: timeSlot,
        endTime: endSlot,
        available: true,
        displayTime: current.format('h:mm A')
      });
    } else {
      slots.push({
        startTime: timeSlot,
        endTime: endSlot,
        available: false,
        displayTime: current.format('h:mm A'),
        reason: 'Already booked'
      });
    }

    current.add(duration, 'minutes');
  }

  return slots.filter(slot => slot.available); // Only return available slots
};

// Book an appointment with time slot validation
const bookAppointment = async (req, res) => {
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
    
    // Check if patient has complete address
    const patient = await User.findById(patientId);
    if (!patient || !patient.address || !patient.address.street || !patient.address.city || !patient.address.state || !patient.address.zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile address before booking an appointment. Address (street, city, state, and zip code) is required.'
      });
    }

    const {
      doctorId,
      appointmentDate,
      timeSlot,
      consultationType = 'in-person',
      reasonForVisit,
      symptoms,
      duration
    } = req.body;

    // Validate doctor
    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor',
      isActive: true,
      isVerified: true
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Validate appointment date and time slot
    const appointmentDateTime = new Date(appointmentDate);
    const dayAvailability = await getDayAvailability(doctorId, appointmentDateTime);

    if (!dayAvailability.isAvailable) {
      return res.status(400).json({
        success: false,
        message: dayAvailability.reason || 'Doctor not available on this date'
      });
    }

    // Check if the specific time slot is available
    const isSlotAvailable = dayAvailability.timeSlots.some(slot => 
      slot.startTime === timeSlot && slot.available
    );

    if (!isSlotAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is not available'
      });
    }

    // Check for existing appointment at the same time
    const existingAppointment = await Appointment.findOne({
      doctor: doctorId,
      appointmentDate: appointmentDateTime,
      timeSlot,
      status: { $in: ['confirmed', 'scheduled', 'in_progress'] }
    });

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: 'Time slot already booked'
      });
    }

    // Check if patient has another appointment at the same time
    const patientConflict = await Appointment.findOne({
      patient: patientId,
      appointmentDate: appointmentDateTime,
      timeSlot,
      status: { $in: ['confirmed', 'scheduled', 'in_progress'] }
    });

    if (patientConflict) {
      return res.status(400).json({
        success: false,
        message: 'You already have an appointment at this time'
      });
    }

    // Create appointment
    const appointment = new Appointment({
      patient: patientId,
      doctor: doctorId,
      appointmentDate: appointmentDateTime,
      timeSlot,
      consultationType,
      reasonForVisit,
      symptoms,
      duration: duration || doctor.consultationDuration || 30,
      status: 'scheduled',
      payment: {
        totalAmount: doctor.consultationFee,
        advanceAmount: Math.round(doctor.consultationFee * 0.1), // 10% advance
        remainingAmount: Math.round(doctor.consultationFee * 0.9),
        advancePaymentStatus: 'pending',
        finalPaymentStatus: 'pending'
      }
    });

    await appointment.save();

    // Populate appointment details
    await appointment.populate([
      { path: 'doctor', select: 'firstName lastName specialization consultationFee profileImage' },
      { path: 'patient', select: 'firstName lastName email phone' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Appointment scheduled successfully',
      data: { appointment }
    });
  } catch (error) {
    console.error('Book appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to book appointment',
      error: error.message
    });
  }
};

// Reschedule an existing appointment
const rescheduleAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { newDate, newTimeSlot } = req.body;

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user has permission to reschedule
    const canReschedule = req.user.role === 'admin' ||
                         appointment.patient.toString() === req.user._id.toString() ||
                         appointment.doctor.toString() === req.user._id.toString();

    if (!canReschedule) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reschedule this appointment'
      });
    }

    // Check if appointment can be rescheduled
    if (!['scheduled', 'confirmed'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: 'Appointment cannot be rescheduled in current status'
      });
    }

    // Validate new time slot availability
    const newDateTime = new Date(newDate);
    const dayAvailability = await getDayAvailability(appointment.doctor, newDateTime);

    if (!dayAvailability.isAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Doctor not available on the selected date'
      });
    }

    const isNewSlotAvailable = dayAvailability.timeSlots.some(slot => 
      slot.startTime === newTimeSlot && slot.available
    );

    if (!isNewSlotAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Selected time slot is not available'
      });
    }

    // Update appointment
    const oldDate = appointment.appointmentDate;
    const oldTimeSlot = appointment.timeSlot;

    appointment.appointmentDate = newDateTime;
    appointment.timeSlot = newTimeSlot;
    appointment.rescheduledFrom = {
      date: oldDate,
      timeSlot: oldTimeSlot,
      rescheduledAt: new Date(),
      rescheduledBy: req.user._id
    };

    await appointment.save();
    await appointment.populate([
      { path: 'doctor', select: 'firstName lastName specialization' },
      { path: 'patient', select: 'firstName lastName email phone' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Appointment rescheduled successfully',
      data: { appointment }
    });
  } catch (error) {
    console.error('Reschedule appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule appointment',
      error: error.message
    });
  }
};

// Cancel an appointment
const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { reason } = req.body;

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user has permission to cancel
    const canCancel = req.user.role === 'admin' ||
                     appointment.patient.toString() === req.user._id.toString() ||
                     appointment.doctor.toString() === req.user._id.toString();

    if (!canCancel) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this appointment'
      });
    }

    // Check cancellation policy (e.g., can't cancel within 2 hours)
    const now = new Date();
    const appointmentTime = new Date(appointment.appointmentDate);
    const hoursUntilAppointment = (appointmentTime - now) / (1000 * 60 * 60);

    if (hoursUntilAppointment < 2 && req.user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel appointment less than 2 hours before scheduled time'
      });
    }

    // Update appointment status
    appointment.status = 'cancelled';
    appointment.cancellationReason = reason;
    appointment.cancelledAt = new Date();
    appointment.cancelledBy = req.user._id;

    await appointment.save();

    res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully',
      data: { appointment }
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel appointment',
      error: error.message
    });
  }
};

// Get appointment calendar for doctor
const getDoctorCalendar = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { month, year } = req.query;

    // Verify doctor access
    if (req.user.role !== 'admin' && req.user._id.toString() !== doctorId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    // Get all appointments for the month
    const appointments = await Appointment.find({
      doctor: doctorId,
      appointmentDate: { $gte: startDate, $lte: endDate }
    })
    .populate('patient', 'firstName lastName')
    .sort({ appointmentDate: 1, timeSlot: 1 });

    // Group appointments by date
    const calendar = {};
    appointments.forEach(appointment => {
      const dateKey = appointment.appointmentDate.toISOString().split('T')[0];
      if (!calendar[dateKey]) {
        calendar[dateKey] = [];
      }
      calendar[dateKey].push({
        id: appointment._id,
        timeSlot: appointment.timeSlot,
        patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
        consultationType: appointment.consultationType,
        status: appointment.status,
        reasonForVisit: appointment.reasonForVisit
      });
    });

    // Get doctor's weekly schedule
    const doctor = await User.findById(doctorId).select('availability');

    res.status(200).json({
      success: true,
      data: {
        month: targetMonth,
        year: targetYear,
        calendar,
        doctorAvailability: doctor.availability,
        totalAppointments: appointments.length
      }
    });
  } catch (error) {
    console.error('Get doctor calendar error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor calendar',
      error: error.message
    });
  }
};

// Update doctor's weekly availability
const updateDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { availability } = req.body;

    // Verify doctor access
    if (req.user.role !== 'admin' && req.user._id.toString() !== doctorId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Validate availability format
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    for (const day of validDays) {
      if (availability[day]) {
        const { isAvailable, startTime, endTime } = availability[day];
        if (isAvailable && (!startTime || !endTime)) {
          return res.status(400).json({
            success: false,
            message: `Invalid availability for ${day}: start and end times required`
          });
        }
      }
    }

    doctor.availability = availability;
    await doctor.save();

    res.status(200).json({
      success: true,
      message: 'Doctor availability updated successfully',
      data: { availability: doctor.availability }
    });
  } catch (error) {
    console.error('Update doctor availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability',
      error: error.message
    });
  }
};

// Get appointment statistics
const getAppointmentStats = async (req, res) => {
  try {
    const { doctorId, startDate, endDate } = req.query;
    const userId = req.user._id;

    let filter = {};

    // If doctorId is provided, check access
    if (doctorId) {
      if (req.user.role !== 'admin' && userId.toString() !== doctorId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      filter.doctor = doctorId;
    } else if (req.user.role === 'doctor') {
      // If no doctorId provided and user is doctor, show their stats
      filter.doctor = userId;
    } else if (req.user.role === 'patient') {
      // If user is patient, show their appointment stats
      filter.patient = userId;
    }

    // Date range filter
    if (startDate || endDate) {
      filter.appointmentDate = {};
      if (startDate) filter.appointmentDate.$gte = new Date(startDate);
      if (endDate) filter.appointmentDate.$lte = new Date(endDate);
    }

    const stats = await Promise.all([
      // Total appointments
      Appointment.countDocuments(filter),
      
      // Appointments by status
      Appointment.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Appointments by consultation type
      Appointment.aggregate([
        { $match: filter },
        { $group: { _id: '$consultationType', count: { $sum: 1 } } }
      ]),
      
      // Monthly appointment trends
      Appointment.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              year: { $year: '$appointmentDate' },
              month: { $month: '$appointmentDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalAppointments: stats[0],
        statusBreakdown: stats[1],
        consultationTypeBreakdown: stats[2],
        monthlyTrends: stats[3]
      }
    });
  } catch (error) {
    console.error('Get appointment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointment statistics',
      error: error.message
    });
  }
};

// Get available time slots for multiple doctors (useful for emergency bookings)
const getMultiDoctorAvailability = async (req, res) => {
  try {
    const { specialization, date, city, consultationType } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    let doctorFilter = {
      role: 'doctor',
      isActive: true,
      isVerified: true
    };

    if (specialization) {
      doctorFilter.specialization = { $regex: specialization, $options: 'i' };
    }

    if (city) {
      doctorFilter['address.city'] = { $regex: city, $options: 'i' };
    }

    if (consultationType) {
      doctorFilter.consultationModes = { $in: [consultationType] };
    }

    const doctors = await User.find(doctorFilter)
      .select('firstName lastName specialization consultationFee profileImage consultationModes')
      .limit(20);

    const availabilityPromises = doctors.map(async (doctor) => {
      const availability = await getDayAvailability(doctor._id, new Date(date));
      return {
        doctor: {
          id: doctor._id,
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specialization,
          consultationFee: doctor.consultationFee,
          profileImage: doctor.profileImage,
          consultationModes: doctor.consultationModes
        },
        availability
      };
    });

    const results = await Promise.all(availabilityPromises);
    const availableDoctors = results.filter(result => result.availability.isAvailable);

    res.status(200).json({
      success: true,
      data: {
        date,
        availableDoctors,
        totalFound: availableDoctors.length
      }
    });
  } catch (error) {
    console.error('Get multi-doctor availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor availability',
      error: error.message
    });
  }
};

module.exports = {
  getDoctorAvailability,
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
  getDoctorCalendar,
  updateDoctorAvailability,
  getAppointmentStats,
  getMultiDoctorAvailability
};
