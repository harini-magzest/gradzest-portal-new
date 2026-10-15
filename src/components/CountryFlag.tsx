import React from 'react';

const NAME_TO_CODE: Record<string, string> = {
  'United States': 'us', 'United Kingdom': 'gb', 'Canada': 'ca',
  'Australia': 'au', 'Germany': 'de', 'Singapore': 'sg',
  'Netherlands': 'nl', 'New Zealand': 'nz', 'Ireland': 'ie',
  'France': 'fr', 'Sweden': 'se', 'Switzerland': 'ch',
  'Japan': 'jp', 'South Korea': 'kr', 'Austria': 'at', 'Denmark': 'dk',
  'India': 'in', 'China': 'cn', 'Brazil': 'br', 'Italy': 'it',
  'Spain': 'es', 'Portugal': 'pt', 'Norway': 'no', 'Finland': 'fi',
  'Belgium': 'be', 'Poland': 'pl', 'Czech Republic': 'cz',
  'United Arab Emirates': 'ae', 'Saudi Arabia': 'sa', 'Malaysia': 'my',
  'Thailand': 'th', 'Indonesia': 'id', 'Philippines': 'ph',
  'Vietnam': 'vn', 'Pakistan': 'pk', 'Bangladesh': 'bd',
  'Sri Lanka': 'lk', 'Nepal': 'np', 'Mexico': 'mx', 'Argentina': 'ar',
  'Chile': 'cl', 'Colombia': 'co', 'Turkey': 'tr', 'Egypt': 'eg',
  'Nigeria': 'ng', 'South Africa': 'za', 'Kenya': 'ke',
  'Russia': 'ru', 'Ukraine': 'ua', 'Romania': 'ro', 'Hungary': 'hu',
  'Greece': 'gr', 'Croatia': 'hr', 'Bulgaria': 'bg',
};

export function CountryFlag({
  name,
  code,
  flag,
  sizeCls = 'w-10 h-7',
  rounded = 'rounded-lg',
  className = '',
  quality = 'w80',
}: {
  name?: string;
  code?: string;
  flag?: string;
  sizeCls?: string;
  rounded?: string;
  className?: string;
  quality?: 'w20' | 'w40' | 'w80' | 'w160';
}) {
  const [imgErr, setImgErr] = React.useState(false);
  const resolvedCode = code?.toLowerCase() || (name ? NAME_TO_CODE[name] : undefined);

  if (!resolvedCode || imgErr) {
    return (
      <span className={`${sizeCls} ${rounded} ${className} bg-white border border-gray-200 shadow-sm flex items-center justify-center text-2xl leading-none flex-shrink-0 overflow-hidden select-none`}>
        {flag || '🌍'}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/${quality}/${resolvedCode}.png`}
      alt={name || resolvedCode}
      onError={() => setImgErr(true)}
      className={`${sizeCls} ${rounded} ${className} object-cover flex-shrink-0 shadow-sm border border-gray-200`}
    />
  );
}
