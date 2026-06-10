import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { addImageToAd } from '@/server/actions/addImageToAd';
import { UTApi } from 'uploadthing/server';
import { requireUserId } from '@/lib/require-user-id';
import { z } from 'zod';
import { ratelimit } from '@/server/ratelimit';
import { imageLimit } from '@/server/queries/select';

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
      const sessionUserId = await requireUserId();
      if (!sessionUserId) {
        throw new UploadThingError('Unauthorized');
      }
      const { success } = await ratelimit.limit(sessionUserId);
      if (!success) throw new UploadThingError('Ratelimited');

      const imageCheck = await imageLimit(input.adId, 3);
      if (!imageCheck.success) {
        throw new UploadThingError('Max. 3 images allowed per ad');
      }

      return {
        userId: sessionUserId,
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

      if (!result.success) {
        throw new Error(result.error || 'Failed to save image');
      }

      return result;
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
