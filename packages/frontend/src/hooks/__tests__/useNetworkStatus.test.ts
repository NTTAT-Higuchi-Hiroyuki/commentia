/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { useNetworkCapability, useNetworkStatus } from '../useNetworkStatus';

// Mock Toast component
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: {
      warning: jest.fn(),
      success: jest.fn(),
    },
  }),
}));

// Helper to mock navigator.onLine
const mockNavigatorOnLine = (isOnline: boolean) => {
  Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: isOnline,
  });
};

// Helper to mock connection API
const mockConnection = (connectionData: any) => {
  Object.defineProperty(navigator, 'connection', {
    writable: true,
    value: connectionData,
  });
};

// Helper to dispatch network events
const fireOnlineEvent = () => {
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
};

const fireOfflineEvent = () => {
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
};

describe('useNetworkStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset navigator.onLine to default state
    mockNavigatorOnLine(true);
    // Clear any existing connection mock
    (navigator as any).connection = undefined;
    (navigator as any).mozConnection = undefined;
    (navigator as any).webkitConnection = undefined;
  });

  describe('basic online/offline detection', () => {
    it('should return initial online status', () => {
      mockNavigatorOnLine(true);

      const { result } = renderHook(() => useNetworkStatus(false));

      expect(result.current.isOnline).toBe(true);
      expect(result.current.wasOffline).toBe(false);
    });

    it('should return initial offline status', () => {
      mockNavigatorOnLine(false);

      const { result } = renderHook(() => useNetworkStatus(false));

      expect(result.current.isOnline).toBe(false);
      expect(result.current.wasOffline).toBe(false);
    });

    it('should update status when going offline', () => {
      mockNavigatorOnLine(true);

      const { result } = renderHook(() => useNetworkStatus(false));

      expect(result.current.isOnline).toBe(true);

      // Simulate going offline
      mockNavigatorOnLine(false);
      fireOfflineEvent();

      expect(result.current.isOnline).toBe(false);
      expect(result.current.wasOffline).toBe(true);
    });

    it('should update status when going online', () => {
      mockNavigatorOnLine(false);

      const { result } = renderHook(() => useNetworkStatus(false));

      expect(result.current.isOnline).toBe(false);

      // Simulate going online
      mockNavigatorOnLine(true);
      fireOnlineEvent();

      expect(result.current.isOnline).toBe(true);
    });
  });

  describe('connection information', () => {
    it('should include connection type information when available', () => {
      const mockConnectionInfo = {
        type: 'wifi',
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
      };

      mockConnection(mockConnectionInfo);

      const { result } = renderHook(() => useNetworkStatus(false));

      expect(result.current.connectionType).toBe('wifi');
      expect(result.current.effectiveType).toBe('4g');
      expect(result.current.downlink).toBe(10);
      expect(result.current.rtt).toBe(50);
    });

    it('should work without connection information', () => {
      // No connection API available
      const { result } = renderHook(() => useNetworkStatus(false));

      expect(result.current.isOnline).toBeDefined();
      expect(result.current.connectionType).toBeUndefined();
      expect(result.current.effectiveType).toBeUndefined();
    });

    it('should handle partial connection information', () => {
      const mockConnectionInfo = {
        effectiveType: '3g',
        // Missing other properties
      };

      mockConnection(mockConnectionInfo);

      const { result } = renderHook(() => useNetworkStatus(false));

      expect(result.current.effectiveType).toBe('3g');
      expect(result.current.connectionType).toBeUndefined();
      expect(result.current.downlink).toBeUndefined();
      expect(result.current.rtt).toBeUndefined();
    });
  });

  describe('notifications', () => {
    it('should show notification when going offline', () => {
      const { useToast } = require('@/components/ui/Toast');
      const mockToast = useToast();

      mockNavigatorOnLine(true);

      renderHook(() => useNetworkStatus(true));

      // Simulate going offline
      mockNavigatorOnLine(false);
      fireOfflineEvent();

      expect(mockToast.toast.warning).toHaveBeenCalledWith(
        'オフラインになりました',
        'インターネット接続が切断されました。一部の機能が制限される場合があります。',
        { duration: 0 }
      );
    });

    it('should show notification when coming back online after being offline', () => {
      const { useToast } = require('@/components/ui/Toast');
      const mockToast = useToast();

      mockNavigatorOnLine(false);

      renderHook(() => useNetworkStatus(true));

      // First go offline to set wasOffline state
      fireOfflineEvent();

      // Then go online
      mockNavigatorOnLine(true);
      fireOnlineEvent();

      expect(mockToast.toast.success).toHaveBeenCalledWith(
        'オンラインに復帰しました',
        'インターネット接続が回復しました。',
        { duration: 3000 }
      );
    });

    it('should not show notifications when disabled', () => {
      const { useToast } = require('@/components/ui/Toast');
      const mockToast = useToast();

      mockNavigatorOnLine(true);

      renderHook(() => useNetworkStatus(false));

      // Simulate going offline
      mockNavigatorOnLine(false);
      fireOfflineEvent();

      expect(mockToast.toast.warning).not.toHaveBeenCalled();
      expect(mockToast.toast.success).not.toHaveBeenCalled();
    });
  });

  describe('connection change events', () => {
    it('should listen to connection change events when available', () => {
      const mockConnectionInfo = {
        type: 'wifi',
        effectiveType: '4g',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      mockConnection(mockConnectionInfo);

      const { unmount } = renderHook(() => useNetworkStatus(false));

      expect(mockConnectionInfo.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );

      // Test cleanup
      unmount();

      expect(mockConnectionInfo.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should work without connection event support', () => {
      const mockConnectionInfo = {
        type: 'wifi',
        effectiveType: '4g',
        // No addEventListener/removeEventListener
      };

      mockConnection(mockConnectionInfo);

      expect(() => {
        renderHook(() => useNetworkStatus(false));
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useNetworkStatus(false));

      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });
});

describe('useNetworkCapability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigatorOnLine(true);
    (navigator as any).connection = undefined;
  });

  it('should return basic network capabilities', () => {
    const { result } = renderHook(() => useNetworkCapability());

    expect(result.current.canMakeRequests).toBe(true);
    expect(result.current.isOnline).toBe(true);
    expect(result.current.wasOffline).toBe(false);
  });

  it('should detect slow connections', () => {
    const mockConnectionInfo = {
      effectiveType: 'slow-2g',
    };

    mockConnection(mockConnectionInfo);

    const { result } = renderHook(() => useNetworkCapability());

    expect(result.current.isSlowConnection).toBe(true);
    expect(result.current.isFastConnection).toBe(false);
    expect(result.current.shouldOptimizeForBandwidth).toBe(true);
  });

  it('should detect fast connections', () => {
    const mockConnectionInfo = {
      effectiveType: '4g',
    };

    mockConnection(mockConnectionInfo);

    const { result } = renderHook(() => useNetworkCapability());

    expect(result.current.isFastConnection).toBe(true);
    expect(result.current.isSlowConnection).toBe(false);
    expect(result.current.shouldOptimizeForBandwidth).toBe(false);
  });

  it('should recommend bandwidth optimization for slow connections', () => {
    const slowConnectionTypes = ['slow-2g', '2g', '3g'];

    slowConnectionTypes.forEach((effectiveType) => {
      const mockConnectionInfo = { effectiveType };
      mockConnection(mockConnectionInfo);

      const { result } = renderHook(() => useNetworkCapability());

      expect(result.current.shouldOptimizeForBandwidth).toBe(true);
    });
  });

  it('should not recommend bandwidth optimization for fast connections', () => {
    const fastConnectionTypes = ['4g', '5g'];

    fastConnectionTypes.forEach((effectiveType) => {
      const mockConnectionInfo = { effectiveType };
      mockConnection(mockConnectionInfo);

      const { result } = renderHook(() => useNetworkCapability());

      expect(result.current.shouldOptimizeForBandwidth).toBe(false);
    });
  });

  it('should not allow requests when offline', () => {
    mockNavigatorOnLine(false);

    const { result } = renderHook(() => useNetworkCapability());

    expect(result.current.canMakeRequests).toBe(false);
    expect(result.current.shouldOptimizeForBandwidth).toBe(false);
  });

  describe('edge cases', () => {
    it('should handle missing connection information gracefully', () => {
      const { result } = renderHook(() => useNetworkCapability());

      expect(result.current.isSlowConnection).toBe(false);
      expect(result.current.isFastConnection).toBe(false);
      expect(result.current.shouldOptimizeForBandwidth).toBe(false);
    });

    it('should handle unknown connection types', () => {
      const mockConnectionInfo = {
        effectiveType: 'unknown-type',
      };

      mockConnection(mockConnectionInfo);

      const { result } = renderHook(() => useNetworkCapability());

      expect(result.current.isSlowConnection).toBe(false);
      expect(result.current.isFastConnection).toBe(false);
      expect(result.current.shouldOptimizeForBandwidth).toBe(false);
    });
  });
});
