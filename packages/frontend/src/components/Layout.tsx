import type { ReactNode } from 'react';
import { Footer } from './layout/Footer';
import { Header } from './layout/Header';
import { Main } from './layout/Main';

interface LayoutProps {
  children: ReactNode;
  showUserInfo?: boolean;
  showLinks?: boolean;
  fullWidth?: boolean;
  noPadding?: boolean;
  className?: string;
  onMenuClick?: () => void;
}

export const Layout = ({
  children,
  showUserInfo = true,
  showLinks = false,
  fullWidth = false,
  noPadding = false,
  className = '',
  onMenuClick,
}: LayoutProps) => {
  return (
    <div className={`min-h-screen bg-gray-50 flex flex-col ${className}`}>
      <Header onMenuClick={onMenuClick} showUserInfo={showUserInfo} />

      <Main fullWidth={fullWidth} noPadding={noPadding}>
        {children}
      </Main>

      <Footer showLinks={showLinks} />
    </div>
  );
};

export type { LayoutProps };
