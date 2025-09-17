import { cn } from '@/lib/utils';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background touch-manipulation select-none';

    const variants = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
      primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
      secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70',
      danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
      ghost: 'hover:bg-accent hover:text-accent-foreground active:bg-accent/80',
      link: 'underline-offset-4 hover:underline text-primary active:text-primary/80',
    };

    const sizes = {
      default: 'h-11 py-2 px-4 text-sm md:text-base min-h-[44px]', // 44px minimum for touch
      sm: 'h-10 px-3 text-sm rounded-md min-h-[40px]', // 40px for compact areas
      lg: 'h-12 px-8 text-base md:text-lg rounded-md min-h-[48px]', // 48px for primary actions
      icon: 'h-11 w-11 min-h-[44px] min-w-[44px]', // Square touch target
    };

    return (
      <button
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <title>読み込み中</title>
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            読み込み中...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
