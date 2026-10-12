// The one password rule, shared by sign-up, reset and change. Returns the reason a password is not acceptable, or null.
// (The sign-up form's strength meter, src/utils/passwordStrength.ts, mirrors these four checks.)
function validatePasswordStrength(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
  return null;
}

module.exports = { validatePasswordStrength };
