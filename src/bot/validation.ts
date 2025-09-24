export function isValidPhoneNumber(phone: string): boolean {
  const trimmed = phone.trim();
  const phoneRegex = /^(0[5-7]\d{8}|\+213[5-7]\d{8})$/;
  return phoneRegex.test(trimmed);
}

export function isValidAmount(amount: string): boolean {
  if (!amount.trim()) return false;
  const parsed = Number(amount.replace(/\s+/g, ''));
  return Number.isFinite(parsed) && parsed > 0;
}
