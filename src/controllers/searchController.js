const User = require('../models/User');
const Medicine = require('../models/Medicine');
const { TestPackage } = require('../models/TestPackage');
const { Hospital } = require('../models/Hospital');
const Appointment = require('../models/Appointment');

// Global search across all entities
const globalSearch = async (req, res) => {
  try {
    const { query, limit = 5 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      });
    }

    const searchRegex = { $regex: query, $options: 'i' };

    const [doctors, medicines, hospitals, testPackages] = await Promise.all([
      // Search doctors
      User.find({
        role: 'doctor',
        isActive: true,
        isVerified: true,
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { specialization: searchRegex },
          { 'qualifications.degree': searchRegex },
          { 'qualifications.institution': searchRegex }
        ]
      })
      .select('firstName lastName specialization profileImage ratings consultationFee')
      .limit(limit),

      // Search medicines
      Medicine.find({
        isActive: true,
        $or: [
          { name: searchRegex },
          { genericName: searchRegex },
          { manufacturer: searchRegex },
          { category: searchRegex },
          { tags: { $in: [new RegExp(query, 'i')] } }
        ]
      })
      .select('name genericName manufacturer category price images')
      .limit(limit),

      // Search hospitals
      Hospital.find({
        isActive: true,
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { 'address.city': searchRegex },
          { 'address.state': searchRegex },
          { 'departments.name': searchRegex },
          { type: searchRegex }
        ]
      })
      .select('name description address type departments ratings images')
      .limit(limit),

      // Search test packages
      TestPackage.find({
        isActive: true,
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { category: searchRegex },
          { 'tests.testName': searchRegex }
        ]
      })
      .select('name description category price tests homeCollectionAvailable')
      .limit(limit)
    ]);

    res.status(200).json({
      success: true,
      data: {
        doctors,
        medicines,
        hospitals,
        testPackages,
        totalResults: doctors.length + medicines.length + hospitals.length + testPackages.length
      }
    });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
};

