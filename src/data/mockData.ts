import { Student, Counselor, Application, ChatRoom, ChatMessage } from '../types';

export const mockStudents: Student[] = [
  {
    id: 's1', name: 'Aryan Sharma', email: 'aryan@example.com', role: 'student',
    phone: '+91 98765 43210', nationality: 'Indian',
    educationLevel: "Bachelor's (Completed)", gpa: 8.5,
    englishScore: { type: 'IELTS', score: 7.0 },
    preferredCountries: ['Canada', 'Australia'],
    budget: 40000,
    interestedCourses: ['Computer Science', 'Data Science'],
    applications: [
      { id: 'app1', studentId: 's1', universityId: 'u1', universityName: 'University of Toronto', courseId: 'c3', courseName: 'Data Science', status: 'under_review', submittedDate: '2025-10-15', updatedDate: '2025-11-01', intake: 'September 2026' },
      { id: 'app2', studentId: 's1', universityId: 'u7', universityName: 'University of British Columbia', courseId: 'c17', courseName: 'Engineering', status: 'offer_received', submittedDate: '2025-10-20', updatedDate: '2025-11-10', intake: 'September 2026' },
    ],
    documents: [
      { id: 'd1', name: 'Passport', type: 'Identity', uploadedDate: '2025-09-01', status: 'verified' },
      { id: 'd2', name: 'Transcripts', type: 'Academic', uploadedDate: '2025-09-05', status: 'verified' },
      { id: 'd3', name: 'IELTS Certificate', type: 'Language', uploadedDate: '2025-09-10', status: 'verified' },
      { id: 'd4', name: 'Statement of Purpose', type: 'Essay', uploadedDate: '2025-10-01', status: 'pending' },
    ],
    counselorId: 'co1',
    joinedDate: '2025-08-15',
    status: 'active',
  },
  {
    id: 's2', name: 'Priya Patel', email: 'priya@example.com', role: 'student',
    phone: '+91 87654 32109', nationality: 'Indian',
    educationLevel: "12th Grade (Completed)", gpa: 9.1,
    englishScore: { type: 'IELTS', score: 7.5 },
    preferredCountries: ['United Kingdom', 'Singapore'],
    budget: 35000,
    interestedCourses: ['Medicine', 'Pharmacy'],
    applications: [
      { id: 'app3', studentId: 's2', universityId: 'u3', universityName: 'University of Edinburgh', courseId: 'c8', courseName: 'Medicine (MBChB)', status: 'submitted', submittedDate: '2025-11-01', updatedDate: '2025-11-01', intake: 'September 2026' },
    ],
    documents: [
      { id: 'd5', name: 'Passport', type: 'Identity', uploadedDate: '2025-10-01', status: 'verified' },
      { id: 'd6', name: 'IELTS Certificate', type: 'Language', uploadedDate: '2025-10-05', status: 'verified' },
    ],
    counselorId: 'co1',
    joinedDate: '2025-09-20',
    status: 'active',
  },
  {
    id: 's3', name: 'Mohammed Al-Rashid', email: 'rashid@example.com', role: 'student',
    phone: '+971 55 123 4567', nationality: 'UAE',
    educationLevel: "Bachelor's (Completed)", gpa: 7.8,
    englishScore: { type: 'TOEFL', score: 100 },
    preferredCountries: ['Germany', 'Netherlands'],
    budget: 20000,
    interestedCourses: ['Engineering', 'Robotics'],
    applications: [
      { id: 'app4', studentId: 's3', universityId: 'u4', universityName: 'TU Munich', courseId: 'c12', courseName: 'Robotics', status: 'accepted', submittedDate: '2025-09-01', updatedDate: '2025-11-15', intake: 'January 2027' },
    ],
    documents: [
      { id: 'd7', name: 'Passport', type: 'Identity', uploadedDate: '2025-08-15', status: 'verified' },
      { id: 'd8', name: 'Degree Certificate', type: 'Academic', uploadedDate: '2025-08-20', status: 'verified' },
      { id: 'd9', name: 'TOEFL Certificate', type: 'Language', uploadedDate: '2025-08-25', status: 'verified' },
    ],
    counselorId: 'co2',
    joinedDate: '2025-07-10',
    status: 'active',
  },
  {
    id: 's4', name: 'Nguyen Thi Lan', email: 'lan@example.com', role: 'student',
    phone: '+84 912 345 678', nationality: 'Vietnamese',
    educationLevel: "12th Grade (Completed)", gpa: 8.9,
    englishScore: { type: 'IELTS', score: 6.5 },
    preferredCountries: ['Australia', 'Canada'],
    budget: 45000,
    interestedCourses: ['Business', 'Finance'],
    applications: [],
    documents: [
      { id: 'd10', name: 'Passport', type: 'Identity', uploadedDate: '2025-11-01', status: 'pending' },
    ],
    counselorId: 'co2',
    joinedDate: '2025-11-01',
    status: 'active',
  },
  {
    id: 's5', name: 'Sara Ahmed', email: 'sara@example.com', role: 'student',
    phone: '+92 321 456 7890', nationality: 'Pakistani',
    educationLevel: "Bachelor's (Completed)", gpa: 8.2,
    englishScore: { type: 'IELTS', score: 7.0 },
    preferredCountries: ['United Kingdom'],
    budget: 30000,
    interestedCourses: ['Finance', 'Business'],
    applications: [
      { id: 'app5', studentId: 's5', universityId: 'u3', universityName: 'University of Edinburgh', courseId: 'c9', courseName: 'Finance & Investment', status: 'offer_received', submittedDate: '2025-10-10', updatedDate: '2025-11-20', intake: 'September 2026' },
    ],
    documents: [
      { id: 'd11', name: 'Passport', type: 'Identity', uploadedDate: '2025-09-15', status: 'verified' },
      { id: 'd12', name: 'Transcripts', type: 'Academic', uploadedDate: '2025-09-20', status: 'verified' },
      { id: 'd13', name: 'IELTS Certificate', type: 'Language', uploadedDate: '2025-09-22', status: 'verified' },
      { id: 'd14', name: 'Recommendation Letter', type: 'Reference', uploadedDate: '2025-10-01', status: 'pending' },
    ],
    counselorId: 'co1',
    joinedDate: '2025-09-10',
    status: 'active',
  },
];

