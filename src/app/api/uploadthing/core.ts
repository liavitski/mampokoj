import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { addImageToAd } from '@/server/actions/addImageToAd';
import { UTApi } from 'uploadthing/server';
import { z } from 'zod';

export const utapi = new UTApi();

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
      const { adId } = metadata;

      const result = await addImageToAd({
        adId,
        url: file.ufsUrl,
        fileKey: file.key,
        userId: metadata.userId,
      });

      console.log('DB RESULT:', result);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save image');
      }

      return result;
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
