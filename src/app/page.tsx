import styled from 'styled-components';
import Image from 'next/image';
import RegionNavigation from '@/components/RegionNavigation';
import { db } from '@/db';

const mockUrls = [
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ79HczNRSpUD2m5kinJXFqcGTw6bloRj4ZEeLv',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7ZftpyHl38t4VLg12fshBdTpUK5qiYEyjaGH0',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ75oQoNRnxSs2Zo9Kr47tb18jAHzUgE6nGQMFi',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ75oQoNRnxSs2Zo9Kr47tb18jAHzUgE6nGQMFi',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7ZftpyHl38t4VLg12fshBdTpUK5qiYEyjaGH0',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ79HczNRSpUD2m5kinJXFqcGTw6bloRj4ZEeLv',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7PJFfhxYzX7nadtS5T0IxCu43bYjsDlU2eEWR',
  'https://gtiivfj57h.ufs.sh/f/kpgjANcHnEQ7ZftpyHl38t4VLg12fshBdTpUK5qiYEyjaGH0',
];

export default async function Home() {
  const users = await db.query.users.findMany();

  return (
    <Wrapper>
      <RegionNavigation />
      <RoomList>
        {mockUrls.map((url, index) => {
          return (
            <ImageWrapper key={index}>
              <Image
                src={url}
                alt=""
                fill
                style={{
                  objectFit: 'cover',
                }}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </ImageWrapper>
          );
        })}
        {users.map((user) => JSON.stringify(user))}
      </RoomList>
    </Wrapper>
  );
}

const Wrapper = styled.main`
  display: flex;
  gap: 16px;
`;

const RoomList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  flex: 1;
`;

const ImageWrapper = styled.div`
  position: relative;
  width: 100%;
  max-width: 250px;
  aspect-ratio: 1 / 1;
`;
