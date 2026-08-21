import { describe, expect, it } from 'vitest';
import {
  hasErrors,
  STUDENT_EMAIL_PATTERN,
  STUDENT_NO_PATTERN,
  validateGuest,
  validateLogin,
  validateRegistration,
} from './validation';

describe('STUDENT_EMAIL_PATTERN', () => {
  it('accepts institutional .scc gmail addresses', () => {
    expect(STUDENT_EMAIL_PATTERN.test('juan.delacruz.scc@gmail.com')).toBe(true);
    expect(STUDENT_EMAIL_PATTERN.test('a-b_c.1.scc@gmail.com')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(STUDENT_EMAIL_PATTERN.test('juan@gmail.com')).toBe(false);
    expect(STUDENT_EMAIL_PATTERN.test('juan.scc@yahoo.com')).toBe(false);
    expect(STUDENT_EMAIL_PATTERN.test('Juan.Delacruz.scc@gmail.com')).toBe(false); // uppercase
    expect(STUDENT_EMAIL_PATTERN.test('juanscc@gmail.com')).toBe(false); // missing dot before scc
  });
});

describe('STUDENT_NO_PATTERN', () => {
  it('accepts 7–9 digit ids only', () => {
    expect(STUDENT_NO_PATTERN.test('1234567')).toBe(true);
    expect(STUDENT_NO_PATTERN.test('123456789')).toBe(true);
    expect(STUDENT_NO_PATTERN.test('123456')).toBe(false);
    expect(STUDENT_NO_PATTERN.test('1234567890')).toBe(false);
    expect(STUDENT_NO_PATTERN.test('12345a7')).toBe(false);
  });
});

const validRegistration = {
  email: 'juan.delacruz.scc@gmail.com',
  password: 'secret1',
  studentNo: '20261234',
  fullName: 'Juan Dela Cruz',
  yearLevel: 3,
  section: 'BSCS-3A',
};

describe('validateRegistration', () => {
  it('passes a fully valid registration', () => {
    expect(validateRegistration(validRegistration)).toEqual({});
  });

  it('flags each invalid field with a message', () => {
    const errors = validateRegistration({
      email: 'nope@gmail.com',
      password: '123',
      studentNo: '12',
      fullName: '',
      yearLevel: 7,
      section: '',
    });
    expect(Object.keys(errors).sort()).toEqual(['email', 'fullName', 'password', 'section', 'studentNo', 'yearLevel']);
    expect(hasErrors(errors)).toBe(true);
  });
});

describe('validateGuest', () => {
  it('passes valid guests', () => {
    expect(validateGuest({
      fullName: 'Guest One',
      yearLevel: 1,
      section: 'BSCS-1A',
    })).toEqual({});
  });

  it('requires full name', () => {
    const errors = validateGuest({ fullName: '', yearLevel: 1, section: 'BSCS-1A' });
    expect(errors.fullName).toBeTruthy();
  });

  it('requires year level', () => {
    const errors = validateGuest({ fullName: 'G', yearLevel: 5, section: 'BSCS-1A' });
    expect(errors.yearLevel).toBeTruthy();
  });

  it('requires section', () => {
    const errors = validateGuest({ fullName: 'G', yearLevel: 1, section: '' });
    expect(errors.section).toBeTruthy();
  });
});

describe('validateLogin', () => {
  it('requires both fields', () => {
    expect(validateLogin({ email: '', password: '' })).toHaveProperty('email');
    expect(validateLogin({ email: 'x@y.z', password: '' })).toHaveProperty('password');
    expect(validateLogin({ email: 'x@y.z', password: 'p' })).toEqual({});
  });
});

describe('hasErrors', () => {
  it('is false only for an empty error map', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ email: 'bad' })).toBe(true);
  });
});
