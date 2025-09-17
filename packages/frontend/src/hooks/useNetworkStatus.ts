import { useToast } from '@/components/ui/Toast';
import { useEffect, useState } from 'react';

interface NetworkConnection {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (event: string, handler: () => void) => void;
  removeEventListener?: (event: string, handler: () => void) => void;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkConnection;
  mozConnection?: NetworkConnection;
  webkitConnection?: NetworkConnection;
}

interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean;
  connectionType?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export const useNetworkStatus = (showNotifications = true) => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    wasOffline: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    const updateNetworkStatus = () => {
      const wasOffline = !networkStatus.isOnline && !navigator.onLine;
      const isNowOnline = navigator.onLine;
      const isNowOffline = !navigator.onLine;

      // Get additional connection information if available
      const connection =
        (navigator as NavigatorWithConnection).connection ||
        (navigator as NavigatorWithConnection).mozConnection ||
        (navigator as NavigatorWithConnection).webkitConnection;
      const connectionInfo: Partial<NetworkStatus> = {};
      if (connection) {
        if (connection.type) connectionInfo.connectionType = connection.type;
        if (connection.effectiveType) connectionInfo.effectiveType = connection.effectiveType;
        if (connection.downlink !== undefined) connectionInfo.downlink = connection.downlink;
        if (connection.rtt !== undefined) connectionInfo.rtt = connection.rtt;
      }

      setNetworkStatus((prev) => ({
        isOnline: isNowOnline,
        wasOffline: prev.wasOffline || isNowOffline,
        ...connectionInfo,
      }));

      // Show notifications for network changes
      if (showNotifications) {
        if (isNowOffline && networkStatus.isOnline) {
          toast.warning(
            'オフラインになりました',
            'インターネット接続が切断されました。一部の機能が制限される場合があります。',
            { duration: 0 }
          );
        } else if (isNowOnline && wasOffline) {
          toast.success('オンラインに復帰しました', 'インターネット接続が回復しました。', {
            duration: 3000,
          });
        }
      }
    };

    const handleOnline = () => {
      updateNetworkStatus();
    };

    const handleOffline = () => {
      updateNetworkStatus();
    };

    // Listen for network status changes
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes if supported
    const connection =
      (navigator as NavigatorWithConnection).connection ||
      (navigator as NavigatorWithConnection).mozConnection ||
      (navigator as NavigatorWithConnection).webkitConnection;
    if (connection?.addEventListener) {
      connection.addEventListener('change', updateNetworkStatus);
    }

    // Initial check
    updateNetworkStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection?.removeEventListener) {
        connection.removeEventListener('change', updateNetworkStatus);
      }
    };
  }, [networkStatus.isOnline, showNotifications, toast]);

  return networkStatus;
};

// Hook for checking if we can make network requests
export const useNetworkCapability = () => {
  const networkStatus = useNetworkStatus(false);

  return {
    ...networkStatus,
    canMakeRequests: networkStatus.isOnline,
    isSlowConnection:
      networkStatus.effectiveType === 'slow-2g' || networkStatus.effectiveType === '2g',
    isFastConnection: networkStatus.effectiveType === '4g' || networkStatus.effectiveType === '5g',
    shouldOptimizeForBandwidth:
      networkStatus.isOnline &&
      (networkStatus.effectiveType === 'slow-2g' ||
        networkStatus.effectiveType === '2g' ||
        networkStatus.effectiveType === '3g'),
  };
};
