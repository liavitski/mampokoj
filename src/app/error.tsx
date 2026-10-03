'use client';

import * as React from 'react';
import styled from 'styled-components';
import { WEIGHTS } from '@/constants';

/**
 * The error boundary for every route below the root layout: `/`,
 * `/ad/[adId]`, `/dashboard/[userId]`, `/moderation` and the `@modal` slot.
 *
 * It exists because without it a throw in any of them renders Next's built-in
 * error page -- unstyled, in English, with no way back into the site. A visitor
 * who lands there has to use the browser's back button to recover from what is,
 * for a failed database query, a transient fault.
 *
 * **This is a Client Component because the framework requires it**, not because
 * it needs interactivity beyond the retry button. The same requirement is why it
 * cannot export `metadata`; the title below is React's `<title>`, hoisted into
 * the head by React 19, which is the documented substitute.
 *
 * `styled-components` is safe here even though this is a boundary: the
 * `StyledComponentsRegistry` from the root layout is still mounted, because the
 * boundary renders *inside* that layout. `global-error.tsx` cannot say the same
 * thing, which is one of the reasons it is written differently.
 *
 * The root layout's own failures are not caught here -- `error.tsx` does not
 * wrap the layout above it -- so those are `global-error.tsx`'s job.
 */
export type ErrorFallbackProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function ErrorFallback({ error, retry }: ErrorFallbackProps) {
  /**
   * `console.error`, and nothing more, because there is no reporting service to
   * send it to. This matches how the server actions report failures
   * (`server/actions/createAd.tsx`) -- on Vercel these land in the function log
   * next to the request, which is the same place the digest below is looked up.
   */
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Wrapper>
      <Message>Something went wrong.</Message>

      <Description>
        This page could not be loaded. It is most likely a temporary problem
        rather than anything to do with your device.
      </Description>

      <RetryButton type="button" onClick={() => retry()}>
        Try again
      </RetryButton>

      {/*
       * The digest, and only when there is one.

       * In production a server-side error arrives here with its message
       * replaced by a generic string and a `digest` instead; a client-side
       * throw arrives with its real message and no digest. So the digest is
       * the one identifier that connects "it broke for me" to a specific line
       * in the log -- worthless as a decoration, and nothing at all when the
       * error came from the browser.
       */}
      {error.digest && <Digest>{error.digest}</Digest>}
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 16px;
  text-align: center;
`;

const Message = styled.h1`
  font-weight: ${WEIGHTS.bold};
  font-size: 1.5rem;
  text-align: center;
`;

const Description = styled.p`
  max-width: 44ch;
  font-size: 1rem;
`;

/**
 * A real `<button>` rather than a `Button`, because the shared one is a
 * rounded pill sized for a toolbar and this is a lone full-width action on an
 * otherwise empty page.
 */
const RetryButton = styled.button`
  padding: 12px 24px;
  border: 1px solid var(--color-text);
  border-radius: 4px;
  background: var(--color-background);
  color: var(--color-text);
  font: inherit;
  font-weight: ${WEIGHTS.medium};
  cursor: pointer;

  &:hover {
    background: var(--color-card-background);
  }
`;

const Digest = styled.code`
  font-size: 0.75rem;
  opacity: 0.6;
`;
