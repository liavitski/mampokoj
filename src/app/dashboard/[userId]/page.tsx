import React from 'react';
import { notFound } from 'next/navigation';
import { getUserAds } from '@/server/queries/select';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import RoomListingForm from '@/components/RoomListingForm';
import AdCard from '@/components/AdCard';
import styled from 'styled-components';
import UploadBtn from '@/components/UploadBtn';

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
    <Wrapper>
      <RoomListingForm />

      {userAds.map((userAd) => {
        return (
          <AdCardWrapper key={userAd.id}>
            <AdCard ad={userAd} />
            <AdControlButtonsWrapper>
              <button>Update</button>
              <button>Delete</button>
              <UploadBtn adId={userAd.id} />
            </AdControlButtonsWrapper>
          </AdCardWrapper>
        );
      })}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  gap: 32px;
  flex-direction: column;
`;

const AdCardWrapper = styled.div``;

const AdControlButtonsWrapper = styled.div`
  display: flex;
`;

export default UserDashboardPage;
