const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const { TestPackage } = require('../models/TestPackage');
const { InsurancePolicy } = require('../models/Insurance');
const { HospitalBooking } = require('../models/Blog');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected for seeding...');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
};

const seedUsers = async () => {
  try {
    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    const users = [
      // Admin
      {
        firstName: 'System',
        lastName: 'Administrator',
        email: 'admin@healthcare.com',
        password: 'admin123',
        phone: '+919999999999',
        role: 'admin',
        isVerified: true,
        isActive: true
      },

      // Doctors
      {
        firstName: 'Dr. Sarah',
        lastName: 'Johnson',
        email: 'sarah.johnson@healthcare.com',
        password: 'doctor123',
        phone: '+919876543210',
        role: 'doctor',
        specialization: 'Cardiology',
        qualification: 'MD, DM (Cardiology)',
        experience: 12,
        consultationFee: 800,
        isVerified: true,
        isActive: true,
        availability: [
          {
            day: 'monday',
            timeSlots: [
              { startTime: '09:00', endTime: '09:30', isAvailable: true },
              { startTime: '09:30', endTime: '10:00', isAvailable: true },
              { startTime: '10:00', endTime: '10:30', isAvailable: true },
              { startTime: '10:30', endTime: '11:00', isAvailable: true },
              { startTime: '11:00', endTime: '11:30', isAvailable: true }
            ]
          },
          {
            day: 'tuesday',
            timeSlots: [
              { startTime: '14:00', endTime: '14:30', isAvailable: true },
              { startTime: '14:30', endTime: '15:00', isAvailable: true },
              { startTime: '15:00', endTime: '15:30', isAvailable: true },
              { startTime: '15:30', endTime: '16:00', isAvailable: true }
            ]
          },
          {
            day: 'wednesday',
            timeSlots: [
              { startTime: '09:00', endTime: '09:30', isAvailable: true },
              { startTime: '09:30', endTime: '10:00', isAvailable: true },
              { startTime: '10:00', endTime: '10:30', isAvailable: true }
            ]
          }
        ]
      },
      {
        firstName: 'Dr. Michael',
        lastName: 'Chen',
        email: 'michael.chen@healthcare.com',
        password: 'doctor123',
        phone: '+919876543211',
        role: 'doctor',
        specialization: 'Dermatology',
        qualification: 'MBBS, MD (Dermatology)',
        experience: 8,
        consultationFee: 600,
        isVerified: true,
        isActive: true,
        availability: [
          {
            day: 'monday',
            timeSlots: [
              { startTime: '14:00', endTime: '14:30', isAvailable: true },
              { startTime: '14:30', endTime: '15:00', isAvailable: true },
              { startTime: '15:00', endTime: '15:30', isAvailable: true }
            ]
          },
          {
            day: 'thursday',
            timeSlots: [
              { startTime: '10:00', endTime: '10:30', isAvailable: true },
              { startTime: '10:30', endTime: '11:00', isAvailable: true },
              { startTime: '11:00', endTime: '11:30', isAvailable: true }
            ]
          }
        ]
      },
      {
        firstName: 'Dr. Priya',
        lastName: 'Sharma',
        email: 'priya.sharma@healthcare.com',
        password: 'doctor123',
        phone: '+919876543212',
        role: 'doctor',
        specialization: 'Pediatrics',
        qualification: 'MBBS, MD (Pediatrics)',
        experience: 15,
        consultationFee: 700,
        isVerified: true,
        isActive: true,
        availability: [
          {
            day: 'tuesday',
            timeSlots: [
              { startTime: '09:00', endTime: '09:30', isAvailable: true },
              { startTime: '09:30', endTime: '10:00', isAvailable: true },
              { startTime: '10:00', endTime: '10:30', isAvailable: true }
            ]
          },
          {
            day: 'friday',
            timeSlots: [
              { startTime: '15:00', endTime: '15:30', isAvailable: true },
              { startTime: '15:30', endTime: '16:00', isAvailable: true },
              { startTime: '16:00', endTime: '16:30', isAvailable: true }
            ]
          }
        ]
      },

      // Patients
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@email.com',
        password: 'patient123',
        phone: '+919876543220',
        role: 'patient',
        dateOfBirth: new Date('1990-05-15'),
        gender: 'male',
        isVerified: true,
        isActive: true,
        address: {
          street: '123 Main Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        },
        emergencyContact: {
          name: 'Jane Doe',
          phone: '+919876543221',
          relationship: 'Spouse'
        },
        medicalHistory: [
          {
            condition: 'Hypertension',
            diagnosedDate: new Date('2022-01-15'),
            currentStatus: 'active'
          }
        ],
        allergies: ['Penicillin', 'Peanuts']
      },
      {
        firstName: 'Emma',
        lastName: 'Wilson',
        email: 'emma.wilson@email.com',
        password: 'patient123',
        phone: '+919876543222',
        role: 'patient',
        dateOfBirth: new Date('1985-03-20'),
        gender: 'female',
        isVerified: true,
        isActive: true,
        address: {
          street: '456 Oak Avenue',
          city: 'Delhi',
          state: 'Delhi',
          zipCode: '110001',
          country: 'India'
        },
        emergencyContact: {
          name: 'Robert Wilson',
          phone: '+919876543223',
          relationship: 'Husband'
        }
      },

      // Hospitals
      {
        firstName: 'City',
        lastName: 'Hospital',
        email: 'admin@cityhospital.com',
        password: 'hospital123',
        phone: '+919876543230',
        role: 'hospital',
        hospitalName: 'City General Hospital',
        hospitalType: 'multispecialty',
        departments: ['Emergency', 'Cardiology', 'Orthopedics', 'Pediatrics', 'General Medicine', 'Neurology'],
        totalBeds: 200,
        availableBeds: 45,
        isVerified: true,
        isActive: true,
        address: {
          street: '789 Hospital Road',
          city: 'Bangalore',
          state: 'Karnataka',
          zipCode: '560001',
          country: 'India'
        }
      },
      {
        firstName: 'Apollo',
        lastName: 'Hospitals',
        email: 'admin@apollo.com',
        password: 'hospital123',
        phone: '+919876543231',
        role: 'hospital',
        hospitalName: 'Apollo Medical Center',
        hospitalType: 'specialty',
        departments: ['Cardiology', 'Oncology', 'Neurosurgery', 'Gastroenterology', 'Pulmonology'],
        totalBeds: 350,
        availableBeds: 78,
        isVerified: true,
        isActive: true,
        address: {
          street: '45 Apollo Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          zipCode: '400001',
          country: 'India'
        }
      },
      {
        firstName: 'Emergency',
        lastName: 'Care Center',
        email: 'admin@emergencycare.com',
        password: 'hospital123',
        phone: '+919876543232',
        role: 'hospital',
        hospitalName: 'Emergency Care Hospital',
        hospitalType: 'emergency',
        departments: ['Emergency', 'Trauma', 'Critical Care', 'General Medicine'],
        totalBeds: 100,
        availableBeds: 25,
        isVerified: true,
        isActive: true,
        address: {
          street: '123 Emergency Lane',
          city: 'Delhi',
          state: 'Delhi',
          zipCode: '110001',
          country: 'India'
        }
      },

      // Lab Assistant
      {
        firstName: 'Alice',
        lastName: 'Cooper',
        email: 'alice.cooper@labtech.com',
        password: 'lab123',
        phone: '+919876543240',
        role: 'lab_assistant',
        labName: 'MediLab Diagnostics',
        certifications: ['Medical Laboratory Technology', 'Pathology Assistant'],
        isVerified: true,
        isActive: true,
        address: {
          street: '321 Lab Street',
          city: 'Chennai',
          state: 'Tamil Nadu',
          zipCode: '600001',
          country: 'India'
        }
      }
    ];

    // Hash passwords
    for (let user of users) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(user.password, salt);
    }

    await User.insertMany(users);
    console.log(`✅ Seeded ${users.length} users`);
    return users;
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
};

