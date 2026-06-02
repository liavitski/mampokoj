import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
// import { uploadImage } from '@/server/actions';/
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { addImageToAd } from '@/server/actions';

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const ourFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  imageUploader: f({
    image: {
      maxFileSize: '4MB',
      maxFileCount: 1,
    },
  })
    .input(
      z.object({
        adId: z.uuid(),
      })
    )
    .middleware(async ({ input }) => {
      const session = await getServerSession(authOptions);

      if (!session?.user?.id) {
        throw new UploadThingError('Unauthorized');
      }

      return {
        userId: session.user.id,
        adId: input.adId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      const { userId, adId } = metadata;
      const url = file.ufsUrl;

      if (!userId) {
        throw new Error('Missing user context');
      }

      await addImageToAd({ adId, userId, url });

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { success: true };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
