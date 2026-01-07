const nodemailer = require('nodemailer');
const Appointment = require('../models/Appointment');
const { MedicineOrder } = require('../models/MedicineOrder');
const { TestBooking } = require('../models/TestPackage');
const { HospitalBooking } = require('../models/Hospital');
const User = require('../models/User');
const cron = require('node-cron');

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Email templates
const emailTemplates = {
  appointmentConfirmation: (appointment) => ({
    subject: 'Appointment Confirmed - HealthCare Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
          <h1>Appointment Confirmed</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear ${appointment.patient.firstName} ${appointment.patient.lastName},</p>
          <p>Your appointment has been confirmed with the following details:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Doctor:</strong> Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}</p>
            <p><strong>Specialization:</strong> ${appointment.doctor.specialization}</p>
            <p><strong>Date:</strong> ${new Date(appointment.appointmentDate).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${appointment.timeSlot}</p>
            <p><strong>Consultation Fee:</strong> ₹${appointment.payment.totalAmount}</p>
            <p><strong>Consultation Type:</strong> ${appointment.consultationType}</p>
          </div>
          <p>Please arrive 15 minutes before your appointment time.</p>
          <p>If you need to reschedule or cancel, please contact us at least 24 hours in advance.</p>
          <br>
          <p>Best regards,<br>HealthCare Platform Team</p>
        </div>
      </div>
    `
  }),

  appointmentReminder: (appointment) => ({
    subject: 'Appointment Reminder - Tomorrow',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #2196F3; color: white; padding: 20px; text-align: center;">
          <h1>Appointment Reminder</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear ${appointment.patient.firstName} ${appointment.patient.lastName},</p>
          <p>This is a friendly reminder about your upcoming appointment tomorrow:</p>
          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Doctor:</strong> Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}</p>
            <p><strong>Date:</strong> ${new Date(appointment.appointmentDate).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${appointment.timeSlot}</p>
            <p><strong>Location:</strong> ${appointment.consultationType === 'online' ? 'Video Consultation' : 'In-person'}</p>
          </div>
          <p>Please ensure you arrive 15 minutes early and bring any relevant medical documents.</p>
          <br>
          <p>Best regards,<br>HealthCare Platform Team</p>
        </div>
      </div>
    `
  }),

  prescriptionReady: (prescription) => ({
    subject: 'Your Prescription is Ready',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #FF9800; color: white; padding: 20px; text-align: center;">
          <h1>Prescription Ready</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear ${prescription.patient.firstName} ${prescription.patient.lastName},</p>
          <p>Your prescription from Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName} is now ready.</p>
          <div style="background-color: #fff3e0; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Prescription Date:</strong> ${new Date(prescription.createdAt).toLocaleDateString()}</p>
            <p><strong>Doctor:</strong> Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName}</p>
            <p><strong>Diagnosis:</strong> ${prescription.diagnosis}</p>
          </div>
          <p>You can now order your medicines through our platform or download the prescription.</p>
          <p>Please follow the prescribed dosage and complete the full course of medication.</p>
          <br>
          <p>Best regards,<br>HealthCare Platform Team</p>
        </div>
      </div>
    `
  }),

  medicineOrderConfirmed: (order) => ({
    subject: 'Medicine Order Confirmed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
          <h1>Order Confirmed</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear ${order.patient.firstName} ${order.patient.lastName},</p>
          <p>Your medicine order has been confirmed:</p>
          <div style="background-color: #f1f8e9; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Order ID:</strong> ${order._id}</p>
            <p><strong>Total Amount:</strong> ₹${order.pricing.total}</p>
            <p><strong>Items:</strong> ${order.items.length} medicine(s)</p>
            <p><strong>Delivery Address:</strong> ${order.deliveryAddress.street}, ${order.deliveryAddress.city}</p>
          </div>
          <p>Your medicines will be delivered within 2-3 business days.</p>
          <p>You can track your order status through your account dashboard.</p>
          <br>
          <p>Best regards,<br>HealthCare Platform Team</p>
        </div>
      </div>
    `
  }),

  testReportReady: (booking) => ({
    subject: 'Test Report Ready - HealthCare Platform',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #9C27B0; color: white; padding: 20px; text-align: center;">
          <h1>Test Report Ready</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear ${booking.patient.firstName} ${booking.patient.lastName},</p>
          <p>Your test report is now ready and available for download:</p>
          <div style="background-color: #f3e5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Test Name:</strong> ${booking.testPackage.name}</p>
            <p><strong>Test Date:</strong> ${new Date(booking.appointmentDate).toLocaleDateString()}</p>
            <p><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>You can download your report from your account dashboard or the link provided in your portal.</p>
          <p>Please consult with your doctor to understand the results and next steps.</p>
          <br>
          <p>Best regards,<br>HealthCare Platform Team</p>
        </div>
      </div>
    `
  }),

  hospitalAdmissionConfirmed: (booking) => ({
    subject: 'Hospital Admission Confirmed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #607D8B; color: white; padding: 20px; text-align: center;">
          <h1>Admission Confirmed</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear ${booking.patient.firstName} ${booking.patient.lastName},</p>
          <p>Your hospital admission has been confirmed:</p>
          <div style="background-color: #eceff1; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Hospital:</strong> ${booking.hospital.name}</p>
            <p><strong>Admission Date:</strong> ${new Date(booking.admissionDate).toLocaleDateString()}</p>
            <p><strong>Bed Type:</strong> ${booking.bedType}</p>
            <p><strong>Department:</strong> ${booking.department}</p>
            ${booking.assignedBed ? `<p><strong>Bed Number:</strong> ${booking.assignedBed.bedNumber}</p>` : ''}
          </div>
          <p>Please arrive at the hospital on your admission date with all necessary documents.</p>
          <p>Contact the hospital directly for any specific instructions.</p>
          <br>
          <p>Best regards,<br>HealthCare Platform Team</p>
        </div>
      </div>
    `
  }),

  paymentConfirmation: (type, record, amount) => ({
    subject: `Payment Confirmation - ₹${amount}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
          <h1>Payment Confirmed</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear Customer,</p>
          <p>Your payment has been successfully processed:</p>
          <div style="background-color: #f1f8e9; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Payment Type:</strong> ${type.charAt(0).toUpperCase() + type.slice(1)}</p>
            <p><strong>Amount:</strong> ₹${amount}</p>
            <p><strong>Transaction ID:</strong> ${record._id}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <p>Thank you for using our services. You will receive the service as scheduled.</p>
          <br>
          <p>Best regards,<br>HealthCare Platform Team</p>
        </div>
      </div>
    `
  })
};