const seedMedicines = async () => {
  try {
    // Clear existing medicines
    await Medicine.deleteMany({});
    console.log('Cleared existing medicines');

    const medicines = [
      {
        name: 'Paracetamol 500mg',
        genericName: 'Acetaminophen',
        manufacturer: 'PharmaCorp Ltd',
        category: 'painkiller',
        description: 'Pain reliever and fever reducer',
        dosageForm: 'tablet',
        strength: { value: 500, unit: 'mg' },
        price: { mrp: 25, sellingPrice: 22, discount: 12 },
        inventory: { stock: 500, lowStockThreshold: 50 },
        images: ['https://via.placeholder.com/300x300?text=Paracetamol'],
        sideEffects: ['Nausea', 'Liver damage (with overdose)'],
        contraindications: ['Severe liver disease'],
        storageInstructions: 'Store in cool, dry place',
        expiryDate: new Date('2026-12-31'),
        prescriptionRequired: false,
        isActive: true,
        tags: ['fever', 'pain', 'headache']
      },
      {
        name: 'Amoxicillin 250mg',
        genericName: 'Amoxicillin',
        manufacturer: 'BioMed Industries',
        category: 'antibiotic',
        description: 'Broad-spectrum antibiotic for bacterial infections',
        dosageForm: 'capsule',
        strength: { value: 250, unit: 'mg' },
        price: { mrp: 120, sellingPrice: 108, discount: 10 },
        inventory: { stock: 200, lowStockThreshold: 30 },
        images: ['https://via.placeholder.com/300x300?text=Amoxicillin'],
        sideEffects: ['Diarrhea', 'Nausea', 'Skin rash'],
        contraindications: ['Penicillin allergy'],
        interactions: ['Warfarin', 'Methotrexate'],
        storageInstructions: 'Store below 25°C',
        expiryDate: new Date('2025-08-15'),
        prescriptionRequired: true,
        isActive: true,
        tags: ['antibiotic', 'infection', 'bacteria']
      },
      {
        name: 'Vitamin D3 60000 IU',
        genericName: 'Cholecalciferol',
        manufacturer: 'NutriHealth Co',
        category: 'vitamin',
        description: 'Vitamin D3 supplement for bone health',
        dosageForm: 'capsule',
        strength: { value: 60000, unit: 'units' },
        price: { mrp: 180, sellingPrice: 162, discount: 10 },
        inventory: { stock: 150, lowStockThreshold: 25 },
        images: ['https://via.placeholder.com/300x300?text=Vitamin+D3'],
        sideEffects: ['Hypercalcemia', 'Kidney stones'],
        storageInstructions: 'Store in cool, dry place away from light',
        expiryDate: new Date('2026-05-20'),
        prescriptionRequired: false,
        isActive: true,
        tags: ['vitamin', 'bones', 'supplement']
      },
      {
        name: 'Metformin 500mg',
        genericName: 'Metformin Hydrochloride',
        manufacturer: 'DiabetCare Pharma',
        category: 'prescription',
        description: 'Anti-diabetic medication for Type 2 diabetes',
        dosageForm: 'tablet',
        strength: { value: 500, unit: 'mg' },
        price: { mrp: 85, sellingPrice: 76, discount: 11 },
        inventory: { stock: 300, lowStockThreshold: 40 },
        images: ['https://via.placeholder.com/300x300?text=Metformin'],
        sideEffects: ['Nausea', 'Diarrhea', 'Metallic taste'],
        contraindications: ['Kidney disease', 'Liver disease'],
        interactions: ['Alcohol', 'Contrast dyes'],
        storageInstructions: 'Store at room temperature',
        expiryDate: new Date('2025-11-30'),
        prescriptionRequired: true,
        isActive: true,
        tags: ['diabetes', 'blood sugar', 'prescription']
      },
      {
        name: 'Cetirizine 10mg',
        genericName: 'Cetirizine Hydrochloride',
        manufacturer: 'AllergyFree Labs',
        category: 'otc',
        description: 'Antihistamine for allergies and hay fever',
        dosageForm: 'tablet',
        strength: { value: 10, unit: 'mg' },
        price: { mrp: 45, sellingPrice: 40, discount: 11 },
        inventory: { stock: 250, lowStockThreshold: 35 },
        images: ['https://via.placeholder.com/300x300?text=Cetirizine'],
        sideEffects: ['Drowsiness', 'Dry mouth'],
        contraindications: ['Severe kidney disease'],
        storageInstructions: 'Store below 30°C',
        expiryDate: new Date('2026-03-15'),
        prescriptionRequired: false,
        isActive: true,
        tags: ['allergy', 'antihistamine', 'hay fever']
      },
      {
        name: 'Ibuprofen 400mg',
        genericName: 'Ibuprofen',
        manufacturer: 'PainRelief Pharma',
        category: 'painkiller',
        description: 'Non-steroidal anti-inflammatory drug (NSAID)',
        dosageForm: 'tablet',
        strength: { value: 400, unit: 'mg' },
        price: { mrp: 55, sellingPrice: 49, discount: 11 },
        inventory: { stock: 180, lowStockThreshold: 30 },
        images: ['https://via.placeholder.com/300x300?text=Ibuprofen'],
        sideEffects: ['Stomach upset', 'Heartburn', 'Dizziness'],
        contraindications: ['Peptic ulcer', 'Severe heart failure'],
        interactions: ['Warfarin', 'ACE inhibitors'],
        storageInstructions: 'Store at room temperature',
        expiryDate: new Date('2025-09-20'),
        prescriptionRequired: false,
        isActive: true,
        tags: ['pain', 'inflammation', 'fever']
      },
      {
        name: 'Omega-3 Fish Oil',
        genericName: 'Omega-3 Fatty Acids',
        manufacturer: 'HealthSupplement Co',
        category: 'supplement',
        description: 'Essential fatty acids for heart and brain health',
        dosageForm: 'capsule',
        strength: { value: 1000, unit: 'mg' },
        price: { mrp: 299, sellingPrice: 269, discount: 10 },
        inventory: { stock: 120, lowStockThreshold: 20 },
        images: ['https://via.placeholder.com/300x300?text=Omega+3'],
        sideEffects: ['Fishy aftertaste', 'Stomach upset'],
        storageInstructions: 'Store in refrigerator',
        expiryDate: new Date('2026-01-10'),
        prescriptionRequired: false,
        isActive: true,
        tags: ['omega-3', 'heart', 'brain', 'supplement']
      },
      {
        name: 'Cough Syrup 100ml',
        genericName: 'Dextromethorphan',
        manufacturer: 'CoughCure Labs',
        category: 'otc',
        description: 'Cough suppressant syrup',
        dosageForm: 'syrup',
        strength: { value: 15, unit: 'mg' },
        price: { mrp: 95, sellingPrice: 85, discount: 11 },
        inventory: { stock: 80, lowStockThreshold: 15 },
        images: ['https://via.placeholder.com/300x300?text=Cough+Syrup'],
        sideEffects: ['Drowsiness', 'Nausea'],
        contraindications: ['MAO inhibitor use'],
        storageInstructions: 'Store below 25°C',
        expiryDate: new Date('2025-07-30'),
        prescriptionRequired: false,
        isActive: true,
        tags: ['cough', 'syrup', 'cold']
      }
    ];

    await Medicine.insertMany(medicines);
    console.log(`✅ Seeded ${medicines.length} medicines`);
    return medicines;
  } catch (error) {
    console.error('Error seeding medicines:', error);
    throw error;
  }
};

