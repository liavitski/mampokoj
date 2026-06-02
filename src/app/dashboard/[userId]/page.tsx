import AdPhotosGallery from '@/components/AdPhotosGallery';
import { notFound } from 'next/navigation';
import { getUserAds } from '@/server/queries/select';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import RoomListingForm from '@/components/RoomListingForm';
import AdCard from '@/components/AdCard';

import type { Ad } from '@/types/db-types';

async function UserDashboardPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await getServerSession(authOptions);
  const serverUserId = session?.user?.id;
  const { userId } = await params;

  if (serverUserId !== userId) return <h3>Not allowed.</h3>;
  if (!userId) {
    notFound(); // triggers /404 page or not-found.tsx
  }

  const userAds = await getUserAds(userId);

  if (userAds.length === 0)
    return (
      <>
        <h3>You dont have any ads.</h3>
        <RoomListingForm />
      </>
    );

  return (
    <>
      {userAds.map((userAd) => {
        return <AdCard ad={userAd} key={userAd.id} />;
      })}
      <RoomListingForm />
    </>
  );
}

export default UserDashboardPage;
