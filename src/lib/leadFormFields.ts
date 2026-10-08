import type { LeadFormField } from '../api';

// Optional questions on a marketing form, in the order they appear. First/last name and phone are always asked.
export const LEAD_FORM_FIELDS: { key: LeadFormField; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'preferredCountries', label: 'Preferred country' },
  { key: 'preferredIntake', label: 'Preferred intake' },
  { key: 'preferredCourseLevel', label: 'Course level' },
  { key: 'qualification', label: 'Qualification and year of passing' },
  { key: 'message', label: 'Message' },
];

export const FORM_COUNTRIES = ['UK', 'USA', 'Canada', 'Australia', 'Germany', 'Ireland', 'New Zealand', 'France', 'Other'];
export const FORM_COURSE_LEVELS = ['Bachelors', 'Masters', 'PhD', 'Diploma / Certificate', 'Not sure yet'];

export const formUrl = (slug: string) => `${window.location.origin}/f/${slug}`;
