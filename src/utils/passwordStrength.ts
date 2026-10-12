export interface StrengthResult {
  score: number;       // 0–4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;       // tailwind bg color
  checks: {
    length: boolean;
    upper: boolean;
    number: boolean;
    special: boolean;
  };
  valid: boolean;      // all 4 checks pass
}

export function checkPasswordStrength(pw: string): StrengthResult {
  const checks = {
    length:  pw.length >= 8,
    upper:   /[A-Z]/.test(pw),
    number:  /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels  = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  const colors  = ['bg-gray-200', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'];
  return { score, label: labels[score], color: colors[score], checks, valid: score === 4 };
}
