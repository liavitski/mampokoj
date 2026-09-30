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

      return { adId: input.adId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      const { adId } = metadata;

      // Re-checks ownership from the session. The adId in metadata originated
      // from the client's upload input, so it is only a lookup key here.
      const result = await addImageToAd({
        adId,
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
