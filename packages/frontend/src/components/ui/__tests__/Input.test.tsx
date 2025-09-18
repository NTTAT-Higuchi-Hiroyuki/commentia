/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { Input } from '../Input';

// Mock the cn utility function
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

describe('Input Component', () => {
  it('should render with default props', () => {
    render(<Input placeholder="Enter text" />);

    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'text');
  });

  it('should handle value changes', () => {
    const handleChange = jest.fn();
    render(<Input value="test" onChange={handleChange} />);

    const input = screen.getByDisplayValue('test');
    fireEvent.change(input, { target: { value: 'new value' } });

    expect(handleChange).toHaveBeenCalled();
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Input disabled />);

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('should forward HTML input attributes', () => {
    render(<Input type="email" maxLength={100} data-testid="email-input" placeholder="Email" />);

    const input = screen.getByTestId('email-input');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('maxLength', '100');
    expect(input).toHaveAttribute('placeholder', 'Email');
  });

  it('should accept custom className', () => {
    const { container } = render(<Input className="custom-class" />);
    const input = container.querySelector('input');

    expect(input?.className).toContain('custom-class');
  });

  it('should forward ref correctly', () => {
    const ref = jest.fn();
    render(<Input ref={ref} />);

    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('should handle focus and blur events', () => {
    const handleFocus = jest.fn();
    const handleBlur = jest.fn();

    render(<Input onFocus={handleFocus} onBlur={handleBlur} />);

    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    expect(handleFocus).toHaveBeenCalled();

    fireEvent.blur(input);
    expect(handleBlur).toHaveBeenCalled();
  });

  it('should apply base styles', () => {
    const { container } = render(<Input />);
    const input = container.querySelector('input');

    // Check for base styling classes
    expect(input?.className).toContain('flex');
    expect(input?.className).toContain('border');
    expect(input?.className).toContain('rounded-md');
  });

  describe('accessibility', () => {
    it('should be keyboard accessible', () => {
      render(<Input />);

      const input = screen.getByRole('textbox');
      input.focus();

      expect(document.activeElement).toBe(input);
    });

    it('should support aria attributes', () => {
      render(
        <Input aria-label="Search input" aria-describedby="helper-text" aria-invalid="false" />
      );

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-label', 'Search input');
      expect(input).toHaveAttribute('aria-describedby', 'helper-text');
      expect(input).toHaveAttribute('aria-invalid', 'false');
    });
  });

  describe('different input types', () => {
    it('should render password input', () => {
      const { container } = render(<Input type="password" />);
      const input = container.querySelector('input[type="password"]');

      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should render email input', () => {
      render(<Input type="email" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('should render number input', () => {
      render(<Input type="number" />);

      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('type', 'number');
    });

    it('should render search input', () => {
      render(<Input type="search" />);

      const input = screen.getByRole('searchbox');
      expect(input).toHaveAttribute('type', 'search');
    });
  });

  describe('controlled vs uncontrolled', () => {
    it('should work as controlled component', () => {
      const handleChange = jest.fn();
      const { rerender } = render(<Input value="initial" onChange={handleChange} />);

      const input = screen.getByDisplayValue('initial');
      expect(input).toHaveValue('initial');

      fireEvent.change(input, { target: { value: 'updated' } });
      expect(handleChange).toHaveBeenCalled();

      // Re-render with new value (simulating parent component update)
      rerender(<Input value="updated" onChange={handleChange} />);
      expect(input).toHaveValue('updated');
    });

    it('should work as uncontrolled component', () => {
      render(<Input defaultValue="default" />);

      const input = screen.getByDisplayValue('default');
      expect(input).toHaveValue('default');

      fireEvent.change(input, { target: { value: 'user input' } });
      expect(input).toHaveValue('user input');
    });
  });

  describe('edge cases', () => {
    it('should handle empty value', () => {
      render(<Input value="" onChange={() => {}} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('');
    });

    it('should handle undefined value gracefully', () => {
      render(<Input value={undefined} onChange={() => {}} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('');
    });

    it('should handle null onChange gracefully', () => {
      expect(() => {
        render(<Input onChange={null as any} />);
      }).not.toThrow();
    });

    it('should work without onChange handler', () => {
      expect(() => {
        render(<Input />);
      }).not.toThrow();
    });

    it('should handle keyboard input', () => {
      render(<Input />);

      const input = screen.getByRole('textbox');

      fireEvent.keyDown(input, { key: 'a', code: 'KeyA' });
      fireEvent.keyUp(input, { key: 'a', code: 'KeyA' });

      // Should not throw any errors
      expect(input).toBeInTheDocument();
    });
  });

  describe('value handling', () => {
    it('should handle string values', () => {
      render(<Input value="test string" onChange={() => {}} />);

      const input = screen.getByDisplayValue('test string');
      expect(input).toHaveValue('test string');
    });

    it('should handle number values in text input', () => {
      render(<Input value="123" onChange={() => {}} />);

      const input = screen.getByDisplayValue('123');
      expect(input).toHaveValue('123');
    });

    it('should handle special characters', () => {
      const specialValue = 'test@example.com';
      render(<Input value={specialValue} onChange={() => {}} />);

      const input = screen.getByDisplayValue(specialValue);
      expect(input).toHaveValue(specialValue);
    });
  });
});
