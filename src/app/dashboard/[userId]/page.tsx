import React from 'react';
import { notFound } from 'next/navigation';
import { getUserAds } from '@/server/queries/select';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import RoomListingForm from '@/components/RoomListingForm';
import AdCard from '@/components/AdCard';
import styled from 'styled-components';
import UploadBtn from '@/components/UploadBtn';
import DeleteAdButton from '@/components/DeleteAdButton';
import UpdateButton from '@/components/UpdateButton';


type UserDashboardPageProps = {
  params: Promise<{ userId: string }>;
};

async function UserDashboardPage({ params }: UserDashboardPageProps) {
  const session = await getServerSession(authOptions);
  const serverUserId = session?.user?.id;
  const { userId } = await params;

  if (serverUserId !== userId) return <h3>Not allowed.</h3>;
  if (!userId) notFound();

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
              <UploadBtn adId={userAd.id} />

              <UpdateButton adId={userAd.id} />

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
