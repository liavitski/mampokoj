import { CZ_REGIONS } from '@/constants';

/**
 * Builds FormData matching the shape the ad forms submit, so action tests do
 * not have to restate every field name.
 */
export function adFormData(
  overrides: Record<string, string> = {}
): FormData {
  const fields: Record<string, string> = {
    title: 'Bright room in a quiet flat',
    price: '8500.00',
    city: 'Prague',
    region: CZ_REGIONS[0].code,
    availableFrom: '2026-01-15',
    description: 'A bright room available from January.',
    contactPhone: '+420776123456',
    ...overrides,
  };

  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }

  return formData;
}