const seedTestPackages = async () => {
  try {
    // Clear existing test packages
    await TestPackage.deleteMany({});
    console.log('Cleared existing test packages');

    const testPackages = [
      {
        name: 'Complete Blood Count (CBC)',
        description: 'Comprehensive blood analysis including RBC, WBC, platelets, and hemoglobin',
        category: 'blood_test',
        tests: [
          { testName: 'Red Blood Cell Count', testCode: 'RBC', normalRange: '4.5-5.5 million/mcL', unit: 'million/mcL' },
          { testName: 'White Blood Cell Count', testCode: 'WBC', normalRange: '4,000-11,000/mcL', unit: '/mcL' },
          { testName: 'Hemoglobin', testCode: 'HGB', normalRange: '12-16 g/dL', unit: 'g/dL' },
          { testName: 'Platelet Count', testCode: 'PLT', normalRange: '150,000-450,000/mcL', unit: '/mcL' }
        ],
        price: 300,
        discountPrice: 250,
        preparationInstructions: ['No special preparation required'],
        fastingRequired: false,
        sampleType: 'blood',
        homeCollectionAvailable: true,
        homeCollectionFee: 50,
        reportDeliveryTime: '24 hours',
        isActive: true
      },
      {
        name: 'Lipid Profile',
        description: 'Cholesterol and triglycerides analysis for heart health assessment',
        category: 'blood_test',
        tests: [
          { testName: 'Total Cholesterol', testCode: 'CHOL', normalRange: '<200 mg/dL', unit: 'mg/dL' },
          { testName: 'HDL Cholesterol', testCode: 'HDL', normalRange: '>40 mg/dL (M), >50 mg/dL (F)', unit: 'mg/dL' },
          { testName: 'LDL Cholesterol', testCode: 'LDL', normalRange: '<100 mg/dL', unit: 'mg/dL' },
          { testName: 'Triglycerides', testCode: 'TRIG', normalRange: '<150 mg/dL', unit: 'mg/dL' }
        ],
        price: 500,
        discountPrice: 400,
        preparationInstructions: ['Fasting for 12 hours before test', 'Only water allowed during fasting'],
        fastingRequired: true,
        fastingHours: 12,
        sampleType: 'blood',
        homeCollectionAvailable: true,
        homeCollectionFee: 50,
        reportDeliveryTime: '24 hours',
        isActive: true
      },
      {
        name: 'Thyroid Function Test',
        description: 'Comprehensive thyroid hormone analysis',
        category: 'blood_test',
        tests: [
          { testName: 'TSH', testCode: 'TSH', normalRange: '0.4-4.0 mIU/L', unit: 'mIU/L' },
          { testName: 'Free T4', testCode: 'FT4', normalRange: '0.8-1.8 ng/dL', unit: 'ng/dL' },
          { testName: 'Free T3', testCode: 'FT3', normalRange: '2.3-4.2 pg/mL', unit: 'pg/mL' }
        ],
        price: 600,
        discountPrice: 480,
        preparationInstructions: ['No special preparation required'],
        fastingRequired: false,
        sampleType: 'blood',
        homeCollectionAvailable: true,
        homeCollectionFee: 50,
        reportDeliveryTime: '48 hours',
        isActive: true
      },
      {
        name: 'Comprehensive Health Checkup',
        description: 'Complete health screening package with multiple tests',
        category: 'comprehensive_health_checkup',
        tests: [
          { testName: 'Complete Blood Count', testCode: 'CBC' },
          { testName: 'Lipid Profile', testCode: 'LIPID' },
          { testName: 'Liver Function Test', testCode: 'LFT' },
          { testName: 'Kidney Function Test', testCode: 'KFT' },
          { testName: 'Blood Sugar', testCode: 'BSF' },
          { testName: 'Thyroid Profile', testCode: 'THYROID' },
          { testName: 'Urine Analysis', testCode: 'URINE' }
        ],
        price: 2500,
        discountPrice: 1999,
        preparationInstructions: ['Fasting for 12 hours', 'First morning urine sample required'],
        fastingRequired: true,
        fastingHours: 12,
        sampleType: 'blood',
        homeCollectionAvailable: true,
        homeCollectionFee: 100,
        reportDeliveryTime: '48-72 hours',
        isActive: true
      }
    ];

    await TestPackage.insertMany(testPackages);
    console.log(`✅ Seeded ${testPackages.length} test packages`);
    return testPackages;
  } catch (error) {
    console.error('Error seeding test packages:', error);
    throw error;
  }
};

