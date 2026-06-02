import { notFound } from 'next/navigation';

export default async function UserDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  //   const ad = await getValidatedAd(adId);

  if (!userId) {
    notFound(); // triggers /404 page or not-found.tsx
  }

  return <h2>{JSON.stringify(userId)}</h2>;
}
