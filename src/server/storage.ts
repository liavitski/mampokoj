import 'server-only';

import { UTApi } from 'uploadthing/server';

/**
 * The UploadThing server SDK, authenticated with `UPLOADTHING_TOKEN`.
 *
 * Lives here rather than in `src/app/api/uploadthing/core.ts` because the delete
 * paths are Server Actions, not the upload route: importing the storage client
 * out of a route handler made every caller depend on the file router, and
 * attaching the compensation in `attach-image.ts` to an upload-orphan delete
 * would have closed an import cycle (`core` imports `attach-image`).
 */
export const utapi = new UTApi();
