'use client';

import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';

export function RouteModal({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Modal
      defaultOpen
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      {children}
    </Modal>
  );
}
