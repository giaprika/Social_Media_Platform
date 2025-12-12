// Validate email function
export function validateEmail(email) {
  const re = /\S+@\S+\.\S+/;
  return re.test(email);
}

// Validate password function
export function validatePassword(password) {
  // Requires ≥8 chars, at least one uppercase letter, one lowercase letter, and one digit
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return re.test(password);
}
