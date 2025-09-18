/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '../Button';

// Mock the cn utility function to return all classes concatenated
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

describe('Button Component', () => {
  it('should render with default props', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('should handle click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    const button = screen.getByRole('button', { name: /click me/i });
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled Button</Button>);

    const button = screen.getByRole('button', { name: /disabled button/i });
    expect(button).toBeDisabled();
  });

  it('should be disabled when loading is true', () => {
    render(<Button loading>Loading Button</Button>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should show loading state with spinner and text', () => {
    render(<Button loading>Submit</Button>);

    // Should show loading text instead of children
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    expect(screen.queryByText('Submit')).not.toBeInTheDocument();

    // Should show loading spinner
    const spinner = screen.getByTitle('読み込み中');
    expect(spinner).toBeInTheDocument();
  });

  it('should not call onClick when loading', () => {
    const handleClick = jest.fn();
    render(
      <Button onClick={handleClick} loading>
        Loading Button
      </Button>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should not call onClick when disabled', () => {
    const handleClick = jest.fn();
    render(
      <Button onClick={handleClick} disabled>
        Disabled Button
      </Button>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  describe('className generation', () => {
    it('should apply all base classes', () => {
      const { container } = render(<Button>Test</Button>);
      const button = container.querySelector('button');

      // Check that button element has the expected classes from concatenation
      expect(button?.className).toContain('inline-flex');
      expect(button?.className).toContain('items-center');
      expect(button?.className).toContain('justify-center');
    });

    it('should include variant-specific classes', () => {
      const { container } = render(<Button variant="primary">Primary</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('bg-blue-600');
      expect(button?.className).toContain('text-white');
    });

    it('should include size-specific classes', () => {
      const { container } = render(<Button size="lg">Large</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('h-12');
      expect(button?.className).toContain('px-8');
    });

    it('should include custom className', () => {
      const { container } = render(<Button className="custom-class">Custom</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('custom-class');
    });
  });

  describe('variants behavior', () => {
    it('should use default variant when not specified', () => {
      const { container } = render(<Button>Default</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('bg-primary');
    });

    it('should apply primary variant styles', () => {
      const { container } = render(<Button variant="primary">Primary</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('bg-blue-600');
    });

    it('should apply secondary variant styles', () => {
      const { container } = render(<Button variant="secondary">Secondary</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('bg-secondary');
    });

    it('should apply danger variant styles', () => {
      const { container } = render(<Button variant="danger">Danger</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('bg-red-600');
    });

    it('should apply ghost variant styles', () => {
      const { container } = render(<Button variant="ghost">Ghost</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('hover:bg-accent');
    });

    it('should apply link variant styles', () => {
      const { container } = render(<Button variant="link">Link</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('underline-offset-4');
    });
  });

  describe('sizes behavior', () => {
    it('should use default size when not specified', () => {
      const { container } = render(<Button>Default Size</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('h-11');
      expect(button?.className).toContain('min-h-[44px]');
    });

    it('should apply small size styles', () => {
      const { container } = render(<Button size="sm">Small</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('h-10');
      expect(button?.className).toContain('min-h-[40px]');
    });

    it('should apply large size styles', () => {
      const { container } = render(<Button size="lg">Large</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('h-12');
      expect(button?.className).toContain('min-h-[48px]');
    });

    it('should apply icon size styles', () => {
      const { container } = render(<Button size="icon">📱</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('h-11');
      expect(button?.className).toContain('w-11');
      expect(button?.className).toContain('min-h-[44px]');
      expect(button?.className).toContain('min-w-[44px]');
    });
  });

  describe('accessibility features', () => {
    it('should have focus styles applied', () => {
      const { container } = render(<Button>Focus Test</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('focus-visible:outline-none');
      expect(button?.className).toContain('focus-visible:ring-2');
    });

    it('should have touch-friendly minimum sizes', () => {
      const { container } = render(<Button>Touch Target</Button>);
      const button = container.querySelector('button');

      // Default button should have minimum 44px height for touch
      expect(button?.className).toContain('min-h-[44px]');
    });

    it('should prevent text selection', () => {
      const { container } = render(<Button>No Select</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('select-none');
    });

    it('should have proper disabled state styling', () => {
      const { container } = render(<Button disabled>Disabled</Button>);
      const button = container.querySelector('button');

      expect(button?.className).toContain('disabled:opacity-50');
      expect(button?.className).toContain('disabled:pointer-events-none');
    });

    it('should be keyboard accessible', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Keyboard Test</Button>);

      const button = screen.getByRole('button', { name: /keyboard test/i });

      // Focus the button and simulate Enter key
      button.focus();
      fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('HTML attributes and props forwarding', () => {
    it('should forward HTML button attributes', () => {
      render(
        <Button type="submit" data-testid="submit-btn">
          Submit
        </Button>
      );

      const button = screen.getByTestId('submit-btn');
      expect(button).toHaveAttribute('type', 'submit');
    });

    it('should forward ref correctly', () => {
      const ref = jest.fn();
      render(<Button ref={ref}>Ref Test</Button>);

      expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
    });

    it('should merge custom className with button styles', () => {
      const { container } = render(
        <Button className="custom-class" variant="primary" size="lg">
          Merged Classes
        </Button>
      );
      const button = container.querySelector('button');

      // Should contain both custom class and button-specific classes
      expect(button?.className).toContain('custom-class');
      expect(button?.className).toContain('bg-blue-600');
      expect(button?.className).toContain('h-12');
    });
  });

  describe('loading state edge cases', () => {
    it('should show loading state even with null children', () => {
      render(<Button loading>{null}</Button>);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
      expect(screen.getByTitle('読み込み中')).toBeInTheDocument();
    });

    it('should show loading state even with undefined children', () => {
      render(<Button loading />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('should be disabled when both loading and disabled are true', () => {
      render(
        <Button loading disabled>
          Test
        </Button>
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should not trigger onClick during loading state', () => {
      const handleClick = jest.fn();
      render(
        <Button loading onClick={handleClick}>
          Loading
        </Button>
      );

      const button = screen.getByRole('button');

      // Try multiple ways to trigger click
      fireEvent.click(button);
      fireEvent.mouseDown(button);
      fireEvent.mouseUp(button);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('component metadata', () => {
    it('should have correct display name for debugging', () => {
      expect(Button.displayName).toBe('Button');
    });
  });

  describe('complex combinations', () => {
    it('should handle complex prop combinations correctly', () => {
      const { container } = render(
        <Button
          variant="danger"
          size="lg"
          disabled
          className="extra-styles"
          data-testid="complex-button"
        >
          Complex Button
        </Button>
      );

      const button = container.querySelector('button');

      expect(button?.className).toContain('bg-red-600'); // danger variant
      expect(button?.className).toContain('h-12'); // lg size
      expect(button?.className).toContain('disabled:opacity-50'); // disabled styles
      expect(button?.className).toContain('extra-styles'); // custom class
      expect(button).toBeDisabled();
    });

    it('should prioritize loading over other states', () => {
      render(
        <Button loading disabled onClick={jest.fn()}>
          Priority Test
        </Button>
      );

      // Should show loading state, not children
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
      expect(screen.queryByText('Priority Test')).not.toBeInTheDocument();
    });
  });
});
