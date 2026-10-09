const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const University = require('./models/University');
const Country = require('./models/Country');
const ChatRoom = require('./models/ChatRoom');

const universityData = [
  {
    id: 'u1', name: 'University of Toronto', country: 'Canada', city: 'Toronto',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/04/Utoronto_coa.svg/120px-Utoronto_coa.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Convocation_Hall_%28University_of_Toronto%29.jpg/1280px-Convocation_Hall_%28University_of_Toronto%29.jpg',
    ranking: 18, type: 'Public', founded: 1827, website: 'https://www.utoronto.ca',
    description: 'The University of Toronto is a globally top-ranked public research university in Toronto, Ontario, Canada.',
    averageFees: { undergraduate: 30000, postgraduate: 35000, currency: 'CAD' },
    acceptanceRate: 43, totalStudents: 97000, internationalStudents: 25000, rating: 4.7,
    tags: ['Research', 'Engineering', 'Medicine', 'Arts'],
    facilities: ['World-class Library', 'Research Labs', 'Student Housing', 'Sports Complex', 'Medical Center'],
    scholarships: [
      { name: 'Lester B. Pearson International Scholarship', amount: 55000, currency: 'CAD', eligibility: 'International students with exceptional academic achievement', deadline: '2026-11-07' },
      { name: 'University of Toronto Scholars Program', amount: 7500, currency: 'CAD', eligibility: 'High academic achievement', deadline: '2026-01-13' },
    ],
    applicationDeadlines: [{ intake: 'September 2026', deadline: '2026-01-13' }, { intake: 'January 2027', deadline: '2026-10-01' }],
    courses: [
      { id: 'c1', name: 'Computer Science', level: 'Bachelor', duration: '4 years', tuitionFee: 32500, currency: 'CAD', requirements: ['IELTS 6.5', 'High School Diploma', 'Math'], description: 'Comprehensive CS program covering algorithms, AI, and software engineering.', department: 'Faculty of Arts & Science', intake: ['September', 'January'] },
      { id: 'c2', name: 'MBA', level: 'Master', duration: '2 years', tuitionFee: 48000, currency: 'CAD', requirements: ['IELTS 7.0', "Bachelor's Degree", 'GMAT 650+', '2 years work experience'], description: 'Rotman School of Management MBA program.', department: 'Rotman School of Management', intake: ['September'] },
      { id: 'c3', name: 'Data Science', level: 'Master', duration: '1.5 years', tuitionFee: 36000, currency: 'CAD', requirements: ['IELTS 6.5', "Bachelor's in CS/Math/Stats"], description: 'Advanced data science and machine learning program.', department: 'Faculty of Arts & Science', intake: ['September', 'January'] },
    ],
  },
  {
    id: 'u2', name: 'University of Melbourne', country: 'Australia', city: 'Melbourne',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/10/University_of_Melbourne_logo.svg/120px-University_of_Melbourne_logo.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/The_University_of_Melbourne.JPG/1280px-The_University_of_Melbourne.JPG',
    ranking: 33, type: 'Public', founded: 1853, website: 'https://www.unimelb.edu.au',
    description: "Australia's leading university and one of the world's top 50 universities.",
    averageFees: { undergraduate: 38000, postgraduate: 42000, currency: 'AUD' },
    acceptanceRate: 70, totalStudents: 52000, internationalStudents: 17000, rating: 4.6,
    tags: ['Research', 'Medicine', 'Law', 'Engineering'],
    facilities: ['Research Centers', 'Student Accommodation', 'Sports Hub', 'Arts Center'],
    scholarships: [
      { name: 'Melbourne International Undergraduate Scholarship', amount: 10000, currency: 'AUD', eligibility: 'Academic excellence', deadline: '2026-10-31' },
      { name: 'Graduate Research Scholarships', amount: 28000, currency: 'AUD', eligibility: 'Research students', deadline: '2026-10-31' },
    ],
    applicationDeadlines: [{ intake: 'February 2026', deadline: '2025-10-31' }, { intake: 'July 2026', deadline: '2026-04-30' }],
    courses: [
      { id: 'c4', name: 'Information Technology', level: 'Bachelor', duration: '3 years', tuitionFee: 36000, currency: 'AUD', requirements: ['IELTS 6.5', 'High School Diploma'], description: 'A broad IT program with specializations in AI, networking, and security.', department: 'Faculty of Engineering', intake: ['February', 'July'] },
      { id: 'c5', name: 'Business Administration', level: 'Master', duration: '2 years', tuitionFee: 44000, currency: 'AUD', requirements: ['IELTS 7.0', "Bachelor's Degree"], description: 'Melbourne Business School MBA', department: 'Melbourne Business School', intake: ['February'] },
      { id: 'c6', name: 'Architecture', level: 'Bachelor', duration: '3 years', tuitionFee: 38000, currency: 'AUD', requirements: ['IELTS 7.0', 'Portfolio'], description: 'Architecture and urban design program.', department: 'Faculty of Architecture', intake: ['February'] },
    ],
  },
  {
    id: 'u3', name: 'University of Edinburgh', country: 'United Kingdom', city: 'Edinburgh',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/University_of_Edinburgh_ceremonial_roundel.svg/120px-University_of_Edinburgh_ceremonial_roundel.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Old_College%2C_University_of_Edinburgh.JPG/1280px-Old_College%2C_University_of_Edinburgh.JPG',
    ranking: 22, type: 'Public', founded: 1583, website: 'https://www.ed.ac.uk',
    description: 'One of the oldest and most prestigious universities in the world, situated in Scotland.',
    averageFees: { undergraduate: 23000, postgraduate: 26000, currency: 'GBP' },
    acceptanceRate: 45, totalStudents: 42000, internationalStudents: 14000, rating: 4.8,
    tags: ['Ancient University', 'Research', 'Medicine', 'Philosophy'],
    facilities: ['Historic Libraries', 'Research Institutes', 'Student Union', 'Accommodation'],
    scholarships: [
      { name: 'Edinburgh Global Research Scholarship', amount: 15000, currency: 'GBP', eligibility: 'PhD students', deadline: '2026-03-31' },
      { name: 'Stevenson Exchange Scholarship', amount: 6000, currency: 'GBP', eligibility: 'Exchange students', deadline: '2026-02-28' },
    ],
    applicationDeadlines: [{ intake: 'September 2026', deadline: '2026-03-31' }],
    courses: [
      { id: 'c7', name: 'Artificial Intelligence', level: 'Master', duration: '1 year', tuitionFee: 28000, currency: 'GBP', requirements: ['IELTS 6.5', "Bachelor's in CS"], description: 'Cutting-edge AI and machine learning program.', department: 'School of Informatics', intake: ['September'] },
      { id: 'c8', name: 'Medicine (MBChB)', level: 'Bachelor', duration: '6 years', tuitionFee: 35000, currency: 'GBP', requirements: ['IELTS 7.0', 'A-Levels or equivalent', 'UCAT'], description: "One of the world's leading medical programs.", department: 'Medical School', intake: ['September'] },
      { id: 'c9', name: 'Finance & Investment', level: 'Master', duration: '1 year', tuitionFee: 27000, currency: 'GBP', requirements: ['IELTS 7.0', "Bachelor's in Finance/Economics"], description: 'Finance and investment management program.', department: 'Business School', intake: ['September'] },
    ],
  },
  {
    id: 'u4', name: 'TU Munich', country: 'Germany', city: 'Munich',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/TU_Muenchen_Logo.svg/120px-TU_Muenchen_Logo.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/TUM-Audimax.JPG/1280px-TUM-Audimax.JPG',
    ranking: 37, type: 'Public', founded: 1868, website: 'https://www.tum.de',
    description: "Technical University of Munich is one of Europe's top universities for engineering and natural sciences.",
    averageFees: { undergraduate: 2000, postgraduate: 2500, currency: 'EUR' },
    acceptanceRate: 50, totalStudents: 50000, internationalStudents: 13000, rating: 4.7,
    tags: ['Engineering', 'Technology', 'Affordable', 'Research'],
    facilities: ['Innovation Labs', 'Sports Center', 'Student Canteen', 'Library'],
    scholarships: [
      { name: 'DAAD Scholarship', amount: 10000, currency: 'EUR', eligibility: 'International students', deadline: '2026-10-15' },
      { name: 'TUM Merit Scholarship', amount: 5000, currency: 'EUR', eligibility: 'Academic excellence', deadline: '2026-09-01' },
    ],
    applicationDeadlines: [{ intake: 'January 2027', deadline: '2026-05-31' }, { intake: 'April 2026', deadline: '2026-01-15' }],
    courses: [
      { id: 'c10', name: 'Mechanical Engineering', level: 'Bachelor', duration: '6 semesters', tuitionFee: 2000, currency: 'EUR', requirements: ['TestDaF or IELTS 6.0', 'Strong Math background'], description: 'World-class mechanical engineering education.', department: 'TUM School of Engineering', intake: ['January', 'April'] },
      { id: 'c11', name: 'Informatics (Computer Science)', level: 'Master', duration: '4 semesters', tuitionFee: 2500, currency: 'EUR', requirements: ['IELTS 6.5', "Bachelor's in CS"], description: "Top-ranked CS master's program.", department: 'TUM School of Computation', intake: ['January'] },
      { id: 'c12', name: 'Robotics', level: 'Master', duration: '4 semesters', tuitionFee: 2500, currency: 'EUR', requirements: ['IELTS 6.5', "Bachelor's in Engineering/CS"], description: 'Advanced robotics and autonomous systems.', department: 'TUM School of Engineering', intake: ['January'] },
    ],
  },
  {
    id: 'u5', name: 'National University of Singapore', country: 'Singapore', city: 'Singapore',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b9/NUS_coat_of_arms.svg/120px-NUS_coat_of_arms.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Main_entrance_to_Temasek_Hall%2C_NUS.JPG/1280px-Main_entrance_to_Temasek_Hall%2C_NUS.JPG',
    ranking: 8, type: 'Public', founded: 1905, website: 'https://www.nus.edu.sg',
    description: "Asia's leading global university consistently ranked top 15 in the world.",
    averageFees: { undergraduate: 18000, postgraduate: 22000, currency: 'SGD' },
    acceptanceRate: 25, totalStudents: 40000, internationalStudents: 12000, rating: 4.9,
    tags: ['Top Ranked', 'Asia', 'Business', 'Engineering', 'Research'],
    facilities: ['Smart Campus', 'Research Parks', 'University Town', 'Sports Facilities'],
    scholarships: [
      { name: 'NUS Global Merit Scholarship', amount: 20000, currency: 'SGD', eligibility: 'All incoming undergraduates', deadline: '2026-02-28' },
      { name: 'ASEAN Undergraduate Scholarship', amount: 15000, currency: 'SGD', eligibility: 'ASEAN nationals', deadline: '2026-02-28' },
    ],
    applicationDeadlines: [{ intake: 'August 2026', deadline: '2026-03-01' }],
    courses: [
      { id: 'c13', name: 'Computer Science', level: 'Bachelor', duration: '4 years', tuitionFee: 18500, currency: 'SGD', requirements: ['IELTS 6.5', 'Strong academic record'], description: "SOC is Asia's top CS school.", department: 'School of Computing', intake: ['August'] },
      { id: 'c14', name: 'Business Analytics', level: 'Master', duration: '1 year', tuitionFee: 26000, currency: 'SGD', requirements: ['IELTS 7.0', "Bachelor's Degree", 'Quantitative background'], description: 'Combine business intelligence with analytics tools.', department: 'NUS Business School', intake: ['August'] },
    ],
  },
  {
    id: 'u6', name: 'University of Amsterdam', country: 'Netherlands', city: 'Amsterdam',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/90/UvA_logo.svg/120px-UvA_logo.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Amsterdam%2C_university%2C_2012.JPG/1280px-Amsterdam%2C_university%2C_2012.JPG',
    ranking: 55, type: 'Public', founded: 1632, website: 'https://www.uva.nl',
    description: "One of Europe's premier research universities, known for innovation and international culture.",
    averageFees: { undergraduate: 12000, postgraduate: 16000, currency: 'EUR' },
    acceptanceRate: 55, totalStudents: 36000, internationalStudents: 10000, rating: 4.5,
    tags: ['Europe', 'Research', 'International', 'Affordable'],
    facilities: ['City-integrated Campus', 'Research Libraries', 'Student Sports', 'International Office'],
    scholarships: [{ name: 'Amsterdam Excellence Scholarship', amount: 25000, currency: 'EUR', eligibility: 'Top non-EU students', deadline: '2026-02-01' }],
    applicationDeadlines: [{ intake: 'September 2026', deadline: '2026-04-01' }],
    courses: [
      { id: 'c15', name: 'International Business', level: 'Bachelor', duration: '3 years', tuitionFee: 12000, currency: 'EUR', requirements: ['IELTS 6.5'], description: 'International business management program.', department: 'Amsterdam Business School', intake: ['September'] },
      { id: 'c16', name: 'Artificial Intelligence', level: 'Bachelor', duration: '3 years', tuitionFee: 13000, currency: 'EUR', requirements: ['IELTS 6.5', 'Math background'], description: 'AI and cognitive science program.', department: 'Faculty of Science', intake: ['September'] },
    ],
  },
  {
    id: 'u7', name: 'University of British Columbia', country: 'Canada', city: 'Vancouver',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6e/UBC_coat_of_arms.svg/120px-UBC_coat_of_arms.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/The_University_of_British_Columbia_%2848856934403%29.jpg/1280px-The_University_of_British_Columbia_%2848856934403%29.jpg',
    ranking: 34, type: 'Public', founded: 1908, website: 'https://www.ubc.ca',
    description: "One of the world's leading universities, UBC creates an exceptional learning environment.",
    averageFees: { undergraduate: 35000, postgraduate: 40000, currency: 'CAD' },
    acceptanceRate: 52, totalStudents: 68000, internationalStudents: 17000, rating: 4.6,
    tags: ['Canada', 'Research', 'Sustainability', 'Engineering'],
    facilities: ['Research Centers', 'Botanical Garden', 'Hospital', 'Arts Campus'],
    scholarships: [{ name: 'International Major Entrance Scholarship', amount: 20000, currency: 'CAD', eligibility: 'New international undergrads', deadline: '2026-12-01' }],
    applicationDeadlines: [{ intake: 'September 2026', deadline: '2026-01-15' }],
    courses: [
      { id: 'c17', name: 'Engineering', level: 'Bachelor', duration: '4 years', tuitionFee: 38000, currency: 'CAD', requirements: ['IELTS 6.5', 'Strong Math/Science'], description: 'Multi-disciplinary engineering program.', department: 'Faculty of Applied Science', intake: ['September'] },
      { id: 'c18', name: 'Psychology', level: 'Bachelor', duration: '4 years', tuitionFee: 32000, currency: 'CAD', requirements: ['IELTS 6.5'], description: 'Comprehensive psychology program.', department: 'Faculty of Arts', intake: ['September', 'January'] },
    ],
  },
  {
    id: 'u8', name: 'Monash University', country: 'Australia', city: 'Melbourne',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b7/Monash_University_logo.svg/120px-Monash_University_logo.svg.png',
    coverImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Clayton_-_Monash_University.jpg/1280px-Clayton_-_Monash_University.jpg',
    ranking: 42, type: 'Public', founded: 1958, website: 'https://www.monash.edu',
    description: 'A leading research university and member of the Group of Eight.',
    averageFees: { undergraduate: 34000, postgraduate: 38000, currency: 'AUD' },
    acceptanceRate: 65, totalStudents: 54000, internationalStudents: 18000, rating: 4.5,
    tags: ['Australia', 'Engineering', 'Medicine', 'Research'],
    facilities: ['Innovation Hub', 'Health Sciences', 'Accommodation', 'Cultural Center'],
    scholarships: [{ name: 'Monash International Leadership Scholarship', amount: 10000, currency: 'AUD', eligibility: 'High-achieving international students', deadline: '2026-10-31' }],
    applicationDeadlines: [{ intake: 'February 2026', deadline: '2025-11-30' }, { intake: 'July 2026', deadline: '2026-05-31' }],
    courses: [
      { id: 'c19', name: 'Law', level: 'Bachelor', duration: '4 years', tuitionFee: 38000, currency: 'AUD', requirements: ['IELTS 7.0', 'High Academic Record'], description: 'Bachelor of Laws with specializations.', department: 'Faculty of Law', intake: ['February'] },
      { id: 'c20', name: 'Pharmacy', level: 'Bachelor', duration: '4 years', tuitionFee: 36000, currency: 'AUD', requirements: ['IELTS 7.0', 'Science background'], description: 'Pharmacy and pharmaceutical sciences.', department: 'Faculty of Pharmacy', intake: ['February'] },
    ],
  },
];

