'use client';

import React from 'react';
import * as Toast from '@radix-ui/react-toast';
import styled, { keyframes } from 'styled-components';
import { MAX_TOASTS, WEIGHTS } from '@/constants';
import Icon from '../Icon';

type ToastType = 'success' | 'error';

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  open: boolean;
};

type ToastContextType = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = React.createContext<ToastContextType | null>(
  null
);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  function showToast(message: string, type: ToastType = 'success') {
    const id = crypto.randomUUID();

    setToasts((prev) => {
      const next = [...prev, { id, message, type, open: true }];
      return next.slice(-MAX_TOASTS);
    });
  }

  function handleOpenChange(id: string, open: boolean) {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, open } : t))
    );
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      <Toast.Provider swipeDirection="right" duration={5000}>
        {children}

        {toasts.map((toast) => (
          <Root
            open={toast.open}
            onOpenChange={(open) => handleOpenChange(toast.id, open)}
            key={toast.id}
            onAnimationEnd={() => {
              if (toast.open === false) {
                setToasts((prev) =>
                  prev.filter((t) => t.id !== toast.id)
                );
              }
            }}
          >
            <Description>
              {toast.type === 'success' ? (
                <Icon
                  id="checkCircle"
                  color="green"
                  strokeWidth={1.5}
                />
              ) : (
                <Icon
                  id="alertOctagon"
                  color="red"
                  strokeWidth={1.5}
                />
              )}
              <div>{toast.message}</div>
            </Description>
            <Close>
              <Icon
                id="x"
                color="var(--color-text)"
                strokeWidth={1.5}
              />
            </Close>
          </Root>
        ))}
        <Viewport />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return context;
}

const slideIn = keyframes`
  from {
    transform: translateX(120%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(120%);
    opacity: 0;
  }
`;

const Viewport = styled(Toast.Viewport)`
  position: fixed;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 350px;
  max-width: 100vw;
`;

const Root = styled(Toast.Root)`
  position: relative;
  display: flex;
  align-items: center;
  background-color: var(--color-card-background);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
  color: var(--color-text);
  padding: 8px;
  border-radius: 16px;
  color-scheme: light;
  max-width: 100%;
  width: 350px;
  box-shadow: var(--shadow-card);

  &[data-state='open'] {
    animation: ${slideIn} 300ms ease-out;
  }

  &[data-state='closed'] {
    animation: ${slideOut} 200ms ease-in;
  }

  &[data-swipe='move'] {
    transform: translateX(var(--radix-toast-swipe-move-x));
  }
  &[data-swipe='end'] {
    animation: ${slideOut} 200ms ease-out;
  }
`;

const Description = styled(Toast.Description)`
  flex: 1;
  font-weight: ${WEIGHTS.medium};
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
`;

const Close = styled(Toast.Close)`
  flex-shrink: 0;
  border: none;
  background: transparent;
  cursor: pointer;
`;

export default ToastProvider;
