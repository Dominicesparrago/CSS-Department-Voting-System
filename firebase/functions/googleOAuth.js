'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { FieldValue } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();

// Google OAuth configuration - values should come from environment variables
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
// These are expected to be set in the Functions environment configuration.

/**
 * Initiates the Google OAuth 2.0 authorization flow.
 * Redirects the user to Google's consent screen.
 *
 * This is called from the frontend to start the OAuth flow.
 */
exports.googleOAuthInit = onRequest(async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId) {
    return res.status(500).send('Google Client ID not configured.');
  }

  // Google OAuth 2.0 authorization endpoint
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state: generateStateCookie(req),
  };

  authUrl.search = new URLSearchParams(params).toString();

  res.redirect(authUrl.toString());
});

/**
 * Google OAuth2 callback handler.
 * Receives the authorization code from Google after user consent.
 * Exchanges the code for tokens and stores the refresh token securely.
 *
 * This is the critical backend endpoint that handles the OAuth flow.
 * The authorization code must be exchanged server-side never exposing
 * client secret to the frontend.
 */
exports.googleOAuthCallback = onRequest(async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const storedState = req.cookies?.state || '';

  // Validate state to prevent CSRF
  if (!state || state !== storedState) {
    return res.status(400).send('Invalid OAuth state parameter.');
  }

  if (!code) {
    return res.status(400).send('Authorization code not received.');
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(500).send('Google OAuth configuration incomplete.');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await exchangeAuthorizationCode(code, clientId, clientSecret, redirectUri);

    if (!tokenResponse || !tokenResponse.access_token) {
      return res.status(500).send('Failed to exchange authorization code for tokens.');
    }

    // Store the refresh token and credentials securely in Firestore
    await storeGoogleCredentials(tokenResponse);

    // Redirect back to admin console with success
    res.redirect('/admin');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('OAuth callback failed: ' + (error.message || 'Unknown error'));
  }
});

/**
 * Exchange the authorization code for tokens.
 */
async function exchangeAuthorizationCode(code, clientId, clientSecret, redirectUri) {
  const url = 'https://oauth2.googleapis.com/token';

  const params = new URLSearchParams({
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  };

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error('Token exchange failed: ' + (data.error || 'Unknown error'));
  }

  return data;
}

/**
 * Generates a CSRF state cookie for OAuth protection.
 */
function generateStateCookie(req) {
  const state = Math.random().toString(36).substring(2, 32) + Date.now().toString(36);
  // Set as a cookie that will be validated on callback
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'strict' });
  return state;
}

/**
 * Stores the Google credentials (refresh token) securely in Firestore.
 * In production, access should be restricted to superadmin/admins only.
 */
async function storeGoogleCredentials(tokenResponse) {
  const configRef = db.doc('config/google-oauth');
  const data = {
    clientId: tokenResponse.client_id,
    // Store refresh token securely - never expose to frontend
    refreshToken: tokenResponse.refresh_token,
    accessToken: tokenResponse.access_token,
    expiryDate: tokenResponse.expiry_date,
    grantedAt: FieldValue.serverTimestamp(),
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  };

  await configRef.set(data, { merge: true });
}

/**
 * Revokes the stored Google OAuth credentials.
 * Used when the admin disconnects the Google Sheets integration.
 */
exports.googleOAuthRevoke = onRequest(async (req, res) => {
  try {
    const configRef = db.doc('config/google-oauth');
    await configRef.delete();

    res.redirect('/admin');
  } catch (error) {
    console.error('OAuth revoke error:', error);
    res.status(500).send('Failed to revoke OAuth credentials.');
  }
});

/**
 * Fetches data from the Google Sheets API using the stored refresh token.
 * This is a backend-only function.
 *
 * @param {string} spreadsheetId - The Google Sheets spreadsheet ID
 * @param {string} range - A1 notation of the range to read (default: 'A:Z')
 */
async function fetchFromGoogleSheets(spreadsheetId, range = 'A:Z') {
  const configRef = db.doc('config/google-oauth');
  const configSnap = await configRef.get();

  if (!configSnap.exists) {
    throw new Error('Google OAuth credentials not configured.');
  }

  const config = configSnap.data();
  if (!config.refreshToken) {
    throw new Error('Google refresh token not available.');
  }

  // Exchange refresh token for access token
  const accessToken = await exchangeRefreshToken(config.refreshToken);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error('Google Sheets API error: ' + (errorData.error || 'Unknown error'));
  }

  return response.json();
}

/**
 * Exchanges a refresh token for an access token.
 */
async function exchangeRefreshToken(refreshToken) {
  const url = 'https://oauth2.googleapis/token';

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  };

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error('Token refresh failed: ' + (data.error || 'Unknown error'));
  }

  return data.access_token;
}