async function run() {
  // Wipes every user and recreates demo accounts with passwords that are in this file. Never against production data.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the demo seed with NODE_ENV=production: it deletes all users and creates accounts with known passwords.');
  }
  await User.deleteMany({});
  await University.deleteMany({});
  await ChatRoom.deleteMany({});
  console.log('Cleared existing data');

  await University.insertMany(universityData);
  console.log('Universities seeded');

  const studentPass = await bcrypt.hash('student123', 10);
  const counselorPass = await bcrypt.hash('counselor123', 10);
  const adminPass = await bcrypt.hash('admin123', 10);
  const demoPass = await bcrypt.hash('demo123', 10);

  await User.create({
    name: 'Admin', email: 'admin@eduabroad.com', password: adminPass, role: 'admin',
    specialization: [], assignedStudents: [],
  });

  // Demo accounts for the login modal
  await User.create([
    { name: 'Demo Student', email: 'student@demo.com', password: demoPass, role: 'student', status: 'active', joinedDate: new Date().toISOString().split('T')[0] },
    { name: 'Demo Counselor', email: 'counselor@demo.com', password: demoPass, role: 'counselor', status: 'active', joinedDate: new Date().toISOString().split('T')[0], specialization: [], assignedStudents: [] },
    { name: 'Demo Admin', email: 'admin@demo.com', password: demoPass, role: 'admin', status: 'active', joinedDate: new Date().toISOString().split('T')[0], specialization: [], assignedStudents: [] },
  ]);
  console.log('Admin seeded');

  const [kavitha, rajesh] = await User.create([
    {
      name: 'Dr. Kavitha Reddy', email: 'kavitha@eduabroad.com', password: counselorPass, role: 'counselor',
      specialization: ['UK Universities', 'Canada Universities', 'Medical Programs'],
      assignedStudents: [], experience: 8,
    },
    {
      name: 'Mr. Rajesh Kumar', email: 'rajesh@eduabroad.com', password: counselorPass, role: 'counselor',
      specialization: ['Germany', 'Netherlands', 'Australia', 'Engineering'],
      assignedStudents: [], experience: 6,
    },
  ]);
  console.log('Counselors seeded');

  const [aryan, priya, mohammed, lan, sara] = await User.create([
    {
      name: 'Aryan Sharma', email: 'aryan@example.com', password: studentPass, role: 'student',
      phone: '+91 98765 43210', nationality: 'Indian', educationLevel: "Bachelor's (Completed)",
      gpa: 8.5, englishScore: { type: 'IELTS', score: 7.0 },
      preferredCountries: ['Canada', 'Australia'], budget: 40000,
      interestedCourses: ['Computer Science', 'Data Science'],
      counselorId: kavitha._id.toString(), joinedDate: '2025-08-15', status: 'active',
      applications: [
        { studentId: '', universityId: 'u1', universityName: 'University of Toronto', courseId: 'c3', courseName: 'Data Science', status: 'under_review', submittedDate: '2025-10-15', updatedDate: '2025-11-01', intake: 'September 2026' },
        { studentId: '', universityId: 'u7', universityName: 'University of British Columbia', courseId: 'c17', courseName: 'Engineering', status: 'offer_received', submittedDate: '2025-10-20', updatedDate: '2025-11-10', intake: 'September 2026' },
      ],
      documents: [
        { name: 'Passport', type: 'Identity', uploadedDate: '2025-09-01', status: 'verified' },
        { name: 'Transcripts', type: 'Academic', uploadedDate: '2025-09-05', status: 'verified' },
        { name: 'IELTS Certificate', type: 'Language', uploadedDate: '2025-09-10', status: 'verified' },
        { name: 'Statement of Purpose', type: 'Essay', uploadedDate: '2025-10-01', status: 'pending' },
      ],
    },
    {
      name: 'Priya Patel', email: 'priya@example.com', password: studentPass, role: 'student',
      phone: '+91 87654 32109', nationality: 'Indian', educationLevel: '12th Grade (Completed)',
      gpa: 9.1, englishScore: { type: 'IELTS', score: 7.5 },
      preferredCountries: ['United Kingdom', 'Singapore'], budget: 35000,
      interestedCourses: ['Medicine', 'Pharmacy'],
      counselorId: kavitha._id.toString(), joinedDate: '2025-09-20', status: 'active',
      applications: [
        { studentId: '', universityId: 'u3', universityName: 'University of Edinburgh', courseId: 'c8', courseName: 'Medicine (MBChB)', status: 'submitted', submittedDate: '2025-11-01', updatedDate: '2025-11-01', intake: 'September 2026' },
      ],
      documents: [
        { name: 'Passport', type: 'Identity', uploadedDate: '2025-10-01', status: 'verified' },
        { name: 'IELTS Certificate', type: 'Language', uploadedDate: '2025-10-05', status: 'verified' },
      ],
    },
    {
      name: 'Mohammed Al-Rashid', email: 'rashid@example.com', password: studentPass, role: 'student',
      phone: '+971 55 123 4567', nationality: 'UAE', educationLevel: "Bachelor's (Completed)",
      gpa: 7.8, englishScore: { type: 'TOEFL', score: 100 },
      preferredCountries: ['Germany', 'Netherlands'], budget: 20000,
      interestedCourses: ['Engineering', 'Robotics'],
      counselorId: rajesh._id.toString(), joinedDate: '2025-07-10', status: 'active',
      applications: [
        { studentId: '', universityId: 'u4', universityName: 'TU Munich', courseId: 'c12', courseName: 'Robotics', status: 'accepted', submittedDate: '2025-09-01', updatedDate: '2025-11-15', intake: 'January 2027' },
      ],
      documents: [
        { name: 'Passport', type: 'Identity', uploadedDate: '2025-08-15', status: 'verified' },
        { name: 'Degree Certificate', type: 'Academic', uploadedDate: '2025-08-20', status: 'verified' },
        { name: 'TOEFL Certificate', type: 'Language', uploadedDate: '2025-08-25', status: 'verified' },
      ],
    },
    {
      name: 'Nguyen Thi Lan', email: 'lan@example.com', password: studentPass, role: 'student',
      phone: '+84 912 345 678', nationality: 'Vietnamese', educationLevel: '12th Grade (Completed)',
      gpa: 8.9, englishScore: { type: 'IELTS', score: 6.5 },
      preferredCountries: ['Australia', 'Canada'], budget: 45000,
      interestedCourses: ['Business', 'Finance'],
      counselorId: rajesh._id.toString(), joinedDate: '2025-11-01', status: 'active',
      applications: [],
      documents: [
        { name: 'Passport', type: 'Identity', uploadedDate: '2025-11-01', status: 'pending' },
      ],
    },
    {
      name: 'Sara Ahmed', email: 'sara@example.com', password: studentPass, role: 'student',
      phone: '+92 321 456 7890', nationality: 'Pakistani', educationLevel: "Bachelor's (Completed)",
      gpa: 8.2, englishScore: { type: 'IELTS', score: 7.0 },
      preferredCountries: ['United Kingdom'], budget: 30000,
      interestedCourses: ['Finance', 'Business'],
      counselorId: kavitha._id.toString(), joinedDate: '2025-09-10', status: 'active',
      applications: [
        { studentId: '', universityId: 'u3', universityName: 'University of Edinburgh', courseId: 'c9', courseName: 'Finance & Investment', status: 'offer_received', submittedDate: '2025-10-10', updatedDate: '2025-11-20', intake: 'September 2026' },
      ],
      documents: [
        { name: 'Passport', type: 'Identity', uploadedDate: '2025-09-15', status: 'verified' },
        { name: 'Transcripts', type: 'Academic', uploadedDate: '2025-09-20', status: 'verified' },
        { name: 'IELTS Certificate', type: 'Language', uploadedDate: '2025-09-22', status: 'verified' },
        { name: 'Recommendation Letter', type: 'Reference', uploadedDate: '2025-10-01', status: 'pending' },
      ],
    },
  ]);
  console.log('Students seeded');

  // Fix studentId references in embedded applications
  for (const student of [aryan, priya, mohammed, lan, sara]) {
    for (const app of student.applications) {
      app.studentId = student._id.toString();
    }
    await student.save();
  }

  // Update counselors with student IDs
  await User.findByIdAndUpdate(kavitha._id, {
    assignedStudents: [aryan._id.toString(), priya._id.toString(), sara._id.toString()],
  });
  await User.findByIdAndUpdate(rajesh._id, {
    assignedStudents: [mohammed._id.toString(), lan._id.toString()],
  });
  console.log('Counselor-student assignments updated');

  // Create chat rooms
  const now = new Date();
  const ts = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60000);

  await ChatRoom.create([
    {
      participants: [aryan._id.toString(), kavitha._id.toString()],
      participantNames: ['Aryan Sharma', 'Dr. Kavitha Reddy'],
      type: 'student-counselor',
      messages: [
        { senderId: kavitha._id.toString(), senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: 'Hi Aryan! I reviewed your application for University of Toronto. Everything looks good. We just need your SOP finalized.', timestamp: ts(120), read: true },
        { senderId: aryan._id.toString(), senderName: 'Aryan Sharma', senderRole: 'student', content: "Thank you Dr. Kavitha! I've been working on it. Should I mention my internship experience?", timestamp: ts(115), read: true },
        { senderId: kavitha._id.toString(), senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: 'Absolutely! Highlight your technical internship and how it connects to the Data Science program. That will strengthen your application significantly.', timestamp: ts(110), read: true },
        { senderId: aryan._id.toString(), senderName: 'Aryan Sharma', senderRole: 'student', content: 'Got it! Also, UBC sent an offer letter. What should I do next?', timestamp: ts(30), read: true },
        { senderId: kavitha._id.toString(), senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: "Congratulations on the UBC offer! Let's schedule a call to discuss the next steps and compare both options.", timestamp: ts(25), read: false },
      ],
    },
    {
      participants: [priya._id.toString(), kavitha._id.toString()],
      participantNames: ['Priya Patel', 'Dr. Kavitha Reddy'],
      type: 'student-counselor',
      messages: [
        { senderId: kavitha._id.toString(), senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: "Priya, your Edinburgh application has been submitted. They usually take 4-6 weeks to respond.", timestamp: ts(200), read: true },
        { senderId: priya._id.toString(), senderName: 'Priya Patel', senderRole: 'student', content: "Thank you! I'm nervous. Do I need to prepare for any interview?", timestamp: ts(190), read: true },
        { senderId: kavitha._id.toString(), senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: "Edinburgh Medicine typically has a Multiple Mini Interview (MMI). I'll share preparation resources.", timestamp: ts(185), read: true },
      ],
    },
  ]);
  console.log('Chat rooms seeded');

  // ── Countries ────────────────────────────────────────────────────────────
  await Country.deleteMany({});
  await Country.insertMany(countryData);
  console.log('Countries seeded');

  console.log('\n=== Seed complete! ===');
  console.log('Admin login: admin@eduabroad.com / admin123');
  console.log('Student login: aryan@example.com / student123');
  console.log('Counselor login: kavitha@eduabroad.com / counselor123');
}

