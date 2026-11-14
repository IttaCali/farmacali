const municipalityCounts = [
  0, 17, 8, 16, 16, 13, 14, 19, 8, 24, 21, 9, 30, 32, 21, 8, 17, 14, 5, 11, 11, 7, 17,
];

export function validGuatemalanCui(value) {
  const cui = String(value || '').replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(cui)) return false;

  const department = Number(cui.slice(9, 11));
  const municipality = Number(cui.slice(11, 13));
  if (
    department < 1 ||
    department > 22 ||
    municipality < 1 ||
    municipality > municipalityCounts[department]
  )
    return false;

  const checkDigit =
    cui
      .slice(0, 8)
      .split('')
      .reduce((sum, digit, index) => sum + Number(digit) * (index + 2), 0) % 11;
  return checkDigit < 10 && checkDigit === Number(cui[8]);
}