/**
 * Gets the list of worksheets/tabs in the configured Google Sheet.
 */
exports.googleOAuthGetSheetsInfo = onRequest(async (req, res) => {
  const { spreadsheetId } = req.query;

  if (!spreadsheetId) {
    return res.status(400).send('Spreadsheet ID is required.');
  }

  try {
    const sheetsInfo = await fetchFromGoogleSheets(spreadsheetId);
    const worksheets = sheetsInfo.sheetProperties
      ? sheetsInfo.sheetProperties.map((prop) => ({
          title: prop.title,
          sheetId: prop.sheetId,
        }))
      : [];

    res.json({ ok: true, worksheets });
  } catch (error) {
    console.error('Failed to fetch sheets info:', error);
    res.status(500).send('Failed to fetch spreadsheet worksheets: ' + (error.message || 'Unknown error'));
  }
});

/**
 * Reads roster data from the configured Google Sheet.
 * This is a backend service for voter verification.
 *
 * @param {string} spreadsheetId - The Google Sheets spreadsheet ID
 * @param {string} worksheetName - The name of the worksheet/tab (default: 'Students')
 */
async function readRosterFromGoogleSheet(spreadsheetId, worksheetName = 'Students') {
  const sheetsInfo = await fetchFromGoogleSheets(spreadsheetId, `${worksheetName}!A:G`);

  const rows = sheetsInfo.values || [];

  if (rows.length === 0) {
    return { ok: true, headers: [], records: [] };
  }

  // First row is assumed to be headers
  const headers = rows[0].map((h) => String(h || '').trim());
  const records = rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ? String(row[index]).trim() : '';
    });
    return record;
  });

  return { ok: true, headers, records };
}

/**
 * Validates the Google Sheet structure has required columns.
 */
async function validateGoogleSheetStructure(spreadsheetId, worksheetName = 'Students') {
  const { headers, records } = await readRosterFromGoogleSheet(spreadsheetId, worksheetName);

  const requiredFields = ['Student ID', 'Full Name', 'Section', 'Year Level'];

  const missingFields = requiredFields.filter(
    (field) => !headers.some((h) => h.toLowerCase().includes(field.toLowerCase()))
  );

  if (missingFields.length > 0) {
    return {
      ok: false,
      requiresAttention: true,
      problem: `Required ${missingFields.length > 1 ? 'columns are' : 'column is'} missing: ${missingFields.join(', ')}`,
    };
  }

  // Check for duplicate Student IDs
  const studentIds = records
    .filter((r) => r['Student ID'])
    .map((r) => r['Student ID'])
    .filter((id, idx, arr) => arr.indexOf(id) !== idx);

  if (studentIds.length > 0) {
    return {
      ok: false,
      requiresAttention: true,
      problem: `Duplicate Student ID${studentIds.length > 1 ? 's are' : ' is'} found in the roster: ${studentIds[0]}`,
    };
  }

  return { ok: true, recordCount: records.length };
}

/**
 * Validates a student's registration against the official Google Sheet roster.
 * This is the core verification service used during voter registration.
 *
 * @param {Object} params - Verification parameters
 * @param {string} params.studentId - The student's ID number
 * @param {string} params.fullName - The student's full name
 * @param {string} params.email - The student's school email
 * @param {number} params.yearLevel - The student's year level (1-4)
 * @param {string} params.section - The student's section (e.g. BSCS-3A)
 * @param {string} [params.electionId] - The election ID to check eligibility for
 * @returns {Object} Verification result with state and message
 */