const countryData = [
    {
      id: 'us', name: 'United States', flag: '🇺🇸', code: 'US',
      capital: 'Washington D.C.', region: 'North America', currency: 'USD', language: 'English',
      visa: { type: 'F-1 Student Visa', processingTime: '3–8 weeks', cost: 'USD 160', validity: 'Duration of course + 60 days', documents: ['DS-160 Form', 'SEVIS I-20 Form', 'Bank statements (3 months)', 'Academic transcripts', 'TOEFL/IELTS scores', 'Passport (6 months validity)', 'Visa photos'], notes: 'OPT (Optional Practical Training) work authorization available for 12–36 months post-graduation. CPT allowed during studies.' },
      passport: { minValidity: '6 months beyond intended stay', notes: 'Indian passport holders must obtain F-1 visa before travel. No visa-on-arrival.' },
      costs: { monthlyLivingMin: 800, monthlyLivingMax: 2500, currency: 'USD', applicationFee: 'USD 50–100 per university', tuitionRange: 'USD 15,000–60,000 / year' },
      popular: ['Computer Science', 'MBA', 'Engineering', 'Data Science', 'Medicine'],
    },
    {
      id: 'uk', name: 'United Kingdom', flag: '🇬🇧', code: 'GB',
      capital: 'London', region: 'Europe', currency: 'GBP', language: 'English',
      visa: { type: 'Student Visa (formerly Tier 4)', processingTime: '3 weeks', cost: 'GBP 363', validity: 'Duration of course + 4 months', documents: ['CAS (Confirmation of Acceptance for Studies)', 'Bank statements (28 days)', 'Academic transcripts', 'IELTS scores (6.0+)', 'TB test results (Indian nationals)', 'Passport', 'Visa photos'], notes: 'Graduate Route visa allows 2 years post-study work (3 for PhD). IHS payment of GBP 776/year is mandatory.' },
      passport: { minValidity: '6 months from travel date', notes: 'TB test mandatory for Indian nationals. IHS (Immigration Health Surcharge) must be paid upfront.' },
      costs: { monthlyLivingMin: 900, monthlyLivingMax: 2000, currency: 'GBP', applicationFee: 'GBP 20–100 (via UCAS)', tuitionRange: 'GBP 10,000–38,000 / year' },
      popular: ['Business & MBA', 'Law', 'Engineering', 'Computer Science', 'Medicine'],
    },
    {
      id: 'ca', name: 'Canada', flag: '🇨🇦', code: 'CA',
      capital: 'Ottawa', region: 'North America', currency: 'CAD', language: 'English / French',
      visa: { type: 'Study Permit', processingTime: '4–12 weeks', cost: 'CAD 150', validity: 'Duration of program + 90 days', documents: ['Acceptance letter from DLI', 'Proof of funds (CAD 10,000+)', 'Passport', 'Statement of purpose', 'Biometrics enrollment', 'IELTS/TOEFL scores'], notes: 'PGWP (Post-Graduate Work Permit) up to 3 years available. Express Entry immigration pathway after graduation.' },
      passport: { minValidity: 'Valid for entire stay', notes: 'Biometrics enrollment required at a VAC. Medical exam may be required based on country of residence.' },
      costs: { monthlyLivingMin: 700, monthlyLivingMax: 2000, currency: 'CAD', applicationFee: 'CAD 50–200 per university', tuitionRange: 'CAD 15,000–40,000 / year' },
      popular: ['Computer Science', 'Engineering', 'Business', 'Data Science', 'Nursing'],
    },
    {
      id: 'au', name: 'Australia', flag: '🇦🇺', code: 'AU',
      capital: 'Canberra', region: 'Oceania', currency: 'AUD', language: 'English',
      visa: { type: 'Student Visa (Subclass 500)', processingTime: '1–4 months', cost: 'AUD 650', validity: 'Duration of course + 1 month', documents: ['CoE (Confirmation of Enrolment)', 'OSHC (health cover)', 'Proof of funds', 'IELTS 6.0+ scores', 'GTE statement', 'Passport', 'Police clearance'], notes: 'Temporary Graduate visa (subclass 485) available post-graduation. Can work 48 hours per fortnight during studies.' },
      passport: { minValidity: '6 months beyond intended stay', notes: 'Health exam may be required. Overseas Student Health Cover (OSHC) is mandatory for duration of stay.' },
      costs: { monthlyLivingMin: 1000, monthlyLivingMax: 2500, currency: 'AUD', applicationFee: 'AUD 0–100 per university', tuitionRange: 'AUD 20,000–45,000 / year' },
      popular: ['Engineering', 'Business', 'Medicine', 'IT', 'Hospitality'],
    },
    {
      id: 'de', name: 'Germany', flag: '🇩🇪', code: 'DE',
      capital: 'Berlin', region: 'Europe', currency: 'EUR', language: 'German / English',
      visa: { type: 'National Visa (D) – Student', processingTime: '6–12 weeks', cost: 'EUR 75', validity: 'Up to 90 days (converted to residence permit on arrival)', documents: ['University admission letter', 'Blocked account (EUR 11,208/year)', 'Academic transcripts', 'German/English proficiency', 'Health insurance', 'Passport', 'Motivationsschreiben (SOP)'], notes: 'Most public universities charge NO tuition (only semester fees ~EUR 150–350). 18-month job-seeker visa available after graduation.' },
      passport: { minValidity: '3 months beyond stay', notes: 'Blocked account (Sperrkonto) is mandatory. Apply at German embassy/consulate in India.' },
      costs: { monthlyLivingMin: 700, monthlyLivingMax: 1200, currency: 'EUR', applicationFee: 'EUR 0–75 per university', tuitionRange: 'EUR 0 (public) – 20,000 (private) / year' },
      popular: ['Engineering', 'Computer Science', 'Automotive', 'Physics', 'MBA'],
    },
    {
      id: 'sg', name: 'Singapore', flag: '🇸🇬', code: 'SG',
      capital: 'Singapore', region: 'Southeast Asia', currency: 'SGD', language: 'English',
      visa: { type: "Student's Pass (STP)", processingTime: '4–8 weeks', cost: 'SGD 30 (IPA) + SGD 60 (card)', validity: 'Duration of course', documents: ['IPA (In-Principle Approval) letter', 'SOLAR online registration', 'Passport', 'Academic transcripts', 'Medical examination', 'Passport photos'], notes: 'Administered through ICA SOLAR system. Government scholarships (MOE Tuition Grant) available for eligible students.' },
      passport: { minValidity: '6 months from date of STP application', notes: 'Medical examination required. Must register with ICA within 30 days of arrival.' },
      costs: { monthlyLivingMin: 1200, monthlyLivingMax: 3000, currency: 'SGD', applicationFee: 'SGD 0–100 per university', tuitionRange: 'SGD 17,000–45,000 / year' },
      popular: ['Business', 'Finance', 'Engineering', 'Computing', 'Science'],
    },
    {
      id: 'nl', name: 'Netherlands', flag: '🇳🇱', code: 'NL',
      capital: 'Amsterdam', region: 'Europe', currency: 'EUR', language: 'Dutch / English',
      visa: { type: 'MVV + Residence Permit (for non-EU)', processingTime: '2–4 weeks (MVV)', cost: 'EUR 207', validity: 'Duration of study', documents: ['Admission letter', 'Proof of funds (EUR 863/month)', 'Health insurance', 'Passport', 'Apostilled documents', 'Notarized diploma'], notes: 'Orientation Year (Zoekjaar) permit — 1 year after graduation to find work. Many programs fully in English.' },
      passport: { minValidity: '6 months beyond duration of stay', notes: 'University often arranges MVV application on behalf of student.' },
      costs: { monthlyLivingMin: 900, monthlyLivingMax: 1500, currency: 'EUR', applicationFee: 'EUR 0–75 per university', tuitionRange: 'EUR 8,000–20,000 / year' },
      popular: ['Engineering', 'Business', 'Design', 'Agriculture', 'Psychology'],
    },
    {
      id: 'nz', name: 'New Zealand', flag: '🇳🇿', code: 'NZ',
      capital: 'Wellington', region: 'Oceania', currency: 'NZD', language: 'English',
      visa: { type: 'Student Visa', processingTime: '1–3 months', cost: 'NZD 375', validity: 'Duration of course', documents: ['Offer of place from NZ institution', 'Proof of funds (NZD 15,000/year)', 'Return ticket', 'Health certificate', 'IELTS 5.5+ scores', 'Passport'], notes: 'Post-study work visa available for 1–3 years. Can work 20 hours/week during studies. Police clearance from India required.' },
      passport: { minValidity: '3 months beyond intended stay', notes: 'Medical and chest X-ray required if staying 12+ months.' },
      costs: { monthlyLivingMin: 900, monthlyLivingMax: 2000, currency: 'NZD', applicationFee: 'NZD 0–100 per university', tuitionRange: 'NZD 22,000–35,000 / year' },
      popular: ['Agriculture', 'Engineering', 'Business', 'IT', 'Healthcare'],
    },
];

// Allow running standalone: node seed.js
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => run())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { run, universityData, countryData };
