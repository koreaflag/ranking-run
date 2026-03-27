/**
 * Shared country list used across profile, ranking filters, etc.
 * Country names are i18n-aware via getCountryName().
 */
import i18n from '../i18n';

export interface CountryItem {
  code: string;
  name: string;
}

/** Country codes in display order. `name` is the Korean fallback. */
export const COUNTRIES: CountryItem[] = [
  { code: 'KR', name: '대한민국' },
  { code: 'US', name: '미국' },
  { code: 'JP', name: '일본' },
  { code: 'CN', name: '중국' },
  { code: 'GB', name: '영국' },
  { code: 'FR', name: '프랑스' },
  { code: 'DE', name: '독일' },
  { code: 'ES', name: '스페인' },
  { code: 'IT', name: '이탈리아' },
  { code: 'CA', name: '캐나다' },
  { code: 'AU', name: '호주' },
  { code: 'NZ', name: '뉴질랜드' },
  { code: 'BR', name: '브라질' },
  { code: 'MX', name: '멕시코' },
  { code: 'AR', name: '아르헨티나' },
  { code: 'IN', name: '인도' },
  { code: 'TH', name: '태국' },
  { code: 'VN', name: '베트남' },
  { code: 'PH', name: '필리핀' },
  { code: 'SG', name: '싱가포르' },
  { code: 'TW', name: '대만' },
  { code: 'HK', name: '홍콩' },
  { code: 'NL', name: '네덜란드' },
  { code: 'CH', name: '스위스' },
  { code: 'SE', name: '스웨덴' },
  { code: 'NO', name: '노르웨이' },
  { code: 'FI', name: '핀란드' },
  { code: 'DK', name: '덴마크' },
  { code: 'AT', name: '오스트리아' },
  { code: 'BE', name: '벨기에' },
  { code: 'PT', name: '포르투갈' },
  { code: 'PL', name: '폴란드' },
  { code: 'RU', name: '러시아' },
  { code: 'TR', name: '터키' },
  { code: 'AE', name: '아랍에미리트' },
  { code: 'SA', name: '사우디아라비아' },
  { code: 'IL', name: '이스라엘' },
  { code: 'ZA', name: '남아프리카공화국' },
  { code: 'KE', name: '케냐' },
  { code: 'ET', name: '에티오피아' },
  { code: 'CL', name: '칠레' },
  { code: 'CO', name: '콜롬비아' },
  { code: 'ID', name: '인도네시아' },
  { code: 'MY', name: '말레이시아' },
];

export function getCountryFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

/** Returns localized country name using current i18n language. */
export function getCountryName(code: string): string {
  const key = `countries.${code}`;
  const translated = i18n.t(key);
  // If no translation found, i18n returns the key itself — fall back to COUNTRIES array
  if (translated === key) {
    return COUNTRIES.find((c) => c.code === code)?.name ?? code;
  }
  return translated;
}