async function verifyStudentAgainstRoster(params) {
  const { studentId, fullName, email, yearLevel, section, electionId = ELECTION_ID } = params;

  if (!studentId) {
    return {
      state: 'not-on-roster',
      ok: false,
      message: 'Student ID is required for verification.',
    };
  }

  // Check if Google Sheets credentials are configured
  const configRef = db.doc('config/google-oauth');
  const configSnap = await configRef.get();

  if (!configSnap.exists) {
    return {
      state: 'verification_unavailable',
      ok: false,
      message: 'Google Sheets roster is not configured. Contact the admin to set up the official roster.',
    };
  }

  const config = configSnap.data();
  if (!config.refreshToken) {
    return {
      state: 'verification_unavailable',
      ok: false,
      message: 'Google Sheets credentials are incomplete. Admin needs to reconnect.',
    };
  }

  try {
    // Fetch roster data from Google Sheets
    const sheetsData = await fetchFromGoogleSheets(config.spreadsheetId, `${config.worksheet || 'Students'}!A:G`);

    const rows = sheetsData.values || [];
    if (rows.length === 0) {
      return {
        state: 'not-on-roster',
        ok: false,
        message: 'The roster sheet is empty.',
      };
    }

    // First row is headers
    const headers = rows[0].map((h) => String(h || '').trim());
    const records = rows.slice(1).map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ? String(row[index]).trim() : '';
      });
      return record;
    });

    // Find the student by Student ID
    const studentRecord = records.find(
      (r) => r['Student ID'] && r['Student ID'] === studentId
    );

    if (!studentRecord) {
      return {
        state: 'not-on-roster',
        ok: false,
        message: 'Student ID not found on the official roster.',
      };
    }

    // Verify status is active
    if (studentRecord.status !== 'active' && studentRecord.status !== 'enrolled') {
      return {
        state: 'ineligible',
        ok: false,
        message: 'Your roster record is not active for this election.',
      };
    }

    // Verify eligibility
    if (studentRecord.eligible !== 'true' && studentRecord.eligible !== 'yes' && studentRecord.eligible !== true) {
      return {
        state: 'ineligible',
        ok: false,
        message: 'Your roster record is not marked eligible for this election.',
      };
    }

    // Verify year level matches
    const rosterYearLevel = studentRecord['Year Level']
      ? Number(String(studentRecord['Year Level']).replace(/\D/g, ''))
      : null;
    if (rosterYearLevel !== null && rosterYearLevel !== yearLevel) {
      return {
        state: 'mismatch',
        ok: false,
        message: 'Your registration year level does not match the official roster.',
      };
    }

    // Verify section matches
    const rosterSection = studentRecord['Section'];
    if (rosterSection && normalizeSection(rosterSection) !== normalizeSection(section)) {
      return {
        state: 'mismatch',
        ok: false,
        message: 'Your registration section does not match the official roster.',
      };
    }

    // Verify email matches (if both are provided)
    const rosterEmail = studentRecord['School Email'] || studentRecord['Email'] || '';
    const normalizedRosterEmail = rosterEmail ? rosterEmail.toLowerCase() : '';
    const normalizedStudentEmail = email ? email.toLowerCase() : '';
    if (
      normalizedRosterEmail &&
      normalizedRosterEmail !== normalizedStudentEmail &&
      normalizedStudentEmail
    ) {
      return {
        state: 'email-mismatch',
        ok: false,
        message: 'The email on your account does not match the official roster.',
      };
    }

    // Verify full name matches (secondary check)
    if (fullName) {
      const rosterFullName = studentRecord['Full Name'] || studentRecord['Name'] || '';
      if (!namesMatch(fullName, rosterFullName)) {
        return {
          state: 'mismatch',
          ok: false,
          message: 'Your registration name does not match the official roster.',
        };
      }
    }

    // All checks passed
    return {
      state: 'verified',
      ok: true,
      message: 'Student verified against the official roster.',
    };
  } catch (error) {
    console.error('Roster verification error:', error);
    // Distinguish between technical failure and student not found
    if (error.message?.includes('not configured') || error.message?.includes('credentials')) {
      return {
        state: 'verification_unavailable',
        ok: false,
        message: 'Roster verification unavailable due to a technical issue. Please try again later or contact the admin.',
      };
    }
    return {
      state: 'verification_unavailable',
      ok: false,
      message: 'Roster verification failed due to a technical error. Please try again.',
    };
  }
}

/**
 * Normalize section from various formats (mirrors rosterLogic.js).
 */
function normalizeSection(value) {
  if (value == null) return '';
  const pattern = /^(?:(?:BSCS|CS)[\s-]*)?([1-4])[\s-]*([A-Za-z])$/i;
  const match = pattern.exec(String(value).trim());
  if (!match) return '';
  return `BSCS-${match[1]}${match[2].toUpperCase()}`;
}

/**
 * Name matching (mirrors rosterLogic.js namesMatch).
 */
function namesMatch(registered, roster) {
  const significantTokens = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((token) => token.length > 1);

  const a = significantTokens(registered);
  const b = significantTokens(roster);
  if (a.length === 0 || b.length === 0) return false;
  if (a[0] !== b[0]) return false;

  const surnameKey = (tokens) => {
    let start = tokens.length - 1;
    while (start > 0 && ['de', 'del', 'dela', 'la', 'van', 'von', 'bin', 'ibn'].includes(tokens[start - 1])) {
      start -= 1;
    }
    return tokens.slice(start).join('');
  };

  return surnameKey(a) === surnameKey(b);
}

module.exports = {
  googleOAuthInit,
  googleOAuthCallback,
  googleOAuthRevoke,
  googleOAuthGetSheetsInfo,
  fetchFromGoogleSheets,
  readRosterFromGoogleSheet,
  validateGoogleSheetStructure,
  verifyStudentAgainstRoster,
  normalizeSection,
  namesMatch,
};