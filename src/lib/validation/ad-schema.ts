import { z } from 'zod';

import { CZ_REGIONS } from '@/constants';

/**
 * Field names, shared by the create and update forms and by the server
 * actions, so the two ends of the contract cannot drift apart.
 */
export const AD_FIELDS = [
  'title',
  'price',
  'city',
  'region',
  'availableFrom',
  'description',
  'contactPhone',
] as const;

/** Mirrors the `mampokoj_ads` column definitions. */
const TITLE_MAX = 60;
const CITY_MAX = 80;
/** The column is `text`, but the form caps this and so does the server. */
const DESCRIPTION_MAX = 500;
/** numeric(10, 2): ten digits total, two of them after the point. */
const PRICE_MAX = 99999999.99;

const regionCodes = CZ_REGIONS.map((region) => region.code);

/**
 * `availableFrom` is a calendar date, not an instant. It is parsed and stored
 * at UTC midnight so that reading it back for the edit form yields the same
 * date, instead of shifting a day for anyone east or west of UTC.
 */
const availableFrom = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    message: 'Enter a valid date',
  })
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const adInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),

  price: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid price')
    .refine((value) => Number(value) <= PRICE_MAX, 'Price is too large')
    .transform((value) => Number(value).toFixed(2)),

  city: z
    .string()
    .trim()
    .min(1, 'City is required')
    .max(CITY_MAX, `City must be ${CITY_MAX} characters or fewer`),

  region: z
    .string()
    .refine(
      (value) => regionCodes.includes(value as (typeof regionCodes)[number]),
      'Choose a region'
    ),

  availableFrom,

  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(DESCRIPTION_MAX, 'Description is too long'),

  // The pattern itself caps the length: an optional '+' plus at most 15
  // digits is exactly varchar(16), so no separate length check is needed.
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number'),
});

export type AdInput = z.infer<typeof adInputSchema>;

export type ParseAdResult =
  | { success: true; data: AdInput }
  | { success: false; error: string };

/**
 * Reads and validates a submitted ad form.
 *
 * FormData is untrusted: a field can be absent, or sent as a file rather than
 * text, and `formData.get(...) as string` would happily cast either into the
 * insert. Validating here also means a bad submission is reported as a readable
 * message instead of a raw Postgres constraint error.
 */
export function parseAdFormData(formData: FormData): ParseAdResult {
  const raw: Record<string, unknown> = {};

  for (const field of AD_FIELDS) {
    const value = formData.get(field);

    if (typeof value !== 'string') {
      return { success: false, error: `Missing or invalid ${field}` };
    }

    raw[field] = value;
  }

  const result = adInputSchema.safeParse(raw);

  if (!result.success) {
    const firstIssue = result.error.issues[0];

    return {
      success: false,
      error: firstIssue?.message ?? 'Invalid input',
    };
  }

  return { success: true, data: result.data };
}
