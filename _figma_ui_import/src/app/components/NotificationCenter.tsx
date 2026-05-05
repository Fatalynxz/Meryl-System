import { useMemo, useState } from "react";
import { Bell, X, AlertTriangle, TrendingDown, Calendar, Package, TrendingUp, Info } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { useNotifications, useProducts, usePromotions, useReturns, useSales } from "../../lib/hooks";

interface NotificationItem {
  id: string;
  type: "warning" | "info" | "critical" | "success";
  title: string;
  message: string;
  timestamp: Date;
  icon: "stock" | "promotion" | "sales" | "trend" | "info";
}

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const salesQuery = useSales();
  const productsQuery = useProducts();
  const promotionsQuery = usePromotions();
  const returnsQuery = useReturns();
  const notificationsQuery = useNotifications();

  const sales = (salesQuery.data as any[]) ?? [];
  const products = (productsQuery.data as any[]) ?? [];
  const promotions = (promotionsQuery.data as any[]) ?? [];
  const returnsList = (returnsQuery.data as any[]) ?? [];
  const dbNotifications = (notificationsQuery.data as any[]) ?? [];

  const notifications = useMemo(() => {
    const now = new Date();
    const generated: NotificationItem[] = [];

    const lowStock = products
      .map((p) => {
        const inventory = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
        const stock = Number(inventory?.stock_quantity ?? 0);
        const reorder = Number(p.reorder_level ?? inventory?.reorder_level ?? 10);
        return { name: String(p.product_name ?? "Unknown Product"), stock, reorder };
      })
      .filter((x) => x.stock <= x.reorder);

    const criticalStock = lowStock.filter((x) => x.stock <= Math.max(2, Math.floor(x.reorder * 0.4)));
    if (criticalStock.length > 0) {
      const top = criticalStock[0];
      generated.push({
        id: `stock-critical-${top.name}`,
        type: "critical",
        title: "Critical Stock Alert",
        message: `${top.name} has only ${top.stock} units left and is below safe stock level.`,
        timestamp: now,
        icon: "stock",
      });
    }
    if (lowStock.length > 0) {
      generated.push({
        id: "stock-low-summary",
        type: "warning",
        title: "Low Stock Warning",
        message: `${lowStock.length} products are at or below reorder level.`,
        timestamp: new Date(now.getTime() - 10 * 60000),
        icon: "stock",
      });
    }

    const pendingSales = sales.filter((s) => {
      const payment = Array.isArray((s as any).payment) ? (s as any).payment[0] : (s as any).payment;
      const status = String(payment?.payment_status ?? "").toLowerCase();
      return status === "pending";
    }).length;
    if (pendingSales > 0) {
      generated.push({
        id: "sales-pending",
        type: "info",
        title: "Pending Sales",
        message: `${pendingSales} sale records are currently pending payment.`,
        timestamp: new Date(now.getTime() - 20 * 60000),
        icon: "sales",
      });
    }

    const recentCompletedSales = sales.filter((s) => {
      const payment = Array.isArray((s as any).payment) ? (s as any).payment[0] : (s as any).payment;
      const status = String(payment?.payment_status ?? "").toLowerCase();
      const date = asDate(s.transaction_date ?? s.created_at);
      return status === "completed" && date && now.getTime() - date.getTime() <= 24 * 60 * 60000;
    });
    if (recentCompletedSales.length >= 5) {
      generated.push({
        id: "sales-high-24h",
        type: "success",
        title: "High Sales Activity",
        message: `${recentCompletedSales.length} completed sales were recorded in the last 24 hours.`,
        timestamp: new Date(now.getTime() - 30 * 60000),
        icon: "trend",
      });
    }

    const activePromotions = promotions.filter((p) => String(p.status ?? "").toLowerCase() === "active");
    const endingSoon = activePromotions.filter((p) => {
      const end = asDate(p.end_date);
      if (!end) return false;
      const diff = end.getTime() - now.getTime();
      return diff > 0 && diff <= 2 * 24 * 60 * 60000;
    });
    if (endingSoon.length > 0) {
      const promo = endingSoon[0];
      generated.push({
        id: `promo-ending-${promo.promotion_id ?? promo.promotion_name}`,
        type: "warning",
        title: "Promotion Ending Soon",
        message: `${promo.promotion_name ?? "An active promotion"} ends within 48 hours.`,
        timestamp: asDate(promo.updated_at ?? promo.created_at) ?? new Date(now.getTime() - 45 * 60000),
        icon: "promotion",
      });
    }

    const pendingReturns = returnsList.filter((r) => String(r.status ?? "").toLowerCase() === "pending").length;
    if (pendingReturns > 0) {
      generated.push({
        id: "returns-pending",
        type: "info",
        title: "Pending Return Requests",
        message: `${pendingReturns} return requests are waiting for review.`,
        timestamp: new Date(now.getTime() - 60 * 60000),
        icon: "info",
      });
    }

    const fromDb: NotificationItem[] = dbNotifications.slice(0, 12).map((n: any) => {
      const title = String(n.subject ?? n.title ?? "System Notification");
      const message = String(n.message ?? n.content ?? "New update available.");
      const rawType = String(n.notification_type ?? n.type ?? "info").toLowerCase();
      const type: NotificationItem["type"] =
        rawType.includes("critical")
          ? "critical"
          : rawType.includes("warn")
            ? "warning"
            : rawType.includes("success")
              ? "success"
              : "info";
      return {
        id: `db-${n.notification_id ?? title}`,
        type,
        title,
        message,
        timestamp: asDate(n.date_sent ?? n.created_at ?? n.updated_at) ?? now,
        icon: type === "critical" || type === "warning" ? "stock" : "info",
      };
    });

    return [...generated, ...fromDb]
      .filter((n) => !dismissedIds.has(n.id))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [products, sales, promotions, returnsList, dbNotifications, dismissedIds]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case "stock":
        return <Package className="w-4 h-4" />;
      case "promotion":
        return <Calendar className="w-4 h-4" />;
      case "sales":
        return <TrendingUp className="w-4 h-4" />;
      case "trend":
        return <TrendingDown className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "critical":
        return "bg-red-900 text-yellow-200 border-red-800";
      case "warning":
        return "bg-red-800 text-yellow-200 border-red-700";
      case "success":
        return "bg-green-900 text-yellow-200 border-green-800";
      default:
        return "bg-red-700 text-yellow-200 border-red-600";
    }
  };

  const markAsRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
  };

  const markAllAsRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  const deleteNotification = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.max(0, Math.floor(diff / 60000));
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="relative">
      <Button onClick={() => setIsOpen(!isOpen)} variant="ghost" className="relative hover:bg-red-800 text-yellow-300">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 bg-yellow-400 text-red-900 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-12 w-96 bg-red-700 border-2 border-red-800 rounded-lg shadow-2xl z-50">
            <div className="flex items-center justify-between p-4 border-b border-red-800">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-400" />
                <h3 className="text-yellow-300 font-semibold">Notifications</h3>
                {unreadCount > 0 && <Badge className="bg-yellow-400 text-red-900">{unreadCount} new</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button onClick={markAllAsRead} variant="ghost" size="sm" className="text-yellow-300 hover:text-yellow-100 hover:bg-red-800 text-xs">
                    Mark all read
                  </Button>
                )}
                <Button onClick={() => setIsOpen(false)} variant="ghost" size="sm" className="text-yellow-300 hover:text-yellow-100 hover:bg-red-800">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

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
                          !readIds.has(notification.id) ? "border-l-4 border-l-yellow-400" : ""
                        } hover:bg-red-600 transition-colors cursor-pointer`}
                        onClick={() => markAsRead(notification.id)}
                      >
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 mt-1">{getIcon(notification.icon)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-yellow-300 text-sm font-semibold">{notification.title}</h4>
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
                            <p className="text-yellow-200 text-xs mb-2">{notification.message}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-yellow-300 text-xs opacity-75">{formatTimestamp(notification.timestamp)}</span>
                              {notification.type === "critical" && (
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

            <div className="p-3 border-t border-red-800 bg-red-800">
              <Button variant="ghost" className="w-full text-yellow-300 hover:text-yellow-100 hover:bg-red-700 text-sm">
                View All Notifications
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