// Advanced doctor search with filters
const searchDoctors = async (req, res) => {
  try {
    const {
      query,
      specialization,
      city,
      state,
      minFee,
      maxFee,
      minRating,
      availability,
      gender,
      experience,
      languages,
      consultationType,
      sortBy = 'rating',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    let filter = {
      role: 'doctor',
      isActive: true,
      isVerified: true
    };

    // Text search
    if (query) {
      filter.$or = [
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { specialization: { $regex: query, $options: 'i' } },
        { 'qualifications.degree': { $regex: query, $options: 'i' } },
        { 'qualifications.institution': { $regex: query, $options: 'i' } },
        { 'about': { $regex: query, $options: 'i' } }
      ];
    }

    // Specialization filter
    if (specialization) {
      filter.specialization = { $regex: specialization, $options: 'i' };
    }

    // Location filters
    if (city) {
      filter['address.city'] = { $regex: city, $options: 'i' };
    }
    if (state) {
      filter['address.state'] = { $regex: state, $options: 'i' };
    }

    // Fee range filter
    if (minFee || maxFee) {
      filter.consultationFee = {};
      if (minFee) filter.consultationFee.$gte = parseFloat(minFee);
      if (maxFee) filter.consultationFee.$lte = parseFloat(maxFee);
    }

    // Rating filter
    if (minRating) {
      filter['ratings.averageRating'] = { $gte: parseFloat(minRating) };
    }

    // Gender filter
    if (gender) {
      filter.gender = gender;
    }

    // Experience filter
    if (experience) {
      filter.experienceYears = { $gte: parseInt(experience) };
    }

    // Languages filter
    if (languages) {
      const languageArray = languages.split(',').map(lang => lang.trim());
      filter.languages = { $in: languageArray.map(lang => new RegExp(lang, 'i')) };
    }

    // Consultation type filter
    if (consultationType) {
      filter.consultationModes = { $in: [consultationType] };
    }

    // Availability filter (doctors available today)
    if (availability === 'today') {
      const today = new Date();
      const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      filter[`availability.${dayOfWeek}.isAvailable`] = true;
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'fee') {
      sortOptions.consultationFee = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'rating') {
      sortOptions['ratings.averageRating'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'experience') {
      sortOptions.experienceYears = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const doctors = await User.find(filter)
      .select('firstName lastName specialization profileImage ratings consultationFee experienceYears address qualifications availability languages consultationModes about')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    // Get unique specializations for filter suggestions
    const specializations = await User.distinct('specialization', {
      role: 'doctor',
      isActive: true,
      isVerified: true
    });

    res.status(200).json({
      success: true,
      data: {
        doctors,
        filters: {
          specializations: specializations.filter(s => s) // Remove null values
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Search doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Doctor search failed',
      error: error.message
    });
  }
};

// Advanced medicine search with filters
const searchMedicines = async (req, res) => {
  try {
    const {
      query,
      category,
      manufacturer,
      prescriptionRequired,
      minPrice,
      maxPrice,
      dosageForm,
      strength,
      inStock,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    let filter = { isActive: true };

    // Text search
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { genericName: { $regex: query, $options: 'i' } },
        { manufacturer: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { tags: { $in: [new RegExp(query, 'i')] } },
        { 'activeIngredients.name': { $regex: query, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Manufacturer filter
    if (manufacturer) {
      filter.manufacturer = { $regex: manufacturer, $options: 'i' };
    }

    // Prescription requirement filter
    if (prescriptionRequired !== undefined) {
      filter.prescriptionRequired = prescriptionRequired === 'true';
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter['price.sellingPrice'] = {};
      if (minPrice) filter['price.sellingPrice'].$gte = parseFloat(minPrice);
      if (maxPrice) filter['price.sellingPrice'].$lte = parseFloat(maxPrice);
    }

    // Dosage form filter
    if (dosageForm) {
      filter.dosageForm = { $regex: dosageForm, $options: 'i' };
    }

    // Strength filter
    if (strength) {
      filter.strength = { $regex: strength, $options: 'i' };
    }

    // Stock availability filter
    if (inStock === 'true') {
      filter['inventory.stock'] = { $gt: 0 };
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'price') {
      sortOptions['price.sellingPrice'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'rating') {
      sortOptions.avgRating = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'popularity') {
      sortOptions.totalSales = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const medicines = await Medicine.find(filter)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Medicine.countDocuments(filter);

    // Get filter suggestions
    const [categories, manufacturers, dosageForms] = await Promise.all([
      Medicine.distinct('category', { isActive: true }),
      Medicine.distinct('manufacturer', { isActive: true }),
      Medicine.distinct('dosageForm', { isActive: true })
    ]);

    res.status(200).json({
      success: true,
      data: {
        medicines,
        filters: {
          categories: categories.filter(c => c),
          manufacturers: manufacturers.filter(m => m),
          dosageForms: dosageForms.filter(d => d)
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Search medicines error:', error);
    res.status(500).json({
      success: false,
      message: 'Medicine search failed',
      error: error.message
    });
  }
};

// Advanced hospital search with filters
const searchHospitals = async (req, res) => {
  try {
    const {
      query,
      city,
      state,
      type,
      department,
      availableBeds,
      emergency,
      insurance,
      minRating,
      accreditation,
      sortBy = 'rating',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    let filter = { isActive: true };

    // Text search
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { 'departments.name': { $regex: query, $options: 'i' } },
        { 'address.city': { $regex: query, $options: 'i' } }
      ];
    }

    // Location filters
    if (city) {
      filter['address.city'] = { $regex: city, $options: 'i' };
    }
    if (state) {
      filter['address.state'] = { $regex: state, $options: 'i' };
    }

    // Hospital type filter
    if (type) {
      filter.type = type;
    }

    // Department filter
    if (department) {
      filter['departments.name'] = { $regex: department, $options: 'i' };
    }

    // Available beds filter
    if (availableBeds) {
      filter.$or = [
        { 'bedCapacity.general.available': { $gte: parseInt(availableBeds) } },
        { 'bedCapacity.icu.available': { $gte: parseInt(availableBeds) } },
        { 'bedCapacity.private.available': { $gte: parseInt(availableBeds) } },
        { 'bedCapacity.emergency.available': { $gte: parseInt(availableBeds) } }
      ];
    }

    // Emergency services filter
    if (emergency === 'true') {
      filter.$or = [
        { type: 'emergency' },
        { 'operatingHours.emergency24x7': true },
        { 'departments.name': { $regex: 'emergency', $options: 'i' } }
      ];
    }

    // Insurance filter
    if (insurance) {
      filter.insuranceAccepted = { $in: [new RegExp(insurance, 'i')] };
    }

    // Rating filter
    if (minRating) {
      filter['ratings.averageRating'] = { $gte: parseFloat(minRating) };
    }

    // Accreditation filter
    if (accreditation) {
      filter.accreditations = { $in: [new RegExp(accreditation, 'i')] };
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions['ratings.averageRating'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'beds') {
      // Sort by total available beds
      sortOptions['bedCapacity.general.available'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const hospitals = await Hospital.find(filter)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Hospital.countDocuments(filter);

    // Get filter suggestions
    const [cities, hospitalTypes, departmentNames, insuranceOptions] = await Promise.all([
      Hospital.distinct('address.city', { isActive: true }),
      Hospital.distinct('type', { isActive: true }),
      Hospital.distinct('departments.name', { isActive: true }),
      Hospital.distinct('insuranceAccepted', { isActive: true })
    ]);

    res.status(200).json({
      success: true,
      data: {
        hospitals,
        filters: {
          cities: cities.filter(c => c),
          types: hospitalTypes.filter(t => t),
          departments: departmentNames.filter(d => d),
          insuranceOptions: insuranceOptions.flat().filter(i => i)
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Search hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Hospital search failed',
      error: error.message
    });
  }
};

// Advanced test package search with filters
const searchTestPackages = async (req, res) => {
  try {
    const {
      query,
      category,
      minPrice,
      maxPrice,
      homeCollection,
      sampleType,
      reportDelivery,
      fasting,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    let filter = { isActive: true };

    // Text search
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } },
        { 'tests.testName': { $regex: query, $options: 'i' } }
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

    // Sample type filter
    if (sampleType) {
      filter.sampleType = { $regex: sampleType, $options: 'i' };
    }

    // Report delivery time filter
    if (reportDelivery) {
      filter.reportDeliveryTime = { $lte: parseInt(reportDelivery) };
    }

    // Fasting requirement filter
    if (fasting !== undefined) {
      filter.fastingRequired = fasting === 'true';
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'price') {
      sortOptions.price = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'popularity') {
      sortOptions.totalBookings = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'deliveryTime') {
      sortOptions.reportDeliveryTime = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const testPackages = await TestPackage.find(filter)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await TestPackage.countDocuments(filter);

    // Get filter suggestions
    const [categories, sampleTypes] = await Promise.all([
      TestPackage.distinct('category', { isActive: true }),
      TestPackage.distinct('sampleType', { isActive: true })
    ]);

    res.status(200).json({
      success: true,
      data: {
        testPackages,
        filters: {
          categories: categories.filter(c => c),
          sampleTypes: sampleTypes.filter(s => s)
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Search test packages error:', error);
    res.status(500).json({
      success: false,
      message: 'Test package search failed',
      error: error.message
    });
  }
};

// Search suggestions/autocomplete
const getSearchSuggestions = async (req, res) => {
  try {
    const { query, type, limit = 10 } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Query must be at least 2 characters'
      });
    }

    let suggestions = [];

    switch (type) {
      case 'doctors':
        suggestions = await User.find({
          role: 'doctor',
          isActive: true,
          isVerified: true,
          $or: [
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } },
            { specialization: { $regex: query, $options: 'i' } }
          ]
        })
        .select('firstName lastName specialization')
        .limit(limit);
        break;

      case 'medicines':
        suggestions = await Medicine.find({
          isActive: true,
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { genericName: { $regex: query, $options: 'i' } }
          ]
        })
        .select('name genericName category')
        .limit(limit);
        break;

      case 'hospitals':
        suggestions = await Hospital.find({
          isActive: true,
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { 'address.city': { $regex: query, $options: 'i' } }
          ]
        })
        .select('name address.city')
        .limit(limit);
        break;

      case 'tests':
        suggestions = await TestPackage.find({
          isActive: true,
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { 'tests.testName': { $regex: query, $options: 'i' } }
          ]
        })
        .select('name category')
        .limit(limit);
        break;

      default:
        // Mixed suggestions from all types
        const [doctors, medicines, hospitals, tests] = await Promise.all([
          User.find({
            role: 'doctor',
            isActive: true,
            isVerified: true,
            $or: [
              { firstName: { $regex: query, $options: 'i' } },
              { lastName: { $regex: query, $options: 'i' } },
              { specialization: { $regex: query, $options: 'i' } }
            ]
          }).select('firstName lastName specialization').limit(3),

          Medicine.find({
            isActive: true,
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { genericName: { $regex: query, $options: 'i' } }
            ]
          }).select('name genericName category').limit(3),

          Hospital.find({
            isActive: true,
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { 'address.city': { $regex: query, $options: 'i' } }
            ]
          }).select('name address.city').limit(2),

          TestPackage.find({
            isActive: true,
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { 'tests.testName': { $regex: query, $options: 'i' } }
            ]
          }).select('name category').limit(2)
        ]);

        suggestions = {
          doctors,
          medicines,
          hospitals,
          tests
        };
    }

    res.status(200).json({
      success: true,
      data: { suggestions }
    });
  } catch (error) {
    console.error('Get search suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get suggestions',
      error: error.message
    });
  }
};

// Get popular/trending searches
const getPopularSearches = async (req, res) => {
  try {
    // This would typically come from analytics/search logs
    // For now, we'll provide static popular searches
    const popularSearches = {
      doctors: ['Cardiologist', 'Dermatologist', 'Pediatrician', 'Orthopedist', 'Neurologist'],
      medicines: ['Paracetamol', 'Vitamin D', 'Calcium', 'Iron tablets', 'Cough syrup'],
      hospitals: ['Apollo Hospital', 'Fortis', 'Max Hospital', 'AIIMS', 'Medanta'],
      tests: ['Blood Test', 'X-Ray', 'ECG', 'Thyroid Test', 'Diabetes Test']
    };

    res.status(200).json({
      success: true,
      data: popularSearches
    });
  } catch (error) {
    console.error('Get popular searches error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get popular searches',
      error: error.message
    });
  }
};

module.exports = {
  globalSearch,
  searchDoctors,
  searchMedicines,
  searchHospitals,
  searchTestPackages,
  getSearchSuggestions,
  getPopularSearches
};
