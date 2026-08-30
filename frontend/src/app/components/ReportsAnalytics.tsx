import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { BarChart3, TrendingUp, Coins, Package, Calendar, Download, FileText, Trophy, Medal, Sparkles, Layers, Tag, UserCheck, CreditCard, Grid } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { useProducts, useSales } from '../../lib/hooks';

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
  const [topDimensionTab, setTopDimensionTab] = useState<'products' | 'brand' | 'size' | 'variant' | 'category' | 'gender' | 'payment' | 'grid'>('products');
  const [topSortBy, setTopSortBy] = useState<'units' | 'revenue'>('units');
  const salesQuery = useSales();
  const productsQuery = useProducts();

  const salesRows = ((salesQuery.data as any[]) ?? []).filter(isCompletedSale);
  const productRows = (productsQuery.data as any[]) ?? [];

  const productLookup = useMemo(() => {
    const map = new Map<string, any>();
    productRows.forEach((product: any) => map.set(String(product.product_id ?? ''), product));
    return map;
  }, [productRows]);

  const stockBySku = useMemo(() => {
    const map = new Map<string, number>();
    productRows.forEach((product: any) => {
      const inventory = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
      const onHand = Number(inventory?.stock_quantity ?? product.stock ?? 0);
      const reserved = Number(inventory?.reserved_quantity ?? inventory?.held_stock ?? product.reserved_stock ?? 0);
      map.set(String(product.product_id ?? ''), Math.max(0, onHand - reserved));
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

  const topRankings = useMemo(() => {
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);

    const byProduct = new Map<string, { key: string; name: string; subtitle?: string; sales: number; revenue: number; margin: number }>();
    const byBrand = new Map<string, { key: string; name: string; subtitle?: string; sales: number; revenue: number }>();
    const bySize = new Map<string, { key: string; name: string; subtitle?: string; sales: number; revenue: number }>();
    const byVariant = new Map<string, { key: string; name: string; subtitle?: string; sales: number; revenue: number }>();
    const byCategory = new Map<string, { key: string; name: string; subtitle?: string; sales: number; revenue: number }>();
    const byGender = new Map<string, { key: string; name: string; subtitle?: string; sales: number; revenue: number }>();
    const byPayment = new Map<string, { key: string; name: string; subtitle?: string; sales: number; revenue: number }>();

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;

      // Payment method
      const payment = Array.isArray(sale.payment) ? sale.payment[0] : sale.payment;
      const rawPayMethod = String(payment?.payment_method ?? sale.payment_method ?? 'Cash').toLowerCase();
      const payMethodLabel = rawPayMethod.includes('gcash') ? 'GCash' : 'Cash';
      const saleRevenue = Number(sale.total_amount ?? 0);
      const prevPay = byPayment.get(payMethodLabel) ?? { key: payMethodLabel, name: payMethodLabel, subtitle: 'Payment Method', sales: 0, revenue: 0 };
      prevPay.sales += 1;
      prevPay.revenue += saleRevenue;
      byPayment.set(payMethodLabel, prevPay);

      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        const product = productLookup.get(String(detail.product_id ?? '')) ?? detail.product;
        const qty = Number(detail.quantity ?? 0);
        const revenue = Number(detail.subtotal ?? (Number(detail.price ?? 0) * qty));
        const cost = Number(product?.cost_price ?? 0) * qty;

        // 1. Shoe Model / Product
        const productName = String(product?.product_name ?? detail.product?.product_name ?? 'Unknown Shoe').trim();
        const brandName = String(product?.brand ?? 'Meryl Shoes').trim();
        const categoryName = String(product?.category?.[0]?.category_name ?? product?.category?.category_name ?? 'Footwear').trim();
        const prevProd = byProduct.get(productName) ?? {
          key: productName,
          name: productName,
          subtitle: `${brandName} • ${categoryName}`,
          sales: 0,
          revenue: 0,
          margin: 0,
        };
        prevProd.sales += qty;
        prevProd.revenue += revenue;
        prevProd.margin = prevProd.revenue > 0 ? Math.max(0, Math.round(((prevProd.revenue - cost) / prevProd.revenue) * 100)) : 0;
        byProduct.set(productName, prevProd);

        // 2. Brand
        const prevBrand = byBrand.get(brandName) ?? { key: brandName, name: brandName, subtitle: 'Shoe Brand', sales: 0, revenue: 0 };
        prevBrand.sales += qty;
        prevBrand.revenue += revenue;
        byBrand.set(brandName, prevBrand);

        // 3. Size
        const rawSize = String(product?.size ?? '').trim();
        const sizeLabel = rawSize ? `Size ${rawSize}` : 'Standard';
        const prevSize = bySize.get(sizeLabel) ?? { key: sizeLabel, name: sizeLabel, subtitle: 'Shoe Size', sales: 0, revenue: 0 };
        prevSize.sales += qty;
        prevSize.revenue += revenue;
        bySize.set(sizeLabel, prevSize);

        // 4. Variant / Colorway
        const rawColor = String(product?.color ?? '').trim();
        const variantLabel = rawColor || 'Standard Color';
        const prevVariant = byVariant.get(variantLabel) ?? { key: variantLabel, name: variantLabel, subtitle: 'Color / Style', sales: 0, revenue: 0 };
        prevVariant.sales += qty;
        prevVariant.revenue += revenue;
        byVariant.set(variantLabel, prevVariant);

        // 5. Category
        const prevCat = byCategory.get(categoryName) ?? { key: categoryName, name: categoryName, subtitle: 'Category', sales: 0, revenue: 0 };
        prevCat.sales += qty;
        prevCat.revenue += revenue;
        byCategory.set(categoryName, prevCat);

        // 6. Gender
        const rawGender = String(product?.gender ?? '').trim();
        const genderLabel = !rawGender || rawGender.toLowerCase() === 'n/a' ? 'Unisex' : rawGender;
        const prevGender = byGender.get(genderLabel) ?? { key: genderLabel, name: genderLabel, subtitle: 'Department', sales: 0, revenue: 0 };
        prevGender.sales += qty;
        prevGender.revenue += revenue;
        byGender.set(genderLabel, prevGender);
      });
    });

    const rank = (map: Map<string, any>) => {
      const all = Array.from(map.values());
      const maxSales = Math.max(1, ...all.map((item) => item.sales));
      const maxRevenue = Math.max(1, ...all.map((item) => item.revenue));
      return {
        byUnits: [...all].sort((a, b) => b.sales - a.sales || b.revenue - a.revenue).slice(0, 5).map((item, idx) => ({
          ...item,
          rank: idx + 1,
          share: Math.round((item.sales / maxSales) * 100),
        })),
        byRevenue: [...all].sort((a, b) => b.revenue - a.revenue || b.sales - a.sales).slice(0, 5).map((item, idx) => ({
          ...item,
          rank: idx + 1,
          share: Math.round((item.revenue / maxRevenue) * 100),
        })),
      };
    };

    return {
      products: rank(byProduct),
      brand: rank(byBrand),
      size: rank(bySize),
      variant: rank(byVariant),
      category: rank(byCategory),
      gender: rank(byGender),
      payment: rank(byPayment),
    };
  }, [customEndDate, customStartDate, productLookup, salesRows, timeRange]);

  const topProducts = useMemo(() => {
    return topRankings.products.byRevenue.map((p) => ({
      id: p.key,
      name: p.name,
      sales: p.sales,
      revenue: p.revenue,
      margin: p.margin ?? 0,
    }));
  }, [topRankings]);

  const topBrands = useMemo(() => {
    return topRankings.brand.byRevenue.map((b) => ({
      name: b.name,
      sales: b.sales,
      revenue: b.revenue,
    }));
  }, [topRankings]);

  const topSizes = useMemo(() => {
    return topRankings.size.byUnits.map((s) => ({
      name: s.name.replace(/^Size\s*/i, ''),
      sales: s.sales,
      revenue: s.revenue,
    }));
  }, [topRankings]);

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

  const salesBreakdownPeriod: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' = useMemo(() => {
    if (timeRange === 'quarterly') return 'quarterly';
    if (timeRange === 'annually') return 'annually';
    if (timeRange === 'monthly') return 'monthly';
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

      if (salesBreakdownPeriod === 'annually') {
        return {
          key: String(date.getFullYear()),
          label: String(date.getFullYear()),
          date: new Date(date.getFullYear(), 0, 1),
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
        const onHand = Number(inventory?.stock_quantity ?? product.stock ?? 0);
        const reserved = Number(inventory?.reserved_quantity ?? inventory?.held_stock ?? product.reserved_stock ?? 0);
        const stock = Math.max(0, onHand - reserved);
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
    const { end, mode, start } = salesTrendFrame(timeRange, customStartDate, customEndDate);
    const buckets: Array<{ start: Date; end: Date; unitsBySku: Map<string, number> }> = [];

    let cursor = bucketStartForDate(start, mode);
    while (cursor <= end) {
      const periodStart = new Date(cursor);
      const nextStart = nextBucketStart(periodStart, mode);
      const periodEnd = new Date(nextStart);
      periodEnd.setMilliseconds(periodEnd.getMilliseconds() - 1);
      buckets.push({
        start: periodStart < start ? new Date(start) : periodStart,
        end: periodEnd > end ? new Date(end) : periodEnd,
        unitsBySku: new Map<string, number>(),
      });
      cursor = nextStart;
    }

    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > end) return;
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
      return {
        id: `it${index}`,
        month: trendBucketLabel(bucket.start, mode),
        units,
        turnover,
        avgDays,
      };
    });
  }, [customEndDate, customStartDate, salesRows, stockBySku, timeRange]);

  const handleExportReport = () => {
    const reportNames: Record<string, string> = {
      overview: 'Executive Overview Report',
      sales: 'Sales Report',
      revenue: 'Revenue Report',
      inventory: 'Inventory Report',
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
      drawTitle('Top 5 Shoe Models');
      drawTable(['Rank', 'Shoe Model', 'Pairs', 'Revenue'], topRankings.products.byRevenue.map((row) => [`#${row.rank}`, row.name, `${row.sales}`, money(row.revenue)]), [40, 240, 65, 170]);
      drawTitle('Top 5 Brands');
      drawTable(['Rank', 'Brand', 'Pairs', 'Revenue'], topRankings.brand.byRevenue.map((row) => [`#${row.rank}`, row.name, `${row.sales}`, money(row.revenue)]), [40, 240, 65, 170]);
      drawTitle('Top 5 Sizes');
      drawTable(['Rank', 'Size', 'Pairs', 'Revenue'], topRankings.size.byUnits.map((row) => [`#${row.rank}`, row.name, `${row.sales}`, money(row.revenue)]), [40, 240, 65, 170]);
      drawTitle('Top 5 Variants (Colors)');
      drawTable(['Rank', 'Variant / Color', 'Pairs', 'Revenue'], topRankings.variant.byRevenue.map((row) => [`#${row.rank}`, row.name, `${row.sales}`, money(row.revenue)]), [40, 240, 65, 170]);
    } else if (reportType === 'revenue') {
      drawTitle('Revenue by Category');
      drawTable(['Category', 'Revenue', 'Share', 'Growth'], revenueByCategory.map((row) => [row.category, money(row.revenue), `${row.percentage}%`, `${row.growth}%`]));
    } else if (reportType === 'inventory') {
      drawTitle('Inventory Turnover');
      drawTable(['Period', 'Units Sold', 'Turnover', 'Avg Days'], inventoryTurnover.map((row) => [row.month, row.units, `${row.turnover.toFixed(2)}x`, row.avgDays || 0]));
      drawTitle('Inventory and Stock Status');
      drawTable(['Item ID', 'Brand and Model', 'Size', 'Color', 'Stock', 'Reorder', 'Status'], inventoryStatusRows.map((row) => [row.itemId, row.name, row.size, row.color, row.stock, row.reorder, row.status]));
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

          {/* TOP 5 PRODUCT RANKINGS */}
          <Card className="bg-[#0b0b0f] border-[#24242d] shadow-xl overflow-hidden">
            <CardHeader className="border-b border-[#1f1f2b] pb-4 bg-[#0e0e14]">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-yellow-300 flex items-center gap-2.5 text-lg font-bold">
                    <BarChart3 className="w-5 h-5 text-yellow-400" />
                    Top 5 Product Rankings
                  </CardTitle>
                  <p className="mt-1 text-xs text-zinc-400">
                    Performance rankings across brand, size, variant, category, department, and payment method • {selectedRangeLabel}
                  </p>
                </div>

                {/* Controls: Timeframe Quick-Pills + Metric Toggle */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Timeframe Quick-Pills */}
                  <div className="flex items-center bg-[#151520] border border-[#2b2b3b] rounded-xl p-1 shadow-inner">
                    {(['daily', 'weekly', 'monthly', 'quarterly', 'annually'] as const).map((period) => (
                      <button
                        key={period}
                        type="button"
                        onClick={() => setTimeRange(period)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                          timeRange === period
                            ? 'bg-yellow-400 text-red-950 font-bold shadow'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {period}
                      </button>
                    ))}
                  </div>

                  {/* Metric Switcher */}
                  <div className="flex items-center bg-[#151520] border border-[#2b2b3b] rounded-xl p-1 shadow-inner">
                    <button
                      type="button"
                      onClick={() => setTopSortBy('units')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        topSortBy === 'units'
                          ? 'bg-yellow-400 text-red-950 font-bold shadow'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Pairs Sold
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopSortBy('revenue')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        topSortBy === 'revenue'
                          ? 'bg-yellow-400 text-red-950 font-bold shadow'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Revenue (PHP)
                    </button>
                  </div>
                </div>
              </div>

              {/* Dimension Navigation Tabs */}
              <div className="flex items-center gap-1.5 pt-3 overflow-x-auto [scrollbar-width:none]">
                {[
                  { id: 'products', label: 'Shoe Models', icon: Package },
                  { id: 'brand', label: 'Brand', icon: Tag },
                  { id: 'size', label: 'Size', icon: Layers },
                  { id: 'variant', label: 'Variant (Color)', icon: Sparkles },
                  { id: 'category', label: 'Category', icon: BarChart3 },
                  { id: 'gender', label: 'Department', icon: UserCheck },
                  { id: 'payment', label: 'Payment Method', icon: CreditCard },
                  { id: 'grid', label: 'All Dimensions (Grid)', icon: Grid },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = topDimensionTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTopDimensionTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-yellow-400/15 text-yellow-300 border border-yellow-400/40 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </CardHeader>

            <CardContent className="p-5">
              {topDimensionTab !== 'grid' ? (
                // SINGLE DIMENSION FORMAL VIEW
                <div className="space-y-2.5">
                  {(() => {
                    const currentList =
                      topSortBy === 'units'
                        ? (topRankings as any)[topDimensionTab]?.byUnits ?? []
                        : (topRankings as any)[topDimensionTab]?.byRevenue ?? [];

                    if (!currentList.length) {
                      return (
                        <div className="py-12 text-center text-zinc-400 text-sm">
                          No sales recorded for this period ({selectedRangeLabel}).
                        </div>
                      );
                    }

                    return currentList.map((item: any) => (
                      <div
                        key={item.key}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border bg-[#101017] border-[#222230] hover:border-[#333346] transition-colors"
                      >
                        <div className="flex items-center gap-3.5">
                          {/* Formal Numeric Rank Badge */}
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-[#161622] text-zinc-300 border border-[#2a2a3c] shrink-0">
                            {item.rank}
                          </div>

                          <div>
                            <p className="text-yellow-100 font-semibold text-sm">
                              {item.name}
                            </p>
                            {item.subtitle && (
                              <p className="text-xs text-zinc-400 mt-0.5">{item.subtitle}</p>
                            )}
                          </div>
                        </div>

                        <div className="mt-2.5 sm:mt-0 flex items-center gap-6 sm:justify-end">
                          {/* Relative Share Bar */}
                          <div className="w-28 sm:w-36 hidden md:block">
                            <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                              <span>Share</span>
                              <span>{item.share}%</span>
                            </div>
                            <div className="w-full bg-[#1e1e2c] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-yellow-400/80"
                                style={{ width: `${item.share}%` }}
                              />
                            </div>
                          </div>

                          {/* Metric Numbers */}
                          <div className="text-right min-w-[120px]">
                            <p className="text-yellow-300 font-semibold text-sm">
                              {money(item.revenue)}
                            </p>
                            <p className="text-xs text-zinc-400">
                              {item.sales.toLocaleString()} {topDimensionTab === 'payment' ? 'transactions' : 'pairs'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                // FORMAL GRID VIEW: ALL DIMENSIONS SIDE-BY-SIDE
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[
                    { title: 'Shoe Models', list: topSortBy === 'units' ? topRankings.products.byUnits : topRankings.products.byRevenue, icon: Package },
                    { title: 'Brand', list: topSortBy === 'units' ? topRankings.brand.byUnits : topRankings.brand.byRevenue, icon: Tag },
                    { title: 'Size', list: topSortBy === 'units' ? topRankings.size.byUnits : topRankings.size.byRevenue, icon: Layers },
                    { title: 'Variant (Color)', list: topSortBy === 'units' ? topRankings.variant.byUnits : topRankings.variant.byRevenue, icon: Sparkles },
                    { title: 'Category', list: topSortBy === 'units' ? topRankings.category.byUnits : topRankings.category.byRevenue, icon: BarChart3 },
                    { title: 'Department', list: topSortBy === 'units' ? topRankings.gender.byUnits : topRankings.gender.byRevenue, icon: UserCheck },
                  ].map((dim) => {
                    const DimIcon = dim.icon;
                    return (
                      <div key={dim.title} className="bg-[#101018] border border-[#222232] rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-[#1f1f2e] pb-2">
                          <h4 className="text-xs uppercase tracking-wider text-yellow-300 font-semibold flex items-center gap-1.5">
                            <DimIcon className="w-3.5 h-3.5 text-yellow-400" />
                            Top 5 {dim.title}
                          </h4>
                          <span className="text-[10px] text-zinc-400">
                            {topSortBy === 'units' ? 'by units' : 'by revenue'}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {dim.list.map((item: any) => (
                            <div key={item.key} className="flex items-center justify-between text-xs py-1.5 border-b border-[#181824] last:border-0">
                              <div className="flex items-center gap-2 overflow-hidden pr-2">
                                <span className="w-5 h-5 rounded flex items-center justify-center font-medium text-[11px] bg-[#161622] text-zinc-400 border border-[#262638] shrink-0">
                                  {item.rank}
                                </span>
                                <span className="text-zinc-200 truncate font-medium">{item.name}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-yellow-300 font-semibold">
                                  {topSortBy === 'units' ? `${item.sales} pairs` : money(item.revenue)}
                                </span>
                              </div>
                            </div>
                          ))}
                          {!dim.list.length && (
                            <p className="text-xs text-zinc-500 py-3 text-center">No sales recorded.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
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
              <div className="overflow-hidden rounded-lg border border-[#24242d] bg-[#07070a]">
                <Table>
                  <TableHeader className="bg-[#1d1d25]">
                    <TableRow className="border-[#24242d] hover:bg-[#1d1d25]">
                      <TableHead className="text-yellow-300 text-center font-semibold">Item ID</TableHead>
                      <TableHead className="text-yellow-300 text-center font-semibold">Brand & Model</TableHead>
                      <TableHead className="text-yellow-300 text-center font-semibold">Size</TableHead>
                      <TableHead className="text-yellow-300 text-center font-semibold">Color</TableHead>
                      <TableHead className="text-yellow-300 text-center font-semibold">In Stock</TableHead>
                      <TableHead className="text-yellow-300 text-center font-semibold">Reorder</TableHead>
                      <TableHead className="text-yellow-300 text-center font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryStatusRows.map((row) => (
                      <TableRow key={row.id} className="border-[#24242d] bg-[#07070a] hover:bg-white/[0.03]">
                        <TableCell className="text-yellow-200 text-center whitespace-nowrap">{row.itemId}</TableCell>
                        <TableCell className="text-yellow-200 text-center font-medium">{row.name}</TableCell>
                        <TableCell className="text-yellow-200 text-center whitespace-nowrap">{row.size}</TableCell>
                        <TableCell className="text-yellow-200 text-center whitespace-nowrap">{row.color}</TableCell>
                        <TableCell className="text-yellow-200 text-center whitespace-nowrap">{row.stock}</TableCell>
                        <TableCell className="text-yellow-200 text-center whitespace-nowrap">{row.reorder}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={row.status === 'Critical' ? 'bg-red-900 text-red-200' : row.status === 'Reorder Required' ? 'bg-yellow-400 text-black' : row.status === 'Overstock' ? 'bg-blue-600 text-white' : 'bg-green-700 text-white'}>{row.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