export const mockCounselors: Counselor[] = [
  {
    id: 'co1', name: 'Dr. Kavitha Reddy', email: 'kavitha@eduabroad.com', role: 'counselor',
    specialization: ['UK Universities', 'Canada Universities', 'Medical Programs'],
    assignedStudents: ['s1', 's2', 's5'],
    experience: 8,
  },
  {
    id: 'co2', name: 'Mr. Rajesh Kumar', email: 'rajesh@eduabroad.com', role: 'counselor',
    specialization: ['Germany', 'Netherlands', 'Australia', 'Engineering'],
    assignedStudents: ['s3', 's4'],
    experience: 6,
  },
];

const now = new Date();
const ts = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60000).toISOString();

export const mockChatRooms: ChatRoom[] = [
  {
    id: 'chat1',
    participants: ['s1', 'co1'],
    participantNames: ['Aryan Sharma', 'Dr. Kavitha Reddy'],
    type: 'student-counselor',
    messages: [
      { id: 'm1', senderId: 'co1', senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: 'Hi Aryan! I reviewed your application for University of Toronto. Everything looks good. We just need your SOP finalized.', timestamp: ts(120), read: true },
      { id: 'm2', senderId: 's1', senderName: 'Aryan Sharma', senderRole: 'student', content: 'Thank you Dr. Kavitha! I\'ve been working on it. Should I mention my internship experience?', timestamp: ts(115), read: true },
      { id: 'm3', senderId: 'co1', senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: 'Absolutely! Highlight your technical internship and how it connects to the Data Science program. That will strengthen your application significantly.', timestamp: ts(110), read: true },
      { id: 'm4', senderId: 's1', senderName: 'Aryan Sharma', senderRole: 'student', content: 'Got it! Also, UBC sent an offer letter. What should I do next?', timestamp: ts(30), read: true },
      { id: 'm5', senderId: 'co1', senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: 'Congratulations on the UBC offer! Let\'s schedule a call to discuss the next steps and compare both options.', timestamp: ts(25), read: false },
    ],
  },
  {
    id: 'chat2',
    participants: ['s2', 'co1'],
    participantNames: ['Priya Patel', 'Dr. Kavitha Reddy'],
    type: 'student-counselor',
    messages: [
      { id: 'm6', senderId: 'co1', senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: 'Priya, your Edinburgh application has been submitted. They usually take 4-6 weeks to respond.', timestamp: ts(200), read: true },
      { id: 'm7', senderId: 's2', senderName: 'Priya Patel', senderRole: 'student', content: 'Thank you! I\'m nervous. Do I need to prepare for any interview?', timestamp: ts(190), read: true },
      { id: 'm8', senderId: 'co1', senderName: 'Dr. Kavitha Reddy', senderRole: 'counselor', content: 'Edinburgh Medicine typically has a Multiple Mini Interview (MMI). I\'ll share preparation resources.', timestamp: ts(185), read: true },
    ],
  },
];

export const demoAccounts = [
  { email: 'aryan@example.com', password: 'student123', role: 'student' as const, id: 's1' },
  { email: 'kavitha@eduabroad.com', password: 'counselor123', role: 'counselor' as const, id: 'co1' },
];
