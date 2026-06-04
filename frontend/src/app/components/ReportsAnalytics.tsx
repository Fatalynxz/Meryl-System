import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { BarChart3, TrendingUp, Coins, Package, Calendar, Download, FileText } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { useProducts, usePromotions, useSales } from '../../lib/hooks';

function isCompletedSale(sale: any) {
  const payment = Array.isArray(sale.payment) ? sale.payment[0] : sale.payment;
  const status = String(payment?.payment_status ?? '').toLowerCase();
  return ['completed', 'paid', 'success', 'successful'].includes(status);
}

function saleDate(sale: any) {
  const raw = String(sale.transaction_date ?? sale.created_at ?? '').trim();
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const date = new Date(hasTimezone ? raw : `${raw}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function money(value: number) {
  if (value >= 1000000) return `PHP ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `PHP ${(value / 1000).toFixed(1)}K`;
  return `PHP ${value.toFixed(2)}`;
}

function moneyWhole(value: number) {
  return `PHP ${Math.round(value).toLocaleString()}`;
}

function percentChange(current: number, previous: number) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / previous) * 100;
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'custom';

function rangeWindow(timeRange: ReportPeriod, customStartDate?: string, customEndDate?: string) {
  const now = new Date();
  const rangeDaysMap: Record<Exclude<ReportPeriod, 'custom'>, number> = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    annually: 365,
  };
  if (timeRange === 'custom') {
    const parsedStart = customStartDate ? new Date(customStartDate) : null;
    const parsedEnd = customEndDate ? new Date(customEndDate) : null;
    const start = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : now;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const safeStart = start <= end ? start : end;
    const safeEnd = end >= start ? end : start;
    const days = Math.max(1, Math.ceil((safeEnd.getTime() - safeStart.getTime()) / 86400000) + 1);
    const previousStart = new Date(safeStart);
    previousStart.setDate(safeStart.getDate() - days);
    return { now: safeEnd, start: safeStart, previousStart, days };
  }
  const days = rangeDaysMap[timeRange] ?? 30;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - (days - 1));
  const previousStart = new Date(start);
  previousStart.setDate(start.getDate() - days);
  return { now, start, previousStart, days };
}

function formatDateRange(start: Date, end: Date) {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

type TrendBucketMode = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function weekStartMonday(date: Date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diffToMonday);
  return copy;
}

function trendBucketMode(timeRange: ReportPeriod, days: number): TrendBucketMode {
  if (timeRange === 'daily') return 'daily';
  if (timeRange === 'weekly') return 'weekly';
  if (timeRange === 'monthly') return 'monthly';
  if (timeRange === 'quarterly') return 'quarterly';
  if (timeRange === 'annually') return 'annually';
  if (days <= 31) return 'daily';
  if (days <= 120) return 'weekly';
  if (days <= 730) return 'monthly';
  return 'annually';
}

function bucketStartForDate(date: Date, mode: TrendBucketMode) {
  const copy = startOfDay(date);
  if (mode === 'weekly') return weekStartMonday(copy);
  if (mode === 'monthly') return new Date(copy.getFullYear(), copy.getMonth(), 1);
  if (mode === 'quarterly') return new Date(copy.getFullYear(), Math.floor(copy.getMonth() / 3) * 3, 1);
  if (mode === 'annually') return new Date(copy.getFullYear(), 0, 1);
  return copy;
}

