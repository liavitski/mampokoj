import { getValidatedAd } from '@/server/queries/select';
import { RouteModal } from './modal-wrapper';
import { notFound } from 'next/navigation';

import AdCardCompact from '@/components/AdCard/AdCardCompact';


/**
 * The same generated type the real ad route uses, and deliberately so.
 *
 * `@modal` is a parallel route and `(.)ad` an intercept, neither of which
 * appears in a URL, so this segment resolves to `/ad/[adId]` -- Next's generated
 * `validator.ts` checks this file against `AppPageConfig<"/ad/[adId]">` and not
 * against a route of its own. If the two ever diverged, `tsc` would fail here
 * rather than at runtime, and the modal would stop being the same page.
 */
export default async function Modal({ params }: PageProps<'/ad/[adId]'>) {
  const { adId } = await params;

  const ad = await getValidatedAd(adId);

  if (!ad) notFound();

  // userId is dropped rather than passed down: the compact card has no use for
  // the poster's account id.
  const { userId: _userId, ...adData } = ad;

  return (
    <RouteModal>
      <AdCardCompact ad={adData} />
    </RouteModal>
  );
}