// Send email function
const sendEmail = async (to, template) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject: template.subject,
      html: template.html
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Notification controller functions
const sendAppointmentConfirmation = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    
    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName specialization');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    const template = emailTemplates.appointmentConfirmation(appointment);
    const result = await sendEmail(appointment.patient.email, template);

    res.status(200).json({
      success: result.success,
      message: result.success ? 'Confirmation email sent' : 'Failed to send email',
      error: result.error
    });
  } catch (error) {
    console.error('Send appointment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send confirmation email',
      error: error.message
    });
  }
};

const sendPrescriptionNotification = async (req, res) => {
  try {
    const { prescriptionId } = req.body;
    
    // Assuming prescription is embedded in appointment or separate model
    const prescription = await Appointment.findById(prescriptionId)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName');

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    const template = emailTemplates.prescriptionReady(prescription);
    const result = await sendEmail(prescription.patient.email, template);

    res.status(200).json({
      success: result.success,
      message: result.success ? 'Prescription notification sent' : 'Failed to send notification',
      error: result.error
    });
  } catch (error) {
    console.error('Send prescription notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send prescription notification',
      error: error.message
    });
  }
};

const sendMedicineOrderConfirmation = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    const order = await MedicineOrder.findById(orderId)
      .populate('patient', 'firstName lastName email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const template = emailTemplates.medicineOrderConfirmed(order);
    const result = await sendEmail(order.patient.email, template);

    res.status(200).json({
      success: result.success,
      message: result.success ? 'Order confirmation sent' : 'Failed to send confirmation',
      error: result.error
    });
  } catch (error) {
    console.error('Send medicine order confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send order confirmation',
      error: error.message
    });
  }
};

const sendTestReportNotification = async (req, res) => {
  try {
    const { bookingId } = req.body;
    
    const booking = await TestBooking.findById(bookingId)
      .populate('patient', 'firstName lastName email')
      .populate('testPackage', 'name');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Test booking not found'
      });
    }

    const template = emailTemplates.testReportReady(booking);
    const result = await sendEmail(booking.patient.email, template);

    res.status(200).json({
      success: result.success,
      message: result.success ? 'Test report notification sent' : 'Failed to send notification',
      error: result.error
    });
  } catch (error) {
    console.error('Send test report notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test report notification',
      error: error.message
    });
  }
};

