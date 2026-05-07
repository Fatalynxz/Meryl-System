import { useState } from 'react';
import { Bell, X, AlertTriangle, TrendingDown, Calendar, Package, TrendingUp, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

interface Notification {
  id: string;
  type: 'warning' | 'info' | 'critical' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  icon: 'stock' | 'promotion' | 'sales' | 'trend' | 'info';
  unread: boolean;
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'critical',
      title: 'Critical Stock Alert',
      message: 'Nike Air Max 90 has only 8 units left. Stockout expected in 3 days.',
      timestamp: new Date(Date.now() - 15 * 60000),
      icon: 'stock',
      unread: true,
    },
    {
      id: '2',
      type: 'warning',
      title: 'Low Stock Warning',
      message: 'Adidas Ultraboost inventory below reorder point (12 units remaining).',
      timestamp: new Date(Date.now() - 45 * 60000),
      icon: 'stock',
      unread: true,
    },
    {
      id: '3',
      type: 'warning',
      title: 'Promotion Ending Soon',
      message: 'Summer Sale ends in 2 days. Current revenue: $28,450.',
      timestamp: new Date(Date.now() - 2 * 60 * 60000),
      icon: 'promotion',
      unread: true,
    },
    {
      id: '4',
      type: 'info',
      title: 'Sales Target Update',
      message: 'You\'ve reached 85% of your monthly sales target ($34,200/$40,000).',
      timestamp: new Date(Date.now() - 3 * 60 * 60000),
      icon: 'sales',
      unread: false,
    },
    {
      id: '5',
      type: 'warning',
      title: 'Slow-Moving Inventory',
      message: 'Formal Oxford shoes have been in stock for 145 days with only 12 sales.',
      timestamp: new Date(Date.now() - 5 * 60 * 60000),
      icon: 'trend',
      unread: false,
    },
    {
      id: '6',
      type: 'success',
      title: 'High Demand Product',
      message: 'Nike Air Max 90 showing 12.3% velocity increase. Recommend restocking.',
      timestamp: new Date(Date.now() - 6 * 60 * 60000),
      icon: 'trend',
      unread: false,
    },
    {
      id: '7',
      type: 'critical',
      title: 'Multiple Low Stock Items',
      message: '5 products are below reorder point. Immediate action required.',
      timestamp: new Date(Date.now() - 7 * 60 * 60000),
      icon: 'stock',
      unread: true,
    },
    {
      id: '8',
      type: 'info',
      title: 'Seasonal Forecast',
      message: 'Spring collection expected to generate $35,800 in June based on trends.',
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60000),
      icon: 'info',
      unread: false,
    },
  ]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'stock':
        return <Package className="w-4 h-4" />;
      case 'promotion':
        return <Calendar className="w-4 h-4" />;
      case 'sales':
        return <TrendingUp className="w-4 h-4" />;
      case 'trend':
        return <TrendingDown className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'critical':
        return 'bg-red-900 text-yellow-200 border-red-800';
      case 'warning':
        return 'bg-red-800 text-yellow-200 border-red-700';
      case 'success':
        return 'bg-green-900 text-yellow-200 border-green-800';
      default:
        return 'bg-red-700 text-yellow-200 border-red-600';
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, unread: false } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, unread: false }))
    );
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="ghost"
        className="relative hover:bg-red-800 text-yellow-300"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 bg-yellow-400 text-red-900 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </Button>

      {/* Notification Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 top-12 w-96 bg-red-700 border-2 border-red-800 rounded-lg shadow-2xl z-50">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-red-800">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-400" />
                <h3 className="text-yellow-300 font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-yellow-400 text-red-900">
                    {unreadCount} new
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    onClick={markAllAsRead}
                    variant="ghost"
                    size="sm"
                    className="text-yellow-300 hover:text-yellow-100 hover:bg-red-800 text-xs"
                  >
                    Mark all read
                  </Button>
                )}
                <Button
                  onClick={() => setIsOpen(false)}
                  variant="ghost"
                  size="sm"
                  className="text-yellow-300 hover:text-yellow-100 hover:bg-red-800"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Notifications List */}
            <ScrollArea className="h-[500px]">
              <div className="p-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-yellow-200">
                    <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No notifications</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-3 rounded-lg border-2 ${getTypeColor(notification.type)} ${
                          notification.unread ? 'border-l-4 border-l-yellow-400' : ''
                        } hover:bg-red-600 transition-colors cursor-pointer`}
                        onClick={() => markAsRead(notification.id)}
                      >
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {getIcon(notification.icon)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-yellow-300 text-sm font-semibold">
                                {notification.title}
                              </h4>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotification(notification.id);
                                }}
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 hover:bg-red-900"
                              >
                                <X className="w-3 h-3 text-yellow-200" />
                              </Button>
                            </div>
                            <p className="text-yellow-200 text-xs mb-2">
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-yellow-300 text-xs opacity-75">
                                {formatTimestamp(notification.timestamp)}
                              </span>
                              {notification.type === 'critical' && (
                                <Badge className="bg-red-950 text-yellow-300 border-red-800 text-xs">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Critical
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-red-800 bg-red-800">
              <Button
                variant="ghost"
                className="w-full text-yellow-300 hover:text-yellow-100 hover:bg-red-700 text-sm"
              >
                View All Notifications
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
