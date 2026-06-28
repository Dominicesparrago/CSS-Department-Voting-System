export const STUDENT_EMAIL_PATTERN = /^[a-z0-9._-]+\.scc@gmail\.com$/;
export const STUDENT_NO_PATTERN = /^[0-9]{7,9}$/;

export function validateRegistration(values) {
  const errors = {};

  if (!STUDENT_EMAIL_PATTERN.test(values.email)) {
    errors.email = "Use your official <name>.scc@gmail.com email.";
  }

  if (!values.password || values.password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }

  if (!STUDENT_NO_PATTERN.test(values.studentNo)) {
    errors.studentNo = "Student ID must be 7 to 9 digits.";
  }

  if (!values.fullName) {
    errors.fullName = "Full name is required.";
  }

  if (![1, 2, 3, 4].includes(values.yearLevel)) {
    errors.yearLevel = "Select your year level.";
  }

  if (!values.section) {
    errors.section = "Section is required.";
  }

  return errors;
}

export function validateLogin(values) {
  const errors = {};

  if (!values.email) {
    errors.email = "Email is required.";
  }

  if (!values.password) {
    errors.password = "Password is required.";
  }

  return errors;
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}

