// frontend-app\src\lib\utils.js

// Format currency to VND
export function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount);
}

// Format date to Vietnamese locale
export function formatDate(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(date));
}

// Truncate blockchain hash
export function truncateHash(hash, length = 8) {
  if (!hash) return '';
  return `${hash.slice(0, length)}...${hash.slice(-length)}`;
}
