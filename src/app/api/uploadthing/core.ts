import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/server/db';
import { images, testimg } from '@/server/db/schema';
import { z } from 'zod';

const f = createUploadthing();

const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

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
        adId: uuidSchema,
      })
    )
    // Set permissions and file types for this FileRoute
    .middleware(async ({ req, input }) => {
      // This code runs on your server before upload
      const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
      });

      // If you throw, the user will not be able to upload
      if (!token) throw new UploadThingError('Unauthorized');

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return { userId: token.sub as string, adId: input.adId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log('Upload complete for userId:', metadata.userId);

      console.log('file url', file.ufsUrl);

      // await db.insert(images).values({
      //   userId: metadata.userId,
      //   adId: metadata.adId,
      //   url: file.ufsUrl,
      // });
      await db.insert(testimg).values({
        url: file.ufsUrl,
      });

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { uploadedBy: metadata.userId };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
