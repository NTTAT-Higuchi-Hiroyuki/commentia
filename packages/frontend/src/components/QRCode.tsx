import QRCodeLib from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Loading } from './ui/Loading';

interface QRCodeProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  includeMargin?: boolean;
  darkColor?: string;
  lightColor?: string;
  showDownload?: boolean;
  className?: string;
  alt?: string;
}

export const QRCode = ({
  value,
  size = 256,
  level = 'M',
  includeMargin = true,
  darkColor = '#000000',
  lightColor = '#FFFFFF',
  showDownload = false,
  className = '',
  alt = 'QR Code',
}: QRCodeProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateQRCode = async () => {
      if (!canvasRef.current || !value) return;

      setIsLoading(true);
      setError(null);

      try {
        await QRCodeLib.toCanvas(canvasRef.current, value, {
          width: size,
          margin: includeMargin ? 2 : 0,
          color: {
            dark: darkColor,
            light: lightColor,
          },
          errorCorrectionLevel: level,
        });
      } catch (err) {
        console.error('QR Code generation error:', err);
        setError(err instanceof Error ? err.message : 'QRコードの生成に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    generateQRCode();
  }, [value, size, level, includeMargin, darkColor, lightColor]);

  const handleDownload = () => {
    if (!canvasRef.current) return;

    try {
      const link = document.createElement('a');
      link.download = 'qrcode.png';
      link.href = canvasRef.current.toDataURL();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      canvas.toBlob(async (blob) => {
        if (blob) {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
        }
      });
    } catch (err) {
      console.error('Copy to clipboard error:', err);
      // Fallback: copy the text value
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        // Silent fail if clipboard is not available
      }
    }
  };

  if (error) {
    return (
      <div className={`flex flex-col items-center p-4 ${className}`}>
        <div className="text-red-600 text-center">
          <svg
            className="mx-auto h-12 w-12 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center space-y-4 ${className}`}>
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
            <Loading size="md" text="QRコード生成中..." />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`border border-gray-200 rounded-lg ${isLoading ? 'opacity-50' : ''}`}
          style={{ width: size, height: size }}
          aria-label={alt}
        />
      </div>

      {(showDownload || navigator.clipboard) && !isLoading && (
        <div className="flex space-x-2">
          {showDownload && (
            <Button
              onClick={handleDownload}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>ダウンロード</span>
            </Button>
          )}

          {navigator.clipboard && (
            <Button
              onClick={handleCopyToClipboard}
              variant="secondary"
              size="sm"
              className="flex items-center space-x-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>コピー</span>
            </Button>
          )}
        </div>
      )}

      {/* Display the value being encoded */}
      <div className="text-xs text-gray-500 text-center max-w-xs break-all">{value}</div>
    </div>
  );
};

export type { QRCodeProps };