const sendHospitalAdmissionConfirmation = async (req, res) => {
  try {
    const { bookingId } = req.body;
    
    const booking = await HospitalBooking.findById(bookingId)
      .populate('patient', 'firstName lastName email')
      .populate('hospital', 'name');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Hospital booking not found'
      });
    }

    const template = emailTemplates.hospitalAdmissionConfirmed(booking);
    const result = await sendEmail(booking.patient.email, template);

    res.status(200).json({
      success: result.success,
      message: result.success ? 'Admission confirmation sent' : 'Failed to send confirmation',
      error: result.error
    });
  } catch (error) {
    console.error('Send hospital admission confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send admission confirmation',
      error: error.message
    });
  }
};

const sendPaymentConfirmation = async (req, res) => {
  try {
    const { type, recordId, amount, email } = req.body;
    
    // Get the record based on type
    let record;
    switch (type) {
      case 'appointment':
        record = await Appointment.findById(recordId);
        break;
      case 'medicine':
        record = await MedicineOrder.findById(recordId);
        break;
      case 'test':
        record = await TestBooking.findById(recordId);
        break;
      case 'hospital':
        record = await HospitalBooking.findById(recordId);
        break;
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    const template = emailTemplates.paymentConfirmation(type, record, amount);
    const result = await sendEmail(email, template);

    res.status(200).json({
      success: result.success,
      message: result.success ? 'Payment confirmation sent' : 'Failed to send confirmation',
      error: result.error
    });
  } catch (error) {
    console.error('Send payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send payment confirmation',
      error: error.message
    });
  }
};

// Bulk notification functions
const sendBulkNotifications = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { userRole, subject, message, userIds } = req.body;

    let users;
    if (userIds && userIds.length > 0) {
      users = await User.find({ _id: { $in: userIds } }).select('email firstName lastName');
    } else {
      users = await User.find({ role: userRole }).select('email firstName lastName');
    }

    const emailPromises = users.map(user => {
      const template = {
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #2196F3; color: white; padding: 20px; text-align: center;">
              <h1>HealthCare Platform</h1>
            </div>
            <div style="padding: 20px;">
              <p>Dear ${user.firstName} ${user.lastName},</p>
              <div style="padding: 15px; border-radius: 5px; margin: 15px 0;">
                ${message}
              </div>
              <br>
              <p>Best regards,<br>HealthCare Platform Team</p>
            </div>
          </div>
        `
      };
      return sendEmail(user.email, template);
    });

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(result => result.status === 'fulfilled' && result.value.success).length;
    const failed = results.length - successful;

    res.status(200).json({
      success: true,
      message: `Bulk notifications sent: ${successful} successful, ${failed} failed`,
      data: { successful, failed, total: results.length }
    });
  } catch (error) {
    console.error('Send bulk notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk notifications',
      error: error.message
    });
  }
};

// Scheduled reminder function
const sendAppointmentReminders = async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const appointments = await Appointment.find({
      appointmentDate: { $gte: tomorrow, $lt: dayAfterTomorrow },
      status: { $in: ['confirmed', 'scheduled'] }
    }).populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName');

    for (const appointment of appointments) {
      const template = emailTemplates.appointmentReminder(appointment);
      await sendEmail(appointment.patient.email, template);
    }

    console.log(`Sent ${appointments.length} appointment reminders for ${tomorrow.toDateString()}`);
  } catch (error) {
    console.error('Error sending appointment reminders:', error);
  }
};

// Schedule appointment reminders (runs daily at 10 AM)
cron.schedule('0 10 * * *', () => {
  console.log('Running appointment reminder job...');
  sendAppointmentReminders();
});

// Test email configuration
const testEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    const template = {
      subject: 'Test Email - HealthCare Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1>Test Email</h1>
          </div>
          <div style="padding: 20px;">
            <p>This is a test email to verify the email configuration.</p>
            <p>If you receive this email, the notification system is working correctly.</p>
            <br>
            <p>Best regards,<br>HealthCare Platform Team</p>
          </div>
        </div>
      `
    };

    const result = await sendEmail(email, template);
    
    res.status(200).json({
      success: result.success,
      message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
      error: result.error
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
};

module.exports = {
  sendAppointmentConfirmation,
  sendPrescriptionNotification,
  sendMedicineOrderConfirmation,
  sendTestReportNotification,
  sendHospitalAdmissionConfirmation,
  sendPaymentConfirmation,
  sendBulkNotifications,
  testEmail,
  sendAppointmentReminders // For manual trigger if needed
};
