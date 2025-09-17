import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface MainProps {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  noPadding?: boolean;
}

export const Main = ({ children, className, fullWidth = false, noPadding = false }: MainProps) => {
  return (
    <main
      className={cn(
        'flex-1',
        !fullWidth && 'max-w-7xl mx-auto',
        !noPadding && 'px-4 sm:px-6 lg:px-8 py-6',
        className
      )}
    >
      {children}
    </main>
  );
};

export type { MainProps };
