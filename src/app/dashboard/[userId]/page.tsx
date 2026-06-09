import React from 'react';

import { notFound } from 'next/navigation';
import { getUserAds } from '@/server/queries/select';
import { requireUserId } from '@/lib/require-user-id';

import styled from 'styled-components';

import RoomListingForm from '@/components/RoomListingForm';
import AdCard from '@/components/AdCard';
import UploadBtn from '@/components/UploadBtn';
import DeleteAdButton from '@/components/DeleteAdButton';
import UpdateRoomListingForm from '@/components/UpdateRoomListingForm';

type UserDashboardPageProps = {
  params: Promise<{ userId: string }>;
};

async function UserDashboardPage({ params }: UserDashboardPageProps) {
  const serverUserId = await requireUserId();
  const { userId } = await params;

  if (serverUserId !== userId) return <h3>Not allowed.</h3>;
  if (!userId) notFound();

  const userAds = await getUserAds(userId);

  if (userAds.length === 0)
    return (
      <>
        <h3 style={{ marginBottom: '8px' }}>
          You dont have any ads.
        </h3>
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
              <UploadBtn adId={userAd.id} />

              <UpdateRoomListingForm ad={userAd} />

              <DeleteAdButton adId={userAd.id} />
            </AdControlButtonsWrapper>
          </AdCardWrapper>
        );
      })}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  gap: 16px;
  flex-direction: column;
`;

const AdCardWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px dotted var(--color-border);
  padding-bottom: 16px;
`;

const AdControlButtonsWrapper = styled.div`
  display: flex;
  gap: 16px;
  align-items: flex-start;
  max-width: 1000px;
`;

export default UserDashboardPage;
