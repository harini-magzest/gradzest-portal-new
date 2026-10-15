import { checkPasswordStrength } from '../utils/passwordStrength';

export default function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color, checks } = checkPasswordStrength(password);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= score ? color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Strength: <span className={`font-semibold ${score <= 1 ? 'text-red-500' : score === 2 ? 'text-orange-400' : score === 3 ? 'text-yellow-500' : 'text-green-600'}`}>{label}</span>
      </p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {[
          { key: 'length',  label: '8+ characters' },
          { key: 'upper',   label: 'Uppercase letter' },
          { key: 'number',  label: 'Number' },
          { key: 'special', label: 'Special character' },
        ].map(({ key, label }) => (
          <li key={key} className={`text-xs flex items-center gap-1 ${(checks as any)[key] ? 'text-green-600' : 'text-gray-400'}`}>
            <span>{(checks as any)[key] ? '✓' : '○'}</span> {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
