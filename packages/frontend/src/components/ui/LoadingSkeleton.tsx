import type { ReactNode } from 'react';

// Generate unique IDs for skeleton components
const generateId = (() => {
  let counter = 0;
  return () => `skeleton-${++counter}-${Date.now()}`;
})();

interface SkeletonProps {
  className?: string;
  children?: ReactNode;
}

export const Skeleton = ({ className = '', children }: SkeletonProps) => {
  return (
    <output className={`animate-pulse bg-gray-200 rounded ${className}`} aria-label="読み込み中">
      {children}
    </output>
  );
};

// Specific skeleton components for common UI elements

export const SkeletonText = ({
  lines = 1,
  className = '',
  lineHeight = 'h-4',
}: {
  lines?: number;
  className?: string;
  lineHeight?: string;
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={generateId()}
          className={`${lineHeight} ${index === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
};

export const SkeletonAvatar = ({
  size = 'w-10 h-10',
  className = '',
}: {
  size?: string;
  className?: string;
}) => {
  return <Skeleton className={`${size} rounded-full ${className}`} />;
};

export const SkeletonCard = ({
  className = '',
  showAvatar = false,
  textLines = 3,
}: {
  className?: string;
  showAvatar?: boolean;
  textLines?: number;
}) => {
  return (
    <div className={`p-4 border border-gray-200 rounded-lg ${className}`}>
      {showAvatar && (
        <div className="flex items-center space-x-3 mb-4">
          <SkeletonAvatar />
          <div className="flex-1">
            <SkeletonText lines={1} className="mb-1" lineHeight="h-3" />
            <SkeletonText lines={1} lineHeight="h-2" />
          </div>
        </div>
      )}
      <SkeletonText lines={textLines} />
    </div>
  );
};

export const SkeletonButton = ({
  className = '',
  size = 'px-4 py-2',
}: {
  className?: string;
  size?: string;
}) => {
  return <Skeleton className={`${size} rounded-md ${className}`} />;
};

export const SkeletonTable = ({
  rows = 3,
  columns = 4,
  className = '',
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map(() => (
          <Skeleton key={generateId()} className="h-4" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map(() => (
        <div
          key={generateId()}
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {Array.from({ length: columns }).map(() => (
            <Skeleton key={generateId()} className="h-3" />
          ))}
        </div>
      ))}
    </div>
  );
};

// Loading states for specific components

export const CommentListSkeleton = ({ count = 3 }: { count?: number }) => {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map(() => (
        <SkeletonCard key={generateId()} showAvatar textLines={2} className="bg-white" />
      ))}
    </div>
  );
};

export const ParticipantListSkeleton = ({ count = 5 }: { count?: number }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <SkeletonText lines={1} className="w-32" />
        <Skeleton className="w-8 h-4 rounded-full" />
      </div>

      {Array.from({ length: count }).map(() => (
        <div key={generateId()} className="flex items-center space-x-3">
          <SkeletonAvatar size="w-8 h-8" />
          <div className="flex-1">
            <SkeletonText lines={1} className="w-24 mb-1" lineHeight="h-3" />
            <SkeletonText lines={1} className="w-16" lineHeight="h-2" />
          </div>
          <Skeleton className="w-2 h-2 rounded-full" />
        </div>
      ))}
    </div>
  );
};

export const RoomInfoSkeleton = () => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <SkeletonText lines={1} className="w-40" lineHeight="h-8" />
            <Skeleton className="w-16 h-6 rounded-full" />
          </div>

          <div className="flex items-center space-x-4 text-sm">
            <SkeletonText lines={1} className="w-24" lineHeight="h-4" />
            <SkeletonText lines={1} className="w-16" lineHeight="h-4" />
            <SkeletonText lines={1} className="w-20" lineHeight="h-4" />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <SkeletonButton size="px-3 py-1.5" className="w-24" />
          <SkeletonButton size="px-3 py-1.5" className="w-20" />
          <SkeletonButton size="px-3 py-1.5" className="w-16" />
        </div>
      </div>
    </div>
  );
};

export const FormSkeleton = ({
  fields = 3,
  showButtons = true,
  className = '',
}: {
  fields?: number;
  showButtons?: boolean;
  className?: string;
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: fields }).map(() => (
        <div key={generateId()} className="space-y-2">
          <SkeletonText lines={1} className="w-24" lineHeight="h-4" />
          <Skeleton className="w-full h-10 rounded-md" />
        </div>
      ))}

      {showButtons && (
        <div className="flex space-x-3 pt-4">
          <SkeletonButton className="w-24" />
          <SkeletonButton className="w-20" />
        </div>
      )}
    </div>
  );
};

// Loading wrapper component for conditional loading states
interface LoadingWrapperProps {
  isLoading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}

export const LoadingWrapper = ({
  isLoading,
  skeleton,
  children,
  className = '',
}: LoadingWrapperProps) => {
  return <div className={className}>{isLoading ? skeleton : children}</div>;
};

// Page-level loading component
export const PageLoading = ({
  message = 'ページを読み込み中...',
  className = '',
}: {
  message?: string;
  className?: string;
}) => {
  return (
    <div className={`flex items-center justify-center min-h-screen ${className}`}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
};

// Inline loading component for buttons and small elements
export const InlineLoading = ({
  size = 'w-4 h-4',
  className = '',
}: {
  size?: string;
  className?: string;
}) => {
  return (
    <div
      className={`border-2 border-current border-t-transparent rounded-full animate-spin ${size} ${className}`}
    />
  );
};