const seedInsurancePolicies = async () => {
  try {
    // Clear existing insurance policies
    await InsurancePolicy.deleteMany({});
    console.log('Cleared existing insurance policies');

    const policies = [
      {
        policyName: 'HealthCare+ Basic',
        description: 'Basic health insurance with essential coverage',
        type: 'platform_policy',
        provider: 'HealthCare+ Insurance',
        premiumAmount: 5000,
        coverageAmount: 200000,
        benefits: [
          { benefit: 'Doctor Consultations', description: '10% discount on all consultations', discount: 10 },
          { benefit: 'Medicine Orders', description: '5% discount on medicine purchases', discount: 5 },
          { benefit: 'Lab Tests', description: 'Free quarterly health checkup', discount: 0 },
          { benefit: 'Emergency Coverage', description: 'Emergency medical expenses covered', discount: 0 }
        ],
        duration: 12,
        eligibilityCriteria: ['Age 18-65', 'No pre-existing conditions', 'Regular health checkup'],
        exclusions: ['Cosmetic surgery', 'Dental care', 'Pre-existing conditions'],
        isActive: true,
        termsAndConditions: 'Standard terms and conditions apply. Coverage starts 30 days after premium payment.'
      },
      {
        policyName: 'HealthCare+ Premium',
        description: 'Comprehensive health insurance with maximum benefits',
        type: 'platform_policy',
        provider: 'HealthCare+ Insurance',
        premiumAmount: 12000,
        coverageAmount: 500000,
        benefits: [
          { benefit: 'Doctor Consultations', description: '25% discount on all consultations', discount: 25 },
          { benefit: 'Medicine Orders', description: '15% discount on medicine purchases', discount: 15 },
          { benefit: 'Lab Tests', description: 'Free monthly health checkup', discount: 0 },
          { benefit: 'Emergency Coverage', description: 'Full emergency medical expenses covered', discount: 0 },
          { benefit: 'Specialist Consultations', description: '20% discount on specialist visits', discount: 20 }
        ],
        duration: 12,
        eligibilityCriteria: ['Age 18-70', 'Health declaration required'],
        exclusions: ['Cosmetic surgery', 'Experimental treatments'],
        isActive: true,
        termsAndConditions: 'Premium terms and conditions apply. Immediate coverage for accidents, 30-day waiting for illness.'
      }
    ];

    await InsurancePolicy.insertMany(policies);
    console.log(`✅ Seeded ${policies.length} insurance policies`);
    return policies;
  } catch (error) {
    console.error('Error seeding insurance policies:', error);
    throw error;
  }
};

