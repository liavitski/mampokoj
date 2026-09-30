import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError, UTApi } from 'uploadthing/server';
import { z } from 'zod';

import { addImageToAd } from '@/server/attach-image';
import { checkUploadAdmission } from '@/server/upload-guard';

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
      // Ownership, rate limit and photo count are all settled here, before
      // UploadThing stores and bills for the file.
      const admission = await checkUploadAdmission(input.adId);

      if (!admission.ok) {
        throw new UploadThingError(admission.reason);
      }

      // `userId` travels with the upload because `onUploadComplete` cannot
      // resolve it: UploadThing calls that hook server-to-server, so there is no
      // session cookie on the request. See upload-guard.ts.
      return { adId: input.adId, userId: admission.userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const { adId, userId } = metadata;

      const result = await addImageToAd({
        adId,
        userId,
        url: file.ufsUrl,
        fileKey: file.key,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save image');
      }

      return result;
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
