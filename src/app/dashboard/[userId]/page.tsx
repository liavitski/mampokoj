import React from 'react';

import { getUserAds } from '@/server/queries/select';
import { requireUserId } from '@/lib/session';
import { canViewDashboard } from '@/lib/dashboard-access';

import RoomListingForm from '@/components/RoomListingForm';
import AdCard from '@/components/AdCard';
import UploadBtn from '@/components/UploadBtn';
import DeleteAdButton from '@/components/DeleteAdButton';
import {
  Wrapper,
  AdCardWrapper,
  AdControlButtonsWrapper,
} from './page.styles';
import UpdateRoomListingForm from '@/components/UpdateRoomListingForm';

type UserDashboardPageProps = {
  params: Promise<{ userId: string }>;
};

async function UserDashboardPage({ params }: UserDashboardPageProps) {
  const serverUserId = await requireUserId();
  const { userId } = await params;

  // Checked before the query: this is the only route whose data is selected by
  // a URL segment rather than by the session.
  if (!canViewDashboard(serverUserId, userId)) {
    return <h3>Not allowed.</h3>;
  }

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
      {userAds.length < 2 && <RoomListingForm />}
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


export default UserDashboardPage;