const seedHospitalBookings = async () => {
  try {
    // Clear existing hospital bookings
    await HospitalBooking.deleteMany({});
    console.log('Cleared existing hospital bookings');

    // Get seeded users
    const patients = await User.find({ role: 'patient' });
    const hospitals = await User.find({ role: 'hospital' });
    const doctors = await User.find({ role: 'doctor' });

    if (patients.length === 0 || hospitals.length === 0) {
      console.log('No patients or hospitals found, skipping hospital bookings seeding');
      return [];
    }

    const bookings = [
      {
        patient: patients[0]._id,
        hospital: hospitals[0]._id,
        referringDoctor: doctors[0]?._id,
        admissionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        department: 'Cardiology',
        roomType: 'private',
        reasonForAdmission: 'Chest pain and irregular heartbeat evaluation',
        urgency: 'urgent',
        estimatedStayDuration: '3-5 days',
        status: 'pending',
        insurance: {
          isInsuranceCovered: true,
          insuranceProvider: 'HealthCare+ Insurance',
          policyNumber: 'HC123456789',
          approvalStatus: 'pending'
        }
      },
      {
        patient: patients[1] ? patients[1]._id : patients[0]._id,
        hospital: hospitals[1] ? hospitals[1]._id : hospitals[0]._id,
        referringDoctor: doctors[1]?._id,
        admissionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        dischargeDate: null,
        department: 'Orthopedics',
        roomType: 'general',
        bedNumber: 'B-101',
        reasonForAdmission: 'Knee replacement surgery',
        urgency: 'routine',
        estimatedStayDuration: '7-10 days',
        status: 'confirmed',
        totalCost: {
          roomCharges: 15000,
          medicationCharges: 5000,
          procedureCharges: 150000,
          otherCharges: 10000,
          totalAmount: 180000
        },
        insurance: {
          isInsuranceCovered: false
        },
        medicalRecords: [
          {
            recordType: 'admission_note',
            content: 'Patient admitted for scheduled knee replacement surgery. Pre-operative assessments completed.',
            createdAt: new Date()
          }
        ]
      }
    ];

    await HospitalBooking.insertMany(bookings);
    console.log(`✅ Seeded ${bookings.length} hospital bookings`);
    return bookings;
  } catch (error) {
    console.error('Error seeding hospital bookings:', error);
    throw error;
  }
};

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    await connectDB();
    
    await seedUsers();
    await seedMedicines();
    await seedTestPackages();
    await seedInsurancePolicies();
    await seedHospitalBookings();
    
    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Demo Accounts:');
    console.log('👨‍⚕️ Doctor: sarah.johnson@healthcare.com / doctor123');
    console.log('👤 Patient: john.doe@email.com / patient123');
    console.log('🏥 Hospital 1: admin@cityhospital.com / hospital123');
    console.log('🏥 Hospital 2: admin@apollo.com / hospital123');
    console.log('🚑 Emergency: admin@emergencycare.com / hospital123');
    console.log('🔬 Lab: alice.cooper@labtech.com / lab123');
    console.log('👑 Admin: admin@healthcare.com / admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run seeder if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase,
  seedUsers,
  seedMedicines,
  seedTestPackages,
  seedInsurancePolicies,
  seedHospitalBookings
};
