interface FooterProps {
  showLinks?: boolean;
  className?: string;
}

export const Footer = ({ showLinks = false, className = '' }: FooterProps) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`bg-white border-t border-gray-200 mt-auto ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-4">
          {showLinks && (
            <div className="flex justify-center space-x-6 mb-4">
              <a
                href="/about"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                このサイトについて
              </a>
              <a
                href="/privacy"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                プライバシーポリシー
              </a>
              <a
                href="/terms"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                利用規約
              </a>
              <a
                href="/contact"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                お問い合わせ
              </a>
            </div>
          )}

          <div className="text-center text-sm text-gray-500">
            <p>© {currentYear} Commentia. All rights reserved.</p>
            <p className="mt-1">リアルタイムコメント投稿システム</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export type { FooterProps };