function nextBucketStart(date: Date, mode: TrendBucketMode) {
  const next = new Date(date);
  if (mode === 'weekly') next.setDate(next.getDate() + 7);
  else if (mode === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (mode === 'quarterly') next.setMonth(next.getMonth() + 3);
  else if (mode === 'annually') next.setFullYear(next.getFullYear() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

function trendBucketLabel(bucket: Date, mode: TrendBucketMode) {
  if (mode === 'weekly') {
    const end = new Date(bucket);
    end.setDate(bucket.getDate() + 6);
    return `${bucket.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (mode === 'monthly') return bucket.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if (mode === 'quarterly') return `Q${Math.floor(bucket.getMonth() / 3) + 1} ${bucket.getFullYear()}`;
  if (mode === 'annually') return String(bucket.getFullYear());
  return bucket.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function salesTrendFrame(timeRange: ReportPeriod, customStartDate?: string, customEndDate?: string) {
  const window = rangeWindow(timeRange, customStartDate, customEndDate);
  const baseEnd = window.now;

  if (timeRange === 'weekly') {
    const start = weekStartMonday(baseEnd);
    const end = endOfDay(new Date(start));
    end.setDate(start.getDate() + 6);
    return { start, end, mode: 'daily' as TrendBucketMode };
  }

  if (timeRange === 'monthly') {
    const start = new Date(baseEnd.getFullYear(), 0, 1);
    const end = endOfDay(new Date(baseEnd.getFullYear(), 11, 31));
    return { start, end, mode: 'monthly' as TrendBucketMode };
  }

  if (timeRange === 'quarterly') {
    const start = new Date(baseEnd.getFullYear(), 0, 1);
    const end = endOfDay(new Date(baseEnd.getFullYear(), 11, 31));
    return { start, end, mode: 'quarterly' as TrendBucketMode };
  }

  if (timeRange === 'annually') {
    const start = new Date(baseEnd.getFullYear() - 4, 0, 1);
    const end = endOfDay(new Date(baseEnd.getFullYear(), 11, 31));
    return { start, end, mode: 'annually' as TrendBucketMode };
  }

  return {
    start: window.start,
    end: window.now,
    mode: trendBucketMode(timeRange, window.days),
  };
}

export function ReportsAnalytics() {
  const [timeRange, setTimeRange] = useState<ReportPeriod>('monthly');
  const [reportType, setReportType] = useState('overview');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showComparison, setShowComparison] = useState(true);
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const promotionsQuery = usePromotions();

  const salesRows = ((salesQuery.data as any[]) ?? []).filter(isCompletedSale);
  const productRows = (productsQuery.data as any[]) ?? [];
  const promotionRows = (promotionsQuery.data as any[]) ?? [];

  const productLookup = useMemo(() => {
    const map = new Map<string, any>();
    productRows.forEach((product: any) => map.set(String(product.product_id ?? ''), product));
    return map;
  }, [productRows]);

  const stockBySku = useMemo(() => {
    const map = new Map<string, number>();
    productRows.forEach((product: any) => {
      const inventory = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
      map.set(String(product.product_id ?? ''), Number(inventory?.stock_quantity ?? 0));
    });
    return map;
  }, [productRows]);

  const currentMetrics = useMemo(() => {
    const { now, start, previousStart } = rangeWindow(timeRange, customStartDate, customEndDate);
    const compareEnd = new Date(start.getTime() - 1);

    const current = salesRows.filter((sale) => {
      const date = saleDate(sale);
      return date && date >= start && date <= now;
    });
    const previous = salesRows.filter((sale) => {
      const date = saleDate(sale);
      return date && date >= previousStart && date <= compareEnd;
    });
    const summarize = (rows: any[]) => {
      const customers = new Set<string>();
      let revenue = 0;
      let units = 0;
      rows.forEach((sale) => {
        revenue += Number(sale.total_amount ?? 0);
        if (sale.customer_id) customers.add(String(sale.customer_id));
        const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
        details.forEach((detail: any) => {
          units += Number(detail.quantity ?? 0);
        });
      });
      return { revenue, units, customers: customers.size, transactions: rows.length };
    };
    return { current: summarize(current), previous: summarize(previous) };
  }, [customEndDate, customStartDate, salesRows, timeRange]);

  const filteredSalesTrends = useMemo(() => {
    const { end, mode, start } = salesTrendFrame(timeRange, customStartDate, customEndDate);
    const grouped = new Map<string, { sales: number; revenue: number; customers: Set<string>; firstDate: Date }>();
    let cursor = bucketStartForDate(start, mode);

    while (cursor <= end) {
      const bucket = new Date(cursor);
      grouped.set(localDateKey(bucket), {
        sales: 0,
        revenue: 0,
        customers: new Set<string>(),
        firstDate: bucket,
      });
      cursor = nextBucketStart(cursor, mode);
    }

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > end) return;
      const bucket = bucketStartForDate(date, mode);
      const key = localDateKey(bucket);
      const prev = grouped.get(key) ?? { sales: 0, revenue: 0, customers: new Set<string>(), firstDate: bucket };
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        prev.sales += Number(detail.quantity ?? 0);
      });
      prev.revenue += Number(sale.total_amount ?? 0);
      if (sale.customer_id) prev.customers.add(String(sale.customer_id));
      grouped.set(key, prev);
    });
    return Array.from(grouped.entries())
      .map(([, agg], idx) => ({
        id: `flt-${idx}`,
        date: trendBucketLabel(agg.firstDate, mode),
        sortDate: agg.firstDate.getTime(),
        sales: Math.round(agg.sales),
        revenue: Math.round(agg.revenue),
        customers: agg.customers.size,
      }))
      .sort((a, b) => a.sortDate - b.sortDate);
  }, [customEndDate, customStartDate, salesRows, timeRange]);

  const topProducts = useMemo(() => {
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);
    const byProduct = new Map<string, { id: string; name: string; sales: number; revenue: number; margin: number }>();
    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        const product = productLookup.get(String(detail.product_id ?? ''));
        const id = String(detail.product_id ?? '');
        const prev = byProduct.get(id) ?? {
          id,
          name: product?.product_name ?? detail.product?.product_name ?? 'Unknown Product',
          sales: 0,
          revenue: 0,
          margin: 0,
        };
        const revenue = Number(detail.subtotal ?? 0);
        const cost = Number(product?.cost_price ?? 0) * Number(detail.quantity ?? 0);
        prev.sales += Number(detail.quantity ?? 0);
        prev.revenue += revenue;
        prev.margin = prev.revenue > 0 ? Math.max(0, Math.round(((prev.revenue - cost) / prev.revenue) * 100)) : 0;
        byProduct.set(id, prev);
      });
    });
    return Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [customEndDate, customStartDate, productLookup, salesRows, timeRange]);

  const topBrands = useMemo(() => {
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);
    const byBrand = new Map<string, { name: string; sales: number; revenue: number }>();

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];

      details.forEach((detail: any) => {
        const product = productLookup.get(String(detail.product_id ?? '')) ?? detail.product;
        const brand = String(product?.brand ?? 'N/A');
        const qty = Number(detail.quantity ?? 0);
        const revenue = Number(detail.subtotal ?? 0);
        const prev = byBrand.get(brand) ?? { name: brand, sales: 0, revenue: 0 };
        prev.sales += qty;
        prev.revenue += revenue;
        byBrand.set(brand, prev);
      });
    });

    return Array.from(byBrand.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [customEndDate, customStartDate, productLookup, salesRows, timeRange]);

  const topSizes = useMemo(() => {
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);
    const bySize = new Map<string, { name: string; sales: number; revenue: number }>();

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];

      details.forEach((detail: any) => {
        const product = productLookup.get(String(detail.product_id ?? '')) ?? detail.product;
        const size = String(product?.size ?? 'N/A');
        const qty = Number(detail.quantity ?? 0);
        const revenue = Number(detail.subtotal ?? 0);
        const prev = bySize.get(size) ?? { name: size, sales: 0, revenue: 0 };
        prev.sales += qty;
        prev.revenue += revenue;
        bySize.set(size, prev);
      });
    });

    return Array.from(bySize.values()).sort((a, b) => b.sales - a.sales).slice(0, 5);
  }, [customEndDate, customStartDate, productLookup, salesRows, timeRange]);

  const revenueByCategory = useMemo(() => {
    const { now, start, previousStart } = rangeWindow(timeRange, customStartDate, customEndDate);
    const current = new Map<string, number>();
    const previous = new Map<string, number>();
    const addSale = (sale: any, target: Map<string, number>) => {
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        const product = productLookup.get(String(detail.product_id ?? ''));
        const category = String(product?.category?.[0]?.category_name ?? product?.category?.category_name ?? 'Uncategorized');
        target.set(category, (target.get(category) ?? 0) + Number(detail.subtotal ?? 0));
      });
    };
    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date) return;
      if (date >= start && date <= now) addSale(sale, current);
      if (date >= previousStart && date < start) addSale(sale, previous);
    });
    const total = Array.from(current.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(current.entries())
      .map(([category, revenue], index) => {
        const prevRevenue = previous.get(category) ?? 0;
        return {
          id: `rc${index}`,
          category,
          revenue,
          percentage: total > 0 ? Math.round((revenue / total) * 100) : 0,
          growth: Number(percentChange(revenue, prevRevenue).toFixed(1)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [customEndDate, customStartDate, productLookup, salesRows, timeRange]);

  const categoryDistribution = useMemo(() => {
    const colors = ['#fef08a', '#facc15', '#fde047', '#fef9c3', '#fefce8', '#fcd34d'];
    const rows = revenueByCategory.map((item, index) => ({
      id: `cd${index}`,
      name: item.category,
      value: item.percentage,
      color: colors[index % colors.length],
    }));
    return rows.length ? rows : [{ id: 'cd-empty', name: 'No Sales', value: 100, color: '#fef9c3' }];
  }, [revenueByCategory]);

  const salesBreakdownPeriod: 'daily' | 'weekly' | 'monthly' | 'quarterly' = useMemo(() => {
    if (timeRange === 'quarterly') return 'quarterly';
    if (timeRange === 'monthly' || timeRange === 'annually') return 'monthly';
    if (timeRange === 'weekly') return 'weekly';
    return 'daily';
  }, [timeRange]);

  const salesBreakdownRows = useMemo(() => {
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);
    const grouped = new Map<string, { label: string; date: Date; pairs: number; gross: number; discount: number; net: number }>();

    const getBreakdownKey = (date: Date) => {
      if (salesBreakdownPeriod === 'monthly') {
        return {
          key: date.toISOString().slice(0, 7),
          label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          date: new Date(date.getFullYear(), date.getMonth(), 1),
        };
      }

      if (salesBreakdownPeriod === 'quarterly') {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        const quarterStartMonth = (quarter - 1) * 3;
        return {
          key: `${date.getFullYear()}-Q${quarter}`,
          label: `Q${quarter} ${date.getFullYear()}`,
          date: new Date(date.getFullYear(), quarterStartMonth, 1),
        };
      }

      if (salesBreakdownPeriod === 'weekly') {
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        weekStart.setDate(weekStart.getDate() + diffToMonday);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        return {
          key: weekStart.toISOString().slice(0, 10),
          label: `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          date: weekStart,
        };
      }

      return {
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        date,
      };
    };

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const period = getBreakdownKey(date);
      const prev = grouped.get(period.key) ?? { label: period.label, date: period.date, pairs: 0, gross: 0, discount: 0, net: 0 };
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];

      details.forEach((detail: any) => {
        const qty = Number(detail.quantity ?? 0);
        const price = Number(detail.price ?? 0);
        const subtotal = Number(detail.subtotal ?? price * qty);
        const gross = price * qty;
        prev.pairs += qty;
        prev.gross += gross;
        prev.discount += Math.max(0, gross - subtotal);
        prev.net += subtotal;
      });

      grouped.set(period.key, prev);
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((row, index) => ({
        id: `daily-${index}`,
        date: row.label,
        pairs: row.pairs,
        gross: row.gross,
        discount: row.discount,
        net: row.net,
      }));
  }, [customEndDate, customStartDate, salesBreakdownPeriod, salesRows, timeRange]);

  const inventoryStatusRows = useMemo(() => (
    productRows
      .map((product: any) => {
        const inventory = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
        const stock = Number(inventory?.stock_quantity ?? 0);
        const reorder = Number(product.reorder_level ?? inventory?.reorder_level ?? 10);
        const status = stock <= Math.max(2, Math.floor(reorder * 0.4))
          ? 'Critical'
          : stock <= reorder
            ? 'Reorder Required'
            : stock >= reorder * 3
              ? 'Overstock'
              : 'Optimal';

        return {
          id: String(product.product_id ?? ''),
          itemId: String(product.sku ?? product.product_id ?? '').slice(0, 8).toUpperCase(),
          name: `${product.brand ?? 'N/A'} ${product.product_name ?? 'Product'}`.trim(),
          size: product.size ?? 'N/A',
          color: product.color ?? 'N/A',
          stock,
          reorder,
          status,
        };
      })
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8)
  ), [productRows]);

  const businessSummary = useMemo(() => {
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);
    const brandSales = new Map<string, number>();
    const sizeSales = new Map<string, number>();
    let grossRevenue = 0;
    let discounts = 0;

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        const product = productLookup.get(String(detail.product_id ?? '')) ?? detail.product;
        const qty = Number(detail.quantity ?? 0);
        const brand = String(product?.brand ?? 'N/A');
        const size = String(product?.size ?? 'N/A');
        const gross = Number(detail.price ?? 0) * qty;
        const subtotal = Number(detail.subtotal ?? gross);
        brandSales.set(brand, (brandSales.get(brand) ?? 0) + qty);
        sizeSales.set(size, (sizeSales.get(size) ?? 0) + qty);
        grossRevenue += gross;
        discounts += Math.max(0, gross - subtotal);
      });
    });

    const bestBrand = Array.from(brandSales.entries()).sort((a, b) => b[1] - a[1])[0];
    const bestSize = Array.from(sizeSales.entries()).sort((a, b) => b[1] - a[1])[0];
    const atv = currentMetrics.current.transactions
      ? currentMetrics.current.revenue / currentMetrics.current.transactions
      : 0;
    const discountRate = grossRevenue > 0 ? (discounts / grossRevenue) * 100 : 0;

    return {
      period: formatDateRange(start, now),
      store: 'Libertad St., Bacolod City Branch',
      preparedBy: 'Store Manager',
      atv,
      bestBrandName: bestBrand?.[0] ?? 'N/A',
      bestBrandUnits: bestBrand?.[1] ?? 0,
      bestBrand: bestBrand ? `${bestBrand[0]} (${bestBrand[1]} pairs)` : 'N/A',
      bestSize: bestSize ? `${bestSize[0]} (${bestSize[1]} pairs)` : 'N/A',
      grossRevenue,
      discounts,
      discountRate,
      netSales: Math.max(0, grossRevenue - discounts),
    };
  }, [currentMetrics, customEndDate, customStartDate, productLookup, salesRows, timeRange]);

  const summarizeSkuTurnover = (unitsBySku: Map<string, number>, periodDays: number) => {
    let units = 0;
    let avgInventory = 0;
    unitsBySku.forEach((soldUnits, sku) => {
      const endingStock = stockBySku.get(sku) ?? 0;
      const beginningStock = endingStock + soldUnits;
      units += soldUnits;
      avgInventory += (beginningStock + endingStock) / 2;
    });
    const turnover = avgInventory > 0 ? Number((units / avgInventory).toFixed(2)) : 0;
    const avgDays = turnover > 0 ? Math.max(1, Math.round(periodDays / turnover)) : 0;
    return { units, avgInventory, turnover, avgDays };
  };

  const inventoryTurnover = useMemo(() => {
    const { now, start, days } = rangeWindow(timeRange, customStartDate, customEndDate);
    const bucketCount = timeRange === 'daily' ? 1 : timeRange === 'weekly' ? 7 : timeRange === 'monthly' ? 6 : timeRange === 'quarterly' ? 13 : 12;
    const bucketDays = Math.max(1, Math.ceil(days / bucketCount));
    const buckets: Array<{ start: Date; end: Date; unitsBySku: Map<string, number> }> = [];

    if (timeRange === 'annually') {
      const cursor = new Date(start);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= now) {
        const bucketStart = new Date(cursor);
        if (bucketStart < start) bucketStart.setTime(start.getTime());
        const bucketEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
        buckets.push({
          start: bucketStart,
          end: bucketEnd > now ? now : bucketEnd,
          unitsBySku: new Map<string, number>(),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      Array.from({ length: bucketCount }, (_, index) => {
        const bucketStart = new Date(start);
        bucketStart.setDate(start.getDate() + (index * bucketDays));
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketStart.getDate() + bucketDays - 1);
        bucketEnd.setHours(23, 59, 59, 999);
        if (bucketStart <= now) {
          buckets.push({
            start: bucketStart,
            end: bucketEnd > now ? now : bucketEnd,
            unitsBySku: new Map<string, number>(),
          });
        }
        return null;
      });
    }

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const bucket = buckets.find((item) => date >= item.start && date <= item.end);
      if (!bucket) return;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        const sku = String(detail.product_id ?? '');
        bucket.unitsBySku.set(sku, (bucket.unitsBySku.get(sku) ?? 0) + Number(detail.quantity ?? 0));
      });
    });

    return buckets.map((bucket, index) => {
      const bucketSpanDays = Math.max(1, Math.ceil((bucket.end.getTime() - bucket.start.getTime()) / 86400000) + 1);
      const { units, turnover, avgDays } = summarizeSkuTurnover(bucket.unitsBySku, bucketSpanDays);
      const label = timeRange === 'annually'
        ? bucket.start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        : timeRange === 'quarterly'
        ? `W${index + 1}`
        : bucket.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        id: `it${index}`,
        month: label,
        units,
        turnover,
        avgDays,
      };
    });
  }, [customEndDate, customStartDate, salesRows, stockBySku, timeRange]);

  const promotionEffectiveness = useMemo(() => {
    const totalUnits = Math.max(currentMetrics.current.units, 1);
    return promotionRows.map((promo: any, index) => {
      const promoProducts = Array.isArray(promo.promo_product) ? promo.promo_product : [];
      const productIds = new Set(promoProducts.map((row: any) => String(row.product_id ?? row.product?.product_id ?? '')));
      const start = new Date(promo.start_date ?? '');
      const end = new Date(promo.end_date ?? '');
      let revenue = 0;
      let units = 0;
      salesRows.forEach((sale) => {
        const date = saleDate(sale);
        if (!date || (!Number.isNaN(start.getTime()) && date < start) || (!Number.isNaN(end.getTime()) && date > end)) return;
        const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
        details.forEach((detail: any) => {
          const productId = String(detail.product_id ?? '');
          if (productIds.size && !productIds.has(productId)) return;
          revenue += Number(detail.subtotal ?? 0);
          units += Number(detail.quantity ?? 0);
        });
      });
      return {
        id: String(promo.promo_id ?? `pe${index}`),
        promotion: String(promo.promo_name ?? 'Promotion'),
        revenue,
        roi: Math.min(100, Math.round((units / totalUnits) * 100)),
        conversion: Number(((units / totalUnits) * 100).toFixed(1)),
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [currentMetrics.current.units, promotionRows, salesRows]);

  const handleExportReport = () => {
    const reportNames: Record<string, string> = {
      overview: 'Executive Overview Report',
      sales: 'Sales Report',
      revenue: 'Revenue Report',
      inventory: 'Inventory Report',
      promotions: 'Promotions Report',
    };
    const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const sanitize = (value: unknown) => String(value ?? '')
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const pdfEscape = (value: unknown) => sanitize(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const pages: string[][] = [[]];
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 40;
    let y = pageHeight - margin;
    const current = () => pages[pages.length - 1];
    const add = (command: string) => current().push(command);
    const ensureSpace = (height: number) => {
      if (y - height >= margin) return;
      pages.push([]);
      y = pageHeight - margin;
      drawHeader(false);
    };
    const text = (value: unknown, x: number, textY: number, size = 10, bold = false, color = '0 0 0') => {
      add(`q ${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${textY} Td (${pdfEscape(value)}) Tj ET Q`);
    };
    const rect = (x: number, rectY: number, width: number, height: number, fill = '1 1 1', stroke = '0.85 0.85 0.85') => {
      add(`q ${fill} rg ${stroke} RG ${x} ${rectY} ${width} ${height} re B Q`);
    };
    const line = (x1: number, y1: number, x2: number, y2: number, color = '0.96 0.78 0.08') => {
      add(`q ${color} RG 2 w ${x1} ${y1} m ${x2} ${y2} l S Q`);
    };
    const truncate = (value: unknown, max: number) => {
      const clean = sanitize(value);
      return clean.length > max ? `${clean.slice(0, Math.max(0, max - 3))}...` : clean;
    };
    const maxCharsForWidth = (width: number, size = 10) => Math.max(4, Math.floor(width / (size * 0.56)));
    const wrapText = (value: unknown, maxChars: number, maxLines = 2) => {
      const clean = sanitize(value);
      if (!clean) return [''];
      const words = clean.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      words.forEach((word) => {
        const nextLine = currentLine ? `${currentLine} ${word}` : word;
        if (nextLine.length <= maxChars) {
          currentLine = nextLine;
          return;
        }
        if (currentLine) lines.push(currentLine);
        currentLine = word.length > maxChars ? truncate(word, maxChars) : word;
      });
      if (currentLine) lines.push(currentLine);

      if (lines.length <= maxLines) return lines;
      const visible = lines.slice(0, maxLines);
      visible[maxLines - 1] = truncate(visible[maxLines - 1], maxChars);
      return visible;
    };
    const drawHeader = (full = true) => {
      if (full) {
        text('MERYL SHOES', margin, y, 10, true, '0.55 0.42 0');
        y -= 22;
        text(reportNames[reportType] ?? 'Meryl Shoes Report', margin, y, 24, true);
        y -= 16;
        text('Libertad St., Bacolod City Branch', margin, y, 10, false, '0.25 0.25 0.25');
        y -= 18;
      } else {
        text(reportNames[reportType] ?? 'Meryl Shoes Report', margin, y, 10, true, '0.35 0.35 0.35');
        y -= 18;
      }
      line(margin, y, pageWidth - margin, y);
      y -= 18;
    };
    const drawMetric = (label: string, value: string, x: number, metricY: number, width: number) => {
      rect(x, metricY - 52, width, 52, '0.98 0.98 0.98');
      text(truncate(label.toUpperCase(), maxCharsForWidth(width - 16, 7)), x + 8, metricY - 18, 7, true, '0.45 0.45 0.45');
      const lines = wrapText(value, maxCharsForWidth(width - 16, 12), 2);
      const valueSize = lines.length > 1 ? 10 : 13;
      lines.forEach((lineValue, index) => {
        text(lineValue, x + 8, metricY - 35 - (index * 12), valueSize, true);
      });
    };
    const drawMetricGrid = (items: Array<[string, string]>) => {
      ensureSpace(70);
      const gap = 8;
      const width = (pageWidth - margin * 2 - gap * 3) / 4;
      const top = y;
      items.slice(0, 4).forEach(([label, value], index) => {
        drawMetric(label, value, margin + index * (width + gap), top, width);
      });
      y -= 68;
    };
    const drawTitle = (title: string) => {
      ensureSpace(30);
      text(title, margin, y, 14, true);
      y -= 14;
    };
    const drawTable = (headers: string[], rows: Array<Array<unknown>>, widths?: number[]) => {
      const tableWidth = pageWidth - margin * 2;
      const columnWidths = widths ?? headers.map(() => tableWidth / headers.length);
      const rowHeight = 23;
      ensureSpace(rowHeight * 2);
      rect(margin, y - rowHeight, tableWidth, rowHeight, '0.12 0.12 0.15', '0.12 0.12 0.15');
      let x = margin;
      headers.forEach((header, index) => {
        text(truncate(header, maxCharsForWidth((columnWidths[index] ?? 60) - 10, 8)), x + 5, y - 15, 8, true, '1 1 1');
        x += columnWidths[index];
      });
      y -= rowHeight;
      const bodyRows = rows.length ? rows : [['No records found for this date range.']];
      bodyRows.forEach((row) => {
        ensureSpace(rowHeight + 4);
        rect(margin, y - rowHeight, tableWidth, rowHeight, '1 1 1');
        let cellX = margin;
        if (row.length === 1) {
          text(row[0], cellX + 5, y - 15, 8, false, '0.4 0.4 0.4');
        } else {
          row.forEach((cell, index) => {
            text(truncate(cell, maxCharsForWidth((columnWidths[index] ?? 60) - 10, 8)), cellX + 5, y - 15, 8);
            cellX += columnWidths[index] ?? 60;
          });
        }
        y -= rowHeight;
      });
      y -= 16;
    };

    drawHeader();
    drawMetricGrid([
      ['Date Range', selectedRangeLabel],
      ['Revenue', money(currentMetrics.current.revenue)],
      ['Units Sold', currentMetrics.current.units.toLocaleString()],
      ['Generated', generatedAt],
    ]);
    drawMetricGrid([
      ['Inventory Turnover', `${latestTurnover.toFixed(2)}x`],
      ['Avg Days to Sell', String(latestAvgDays || 0)],
      ['Transactions', currentMetrics.current.transactions.toLocaleString()],
      ['Report Type', reportNames[reportType] ?? 'Report'],
    ]);

    if (reportType === 'overview') {
      drawTitle('Executive Snapshot');
      drawTable(['Summary Item', 'Value'], [
        ['Average Transaction Value', money(businessSummary.atv)],
        ['Discount Pressure', `${businessSummary.discountRate.toFixed(1)}% (${money(businessSummary.discounts)})`],
        ['Best Brand', `${businessSummary.bestBrandName} (${businessSummary.bestBrandUnits} pairs)`],
        ['Top Product', topProducts[0] ? `${topProducts[0].name} (${topProducts[0].sales} units)` : 'N/A'],
        ['Gross Sales Before Discounts', money(businessSummary.grossRevenue)],
        ['Net After Discounts', money(businessSummary.netSales)],
      ], [250, 265]);
      drawTitle('Sales Trend');
      drawTable(['Period', 'Units Sold', 'Revenue', 'Customers'], filteredSalesTrends.map((row) => [row.date, row.sales, money(row.revenue), row.customers]));
    } else if (reportType === 'sales') {
      drawTitle('Sales Breakdown');
      drawTable(['Period', 'Pairs Sold', 'Gross Revenue', 'Discount Applied', 'Net Sales'], salesBreakdownRows.map((row) => [row.date, row.pairs, money(row.gross), money(row.discount), money(row.net)]));
      drawTitle('Top Products');
      drawTable(['Product', 'Units', 'Revenue'], topProducts.map((row) => [row.name, row.sales, money(row.revenue)]), [260, 80, 175]);
    } else if (reportType === 'revenue') {
      drawTitle('Revenue by Category');
      drawTable(['Category', 'Revenue', 'Share', 'Growth'], revenueByCategory.map((row) => [row.category, money(row.revenue), `${row.percentage}%`, `${row.growth}%`]));
    } else if (reportType === 'inventory') {
      drawTitle('Inventory Turnover');
      drawTable(['Period', 'Units Sold', 'Turnover', 'Avg Days'], inventoryTurnover.map((row) => [row.month, row.units, `${row.turnover.toFixed(2)}x`, row.avgDays || 0]));
      drawTitle('Inventory and Stock Status');
      drawTable(['Item ID', 'Brand and Model', 'Size', 'Color', 'Stock', 'Reorder', 'Status'], inventoryStatusRows.map((row) => [row.itemId, row.name, row.size, row.color, row.stock, row.reorder, row.status]));
    } else if (reportType === 'promotions') {
      drawTitle('Promotion Performance');
      drawTable(['Promotion', 'Revenue', 'ROI', 'Conversion'], promotionEffectiveness.map((row) => [row.promotion, money(row.revenue), `${row.roi}%`, `${row.conversion}%`]));
    }

    pages.forEach((page, index) => {
      page.push(`BT /F1 8 Tf ${margin} 24 Td (Prepared by Store Manager) Tj ET`);
      page.push(`BT /F1 8 Tf ${pageWidth - margin - 68} 24 Td (Page ${index + 1} of ${pages.length}) Tj ET`);
    });

    const objects: string[] = [
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];
    const pageObjectNumbers: number[] = [];
    pages.forEach((page) => {
      const stream = page.join('\n');
      const contentObject = objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageObject = objects.push(`<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents ${contentObject} 0 R >>`);
      pageObjectNumbers.push(pageObject);
    });
    const pagesObject = objects.push(`<< /Type /Pages /Kids [${pageObjectNumbers.map((num) => `${num} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>`);
    const catalogObject = objects.push(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);
    const resolvedObjects = objects.map((object) => object.replace(/PAGES_REF/g, `${pagesObject} 0 R`));
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    resolvedObjects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${resolvedObjects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${resolvedObjects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const filename = `${(reportNames[reportType] ?? 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${timeRange}.pdf`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('PDF report downloaded.');
  };

  const inventoryPeriodMetrics = useMemo(() => {
    const { now, start, previousStart, days } = rangeWindow(timeRange, customStartDate, customEndDate);
    const compareEnd = new Date(start.getTime() - 1);
    const collectUnitsBySku = (from: Date, to: Date) => {
      const unitsBySku = new Map<string, number>();
      salesRows.forEach((sale) => {
        const date = saleDate(sale);
        if (!date || date < from || date > to) return;
        const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
        details.forEach((detail: any) => {
          const sku = String(detail.product_id ?? '');
          unitsBySku.set(sku, (unitsBySku.get(sku) ?? 0) + Number(detail.quantity ?? 0));
        });
      });
      return unitsBySku;
    };

    return {
      current: summarizeSkuTurnover(collectUnitsBySku(start, now), days),
      previous: summarizeSkuTurnover(collectUnitsBySku(previousStart, compareEnd), days),
    };
  }, [customEndDate, customStartDate, salesRows, stockBySku, timeRange]);

  const revenueChange = percentChange(currentMetrics.current.revenue, currentMetrics.previous.revenue);
  const unitsChange = percentChange(currentMetrics.current.units, currentMetrics.previous.units);
  const selectedWindow = rangeWindow(timeRange, customStartDate, customEndDate);
  const latestTurnover = inventoryPeriodMetrics.current.turnover;
  const previousTurnover = inventoryPeriodMetrics.previous.turnover;
  const latestAvgDays = inventoryPeriodMetrics.current.avgDays;
  const previousAvgDays = inventoryPeriodMetrics.previous.avgDays;
  const turnoverChange = percentChange(latestTurnover, previousTurnover);
  const avgDaysChange = previousAvgDays ? previousAvgDays - latestAvgDays : 0;
  const selectedRangeLabel = formatDateRange(selectedWindow.start, selectedWindow.now);

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-yellow-200/70">Date Range</span>
            <Select value={timeRange} onValueChange={(value) => setTimeRange(value as ReportPeriod)}>
              <SelectTrigger className="w-44 bg-[#0b0b0f] border-[#24242d] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0b0b0f] border-[#24242d] text-white">
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-yellow-200/70">Report Type</span>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="w-48 bg-[#0b0b0f] border-[#24242d] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0b0b0f] border-[#24242d] text-white">
                <SelectItem value="overview">Overview Report</SelectItem>
                <SelectItem value="sales">Sales Report</SelectItem>
                <SelectItem value="revenue">Revenue Report</SelectItem>
                <SelectItem value="inventory">Inventory Report</SelectItem>
                <SelectItem value="promotions">Promotions Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex h-9 items-center gap-2 rounded-md border border-[#24242d] bg-[#0b0b0f] px-3 text-sm text-white">
            <input
              type="checkbox"
              checked={showComparison}
              onChange={(e) => setShowComparison(e.target.checked)}
              className="accent-yellow-400"
            />
            Compare
          </label>
          <Button
            onClick={handleExportReport}
            className="h-9 bg-yellow-400 text-black hover:bg-yellow-500"
          >
          <Download className="w-4 h-4 mr-2" />
          Export PDF
          </Button>
        </div>
      </div>
      <div className="rounded-md border border-[#24242d] bg-[#07070a] px-4 py-2 text-sm text-yellow-200">
        Showing {selectedRangeLabel}
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-[#0b0b0f] border-[#24242d]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">Total Revenue</p>
                <p className="text-2xl text-white">{money(currentMetrics.current.revenue)}</p>
                {showComparison && <p className={`text-xs mt-1 ${revenueChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {revenueChange >= 0 ? '+' : ''}{revenueChange.toFixed(1)}% vs last period
                </p>}
              </div>
              <Coins className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0b0b0f] border-[#24242d]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">Units Sold</p>
                <p className="text-2xl text-white">{currentMetrics.current.units.toLocaleString()}</p>
                {showComparison && <p className={`text-xs mt-1 ${unitsChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {unitsChange >= 0 ? '+' : ''}{unitsChange.toFixed(1)}% vs last period
                </p>}
              </div>
              <Package className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0b0b0f] border-[#24242d]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">Inventory Turnover</p>
                <p className="text-2xl text-white">{latestTurnover.toFixed(2)}x</p>
                {showComparison && <p className={`text-xs mt-1 ${turnoverChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {turnoverChange >= 0 ? '+' : ''}{turnoverChange.toFixed(1)}% vs last month
                </p>}
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#0b0b0f] border-[#24242d]">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">Avg Days to Sell</p>
                <p className="text-2xl text-white">{latestAvgDays || 0}</p>
                {showComparison && <p className={`text-xs mt-1 ${avgDaysChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {avgDaysChange >= 0 ? `${avgDaysChange} days faster` : `${Math.abs(avgDaysChange)} days slower`}
                </p>}
              </div>
              <Calendar className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected Report Section */}
      {reportType === 'overview' && (
        <div className="space-y-4">
          <Card className="bg-[#0b0b0f] border-[#24242d] overflow-hidden">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-yellow-300 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Executive Snapshot
                  </CardTitle>
                  <p className="mt-2 text-sm text-white/55">
                    {businessSummary.period} - {businessSummary.store}
                  </p>
                </div>
                <Badge className="bg-yellow-400 text-black">
                  Prepared by {businessSummary.preparedBy}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-lg border border-[#24242d] bg-[#07070a] p-5">
                  <p className="text-xs uppercase tracking-wide text-yellow-200/70">Average Transaction Value</p>
                  <p className="mt-2 text-3xl text-white">{money(businessSummary.atv)}</p>
                  <p className="mt-2 text-xs text-white/55">
                    {currentMetrics.current.transactions.toLocaleString()} completed transactions
                  </p>
                </div>
                <div className="rounded-lg border border-[#24242d] bg-[#07070a] p-5">
                  <p className="text-xs uppercase tracking-wide text-yellow-200/70">Discount Pressure</p>
                  <p className="mt-2 text-3xl text-white">{businessSummary.discountRate.toFixed(1)}%</p>
                  <p className="mt-2 text-xs text-white/55">
                    {money(businessSummary.discounts)} discount impact
                  </p>
                </div>
                <div className="rounded-lg border border-[#24242d] bg-[#07070a] p-5">
                  <p className="text-xs uppercase tracking-wide text-yellow-200/70">Best Brand</p>
                  <p className="mt-2 text-3xl text-white">{businessSummary.bestBrandName}</p>
                  <p className="mt-2 text-xs text-white/55">
                    {businessSummary.bestBrandUnits} pairs sold
                  </p>
                </div>
                <div className="rounded-lg border border-[#24242d] bg-[#07070a] p-5">
                  <p className="text-xs uppercase tracking-wide text-yellow-200/70">Top Product</p>
                  <p className="mt-2 text-3xl text-white">{topProducts[0]?.name ?? 'N/A'}</p>
                  <p className="mt-2 text-xs text-white/55">
                    {topProducts[0] ? `${topProducts[0].sales} units sold` : 'No product sales yet'}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 rounded-lg border border-[#24242d] bg-[#07070a] p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-yellow-200/60">Gross Sales Before Discounts</p>
                  <p className="mt-1 text-white">{money(businessSummary.grossRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-yellow-200/60">Best Size</p>
                  <p className="mt-1 text-white">{businessSummary.bestSize}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-yellow-200/60">Net After Discounts</p>
                  <p className="mt-1 text-white">{money(businessSummary.netSales)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-yellow-300 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Sales Performance Over Time
                  </CardTitle>
                  <p className="mt-1 text-sm text-white/55">
                    Revenue trend with units sold on the right axis
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/65">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-6 rounded-full bg-amber-100" />
                    Units Sold
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-6 rounded-full bg-yellow-400" />
                    Revenue
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="rounded-b-lg bg-[#07070a] pt-2">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={filteredSalesTrends} margin={{ top: 20, right: 18, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="4 8" stroke="#24242d" vertical={false} opacity={0.75} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#d1d5db', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis
                    yAxisId="units"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#e5e7eb', fontSize: 12 }}
                    allowDecimals={false}
                    label={{ value: 'Units Sold', angle: -90, position: 'insideLeft', fill: '#e5e7eb', fontSize: 12 }}
                    width={48}
                  />
                  <YAxis
                    yAxisId="revenue"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#facc15', fontSize: 12 }}
                    tickFormatter={(value) => money(Number(value)).replace('PHP ', '')}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ stroke: '#facc15', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.35 }}
                    contentStyle={{
                      backgroundColor: '#111118',
                      border: '1px solid #24242d',
                      borderRadius: '12px',
                      boxShadow: '0 18px 45px rgba(0,0,0,0.35)',
                      color: '#fef08a',
                    }}
                    labelStyle={{ color: '#fef3c7', marginBottom: 8 }}
                    formatter={(value, name) => (String(name).includes('Revenue') || String(name).includes('Period') ? [money(Number(value)), name] : [Number(value).toLocaleString(), name])}
                  />
                  <Line
                    yAxisId="units"
                    type="monotone"
                    dataKey="sales"
                    stroke="#fef3c7"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#1f1b24', stroke: '#fef3c7', strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: '#fef3c7', stroke: '#1f1b24', strokeWidth: 3 }}
                    name="Units Sold"
                  />
                  <Line
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#facc15"
                    strokeWidth={4}
                    dot={{ r: 4, fill: '#1f1b24', stroke: '#facc15', strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: '#facc15', stroke: '#1f1b24', strokeWidth: 3 }}
                    name="Revenue (PHP)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {reportType === 'sales' && (
        <div className="space-y-4">
          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Sales Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table className="overflow-hidden rounded-lg border border-[#24242d] bg-[#07070a]">
                <TableHeader className="bg-[#0b0b0f]">
                  <TableRow className="border-[#24242d] hover:bg-[#0b0b0f]">
                    <TableHead className="text-yellow-300">Period</TableHead>
                    <TableHead className="text-yellow-300 text-center">Pairs Sold</TableHead>
                    <TableHead className="text-yellow-300 text-center">Gross Revenue</TableHead>
                    <TableHead className="text-yellow-300 text-center">Discount Applied</TableHead>
                    <TableHead className="text-yellow-300 text-center">Net Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesBreakdownRows.map((row) => (
                    <TableRow key={row.id} className="border-[#24242d] bg-[#07070a] hover:bg-white/[0.03]">
                      <TableCell className="text-yellow-200">{row.date}</TableCell>
                      <TableCell className="text-yellow-200 text-center">{row.pairs}</TableCell>
                      <TableCell className="text-yellow-200 text-center">{money(row.gross)}</TableCell>
                      <TableCell className="text-yellow-200 text-center">{money(row.discount)}</TableCell>
                      <TableCell className="text-yellow-300 text-center">{money(row.net)}</TableCell>
                    </TableRow>
                  ))}
                  {!salesBreakdownRows.length && (
                    <TableRow className="border-[#24242d] bg-[#07070a]">
                      <TableCell colSpan={5} className="text-center text-yellow-200 py-6">No completed sales found for this date range.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardHeader><CardTitle className="text-yellow-300">Top Products</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topProducts.map((product) => (
                  <div key={product.id} className="flex justify-between items-center border-b border-[#24242d] pb-2">
                    <div><p className="text-yellow-200">{product.name}</p><p className="text-yellow-300 text-xs">{product.sales} units sold</p></div>
                    <p className="text-yellow-300">{money(product.revenue)}</p>
                  </div>
                ))}
                {!topProducts.length && <p className="text-yellow-200 text-sm">No product sales yet.</p>}
              </CardContent>
            </Card>
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardHeader><CardTitle className="text-yellow-300">Top Brands</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topBrands.map((brand) => (
                  <div key={brand.name} className="flex justify-between items-center border-b border-[#24242d] pb-2">
                    <div><p className="text-yellow-200">{brand.name}</p><p className="text-yellow-300 text-xs">{brand.sales} pairs</p></div>
                    <p className="text-yellow-300">{money(brand.revenue)}</p>
                  </div>
                ))}
                {!topBrands.length && <p className="text-yellow-200 text-sm">No brand sales yet.</p>}
              </CardContent>
            </Card>
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardHeader><CardTitle className="text-yellow-300">Top Sizes</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topSizes.map((size) => (
                  <div key={size.name} className="flex justify-between items-center border-b border-[#24242d] pb-2">
                    <div><p className="text-yellow-200">Size {size.name}</p><p className="text-yellow-300 text-xs">{size.sales} pairs</p></div>
                    <p className="text-yellow-300">{money(size.revenue)}</p>
                  </div>
                ))}
                {!topSizes.length && <p className="text-yellow-200 text-sm">No size sales yet.</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {reportType === 'revenue' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardHeader><CardTitle className="text-yellow-300">Revenue by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#24242d" />
                    <XAxis dataKey="category" stroke="#fef08a" />
                    <YAxis stroke="#fef08a" tickFormatter={(value) => Math.round(Number(value)).toLocaleString()} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111118', border: '1px solid #24242d', color: '#fef08a' }}
                      labelStyle={{ color: '#fef3c7', fontWeight: 700 }}
                      itemStyle={{ color: '#fef08a' }}
                      formatter={(value, name) => [moneyWhole(Number(value)), name]}
                    />
                    <Legend wrapperStyle={{ color: '#fef08a' }} />
                    <Bar dataKey="revenue" fill="#fef08a" name="Revenue (PHP)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardHeader><CardTitle className="text-yellow-300">Category Distribution</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={categoryDistribution} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name} ${value}%`} outerRadius={100} dataKey="value">
                      {categoryDistribution.map((entry) => <Cell key={entry.id} fill={entry.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111118', border: '1px solid #24242d', color: '#fef08a' }}
                      labelStyle={{ color: '#fef3c7', fontWeight: 700 }}
                      itemStyle={{ color: '#fef08a' }}
                      formatter={(value, name) => [`${Math.round(Number(value))}%`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader><CardTitle className="text-yellow-300">Category Performance Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {revenueByCategory.map((category) => (
                <div key={category.id} className="border-b border-[#24242d] pb-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-yellow-200">{category.category}</p>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-yellow-400 text-black">{category.percentage}% of total</Badge>
                      <Badge className={category.growth > 0 ? 'bg-green-600 text-white' : 'bg-red-900 text-yellow-200'}>{category.growth > 0 ? '+' : ''}{category.growth.toFixed(1)}%</Badge>
                    </div>
                  </div>
                  <p className="text-yellow-300 text-lg">{money(category.revenue)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {reportType === 'inventory' && (
        <div className="space-y-4">
          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader><CardTitle className="text-yellow-300 flex items-center gap-2"><Package className="w-5 h-5" />Inventory Turnover Rate</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={inventoryTurnover}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#24242d" />
                  <XAxis dataKey="month" stroke="#fef08a" />
                  <YAxis yAxisId="left" stroke="#fef08a" />
                  <YAxis yAxisId="right" orientation="right" stroke="#facc15" />
                  <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #24242d', color: '#fef08a' }} />
                  <Legend wrapperStyle={{ color: '#fef08a' }} />
                  <Line yAxisId="left" type="monotone" dataKey="turnover" stroke="#fef08a" strokeWidth={2} name="Turnover Rate" />
                  <Line yAxisId="right" type="monotone" dataKey="avgDays" stroke="#facc15" strokeWidth={2} name="Avg Days to Sell" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader><CardTitle className="text-yellow-300">Inventory & Stock Status</CardTitle></CardHeader>
            <CardContent>
              <Table className="overflow-hidden rounded-lg border border-[#24242d] bg-[#07070a]">
                <TableHeader className="bg-[#0b0b0f]">
                  <TableRow className="border-[#24242d] hover:bg-[#0b0b0f]">
                    <TableHead className="text-yellow-300">Item ID</TableHead><TableHead className="text-yellow-300">Brand & Model</TableHead><TableHead className="text-yellow-300 text-center">Size</TableHead><TableHead className="text-yellow-300 text-center">Color</TableHead><TableHead className="text-yellow-300 text-center">In Stock</TableHead><TableHead className="text-yellow-300 text-center">Reorder</TableHead><TableHead className="text-yellow-300 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryStatusRows.map((row) => (
                    <TableRow key={row.id} className="border-[#24242d] bg-[#07070a] hover:bg-white/[0.03]">
                      <TableCell className="text-yellow-200">{row.itemId}</TableCell><TableCell className="text-yellow-200">{row.name}</TableCell><TableCell className="text-yellow-200 text-center">{row.size}</TableCell><TableCell className="text-yellow-200 text-center">{row.color}</TableCell><TableCell className="text-yellow-200 text-center">{row.stock}</TableCell><TableCell className="text-yellow-200 text-center">{row.reorder}</TableCell>
                      <TableCell className="text-center"><Badge className={row.status === 'Critical' ? 'bg-red-900 text-red-200' : row.status === 'Reorder Required' ? 'bg-yellow-400 text-black' : row.status === 'Overstock' ? 'bg-blue-600 text-white' : 'bg-green-700 text-white'}>{row.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {reportType === 'promotions' && (
        <div className="space-y-4">
          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader><CardTitle className="text-yellow-300">Promotion Effectiveness Analysis</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={promotionEffectiveness}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#24242d" />
                  <XAxis dataKey="promotion" stroke="#fef08a" />
                  <YAxis stroke="#fef08a" />
                  <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #24242d', color: '#fef08a' }} />
                  <Legend wrapperStyle={{ color: '#fef08a' }} />
                  <Bar dataKey="revenue" fill="#fef08a" name="Revenue (PHP)" />
                  <Bar dataKey="roi" fill="#facc15" name="ROI (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader><CardTitle className="text-yellow-300">Promotion Performance Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {promotionEffectiveness.map((promo) => (
                <div key={promo.id} className="flex justify-between items-center border-b border-[#24242d] pb-3">
                  <div><p className="text-yellow-200">{promo.promotion}</p><p className="text-yellow-300 text-xs">Conversion: {promo.conversion}%</p></div>
                  <div className="flex gap-3"><Badge className="bg-yellow-400 text-black">{money(promo.revenue)}</Badge><Badge className="bg-green-600 text-white">{promo.roi}% ROI</Badge></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
