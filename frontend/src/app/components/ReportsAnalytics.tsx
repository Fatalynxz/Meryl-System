import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { BarChart3, TrendingUp, Coins, Package, Calendar, Download, FileText } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { useProducts, usePromotions, useReturns, useSales } from '../../lib/hooks';

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

function returnDate(row: any) {
  const date = new Date(row.return_date ?? row.created_at ?? '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function money(value: number) {
  if (value >= 1000000) return `PHP ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `PHP ${(value / 1000).toFixed(1)}K`;
  return `PHP ${value.toFixed(2)}`;
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

export function ReportsAnalytics() {
  const [timeRange, setTimeRange] = useState<ReportPeriod>('monthly');
  const [reportType, setReportType] = useState('overview');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showComparison, setShowComparison] = useState(true);
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const promotionsQuery = usePromotions();
  const returnsQuery = useReturns();

  const salesRows = ((salesQuery.data as any[]) ?? []).filter(isCompletedSale);
  const productRows = (productsQuery.data as any[]) ?? [];
  const promotionRows = (promotionsQuery.data as any[]) ?? [];
  const returnRows = (returnsQuery.data as any[]) ?? [];

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
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);
    const grouped = new Map<string, { sales: number; revenue: number; customers: Set<string>; firstDate: Date }>();
    const bucketForDate = (date: Date) => {
      const bucket = new Date(date);
      if (timeRange === 'annually') {
        bucket.setDate(1);
      } else if (timeRange === 'quarterly') {
        const day = bucket.getDay();
        bucket.setDate(bucket.getDate() - day);
      }
      bucket.setHours(0, 0, 0, 0);
      return bucket;
    };
    const makeLabel = (bucket: Date) => {
      if (timeRange === 'annually') return bucket.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (timeRange === 'quarterly') return `Week of ${bucket.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      return bucket.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const bucket = bucketForDate(date);
      const key = bucket.toISOString();
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
        date: makeLabel(agg.firstDate),
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

  const filteredReturns = useMemo(() => {
    const { now, start } = rangeWindow(timeRange, customStartDate, customEndDate);
    return returnRows.filter((row) => {
      const date = returnDate(row);
      return date && date >= start && date <= now;
    });
  }, [customEndDate, customStartDate, returnRows, timeRange]);

  const replacementMetrics = useMemo(() => {
    let items = 0;
    let additionalPay = 0;
    let evenExchanges = 0;

    filteredReturns.forEach((row) => {
      const details = Array.isArray(row.return_details) ? row.return_details : [];
      details.forEach((detail: any) => {
        items += Number(detail.quantity_returned ?? detail.quantity ?? 0);
      });
      const addPay = Number(row.additional_payment ?? row.total_replacement_payments ?? 0);
      additionalPay += addPay;
      if (addPay <= 0) evenExchanges += 1;
    });

    return {
      replacements: filteredReturns.length,
      items,
      additionalPay,
      evenExchanges,
    };
  }, [filteredReturns]);

  const replacementReasonRows = useMemo(() => {
    const byReason = new Map<string, { reason: string; count: number; items: number }>();
    filteredReturns.forEach((row) => {
      const details = Array.isArray(row.return_details) ? row.return_details : [];
      if (!details.length) {
        const reason = 'Unspecified';
        const prev = byReason.get(reason) ?? { reason, count: 0, items: 0 };
        prev.count += 1;
        byReason.set(reason, prev);
        return;
      }
      details.forEach((detail: any) => {
        const reason = String(detail.reason ?? row.return_reason ?? 'Unspecified');
        const prev = byReason.get(reason) ?? { reason, count: 0, items: 0 };
        prev.count += 1;
        prev.items += Number(detail.quantity_returned ?? detail.quantity ?? 0);
        byReason.set(reason, prev);
      });
    });
    return Array.from(byReason.values()).sort((a, b) => b.count - a.count);
  }, [filteredReturns]);

  const replacementTopProducts = useMemo(() => {
    const byProduct = new Map<string, { product: string; count: number; items: number }>();
    filteredReturns.forEach((row) => {
      const details = Array.isArray(row.return_details) ? row.return_details : [];
      details.forEach((detail: any) => {
        const productName = String(
          detail.product?.product_name
          ?? detail.product_name
          ?? 'Unknown Product',
        );
        const prev = byProduct.get(productName) ?? { product: productName, count: 0, items: 0 };
        prev.count += 1;
        prev.items += Number(detail.quantity_returned ?? detail.quantity ?? 0);
        byProduct.set(productName, prev);
      });
    });
    return Array.from(byProduct.values()).sort((a, b) => b.items - a.items).slice(0, 8);
  }, [filteredReturns]);

  const handleExportReport = () => {
    if (timeRange === 'custom' && (!customStartDate || !customEndDate || customStartDate > customEndDate)) {
      toast.error('Select a valid custom date range before exporting.');
      return;
    }

    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const reportNames: Record<string, string> = {
      overview: 'Executive Overview Report',
      sales: 'Sales Report',
      revenue: 'Revenue Report',
      inventory: 'Inventory Report',
      promotions: 'Promotions Report',
      returns: 'Returns and Replacement Report',
    };
    const table = (headers: string[], rows: Array<Array<unknown>>, empty = 'No records found for this date range.') => `
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.length
            ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
            : `<tr><td colspan="${headers.length}" class="empty">${escapeHtml(empty)}</td></tr>`}
        </tbody>
      </table>
    `;
    const metric = (label: string, value: unknown, note = '') => `
      <div class="metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${note ? `<small>${escapeHtml(note)}</small>` : ''}
      </div>
    `;
    const reportSections: Record<string, string> = {
      overview: `
        <section>
          <h2>Executive Snapshot</h2>
          <div class="metrics">
            ${metric('Average Transaction Value', money(businessSummary.atv), `${currentMetrics.current.transactions} completed transactions`)}
            ${metric('Discount Pressure', `${businessSummary.discountRate.toFixed(1)}%`, `${money(businessSummary.discounts)} discount impact`)}
            ${metric('Best Brand', businessSummary.bestBrandName, `${businessSummary.bestBrandUnits} pairs sold`)}
            ${metric('Top Product', topProducts[0]?.name ?? 'N/A', topProducts[0] ? `${topProducts[0].sales} units sold` : 'No sales yet')}
          </div>
          ${table(
            ['Summary Item', 'Value'],
            [
              ['Gross Sales Before Discounts', money(businessSummary.grossRevenue)],
              ['Net After Discounts', money(businessSummary.netSales)],
              ['Best Size', businessSummary.bestSize],
              ['Prepared By', businessSummary.preparedBy],
            ],
          )}
        </section>
        <section>
          <h2>Sales Trend</h2>
          ${table(['Period', 'Units Sold', 'Revenue', 'Customers'], filteredSalesTrends.map((row) => [row.date, row.sales, money(row.revenue), row.customers]))}
        </section>
      `,
      sales: `
        <section>
          <h2>Sales Breakdown</h2>
          ${table(
            ['Period', 'Pairs Sold', 'Gross Revenue', 'Discount Applied', 'Net Sales'],
            salesBreakdownRows.map((row) => [row.date, row.pairs, money(row.gross), money(row.discount), money(row.net)]),
            'No completed sales found for this date range.',
          )}
        </section>
        <section class="columns">
          <div>
            <h2>Top Products</h2>
            ${table(['Product', 'Units', 'Revenue'], topProducts.map((row) => [row.name, row.sales, money(row.revenue)]))}
          </div>
          <div>
            <h2>Top Brands</h2>
            ${table(['Brand', 'Pairs', 'Revenue'], topBrands.map((row) => [row.name, row.sales, money(row.revenue)]))}
          </div>
          <div>
            <h2>Top Sizes</h2>
            ${table(['Size', 'Pairs', 'Revenue'], topSizes.map((row) => [row.name, row.sales, money(row.revenue)]))}
          </div>
        </section>
      `,
      revenue: `
        <section>
          <h2>Revenue by Category</h2>
          ${table(
            ['Category', 'Revenue', 'Share', 'Growth vs Previous'],
            revenueByCategory.map((row) => [row.category, money(row.revenue), `${row.percentage}%`, `${row.growth}%`]),
          )}
        </section>
      `,
      inventory: `
        <section>
          <h2>Inventory Turnover</h2>
          ${table(
            ['Period', 'Units Sold', 'Turnover Rate', 'Avg Days to Sell'],
            inventoryTurnover.map((row) => [row.month, row.units, `${row.turnover.toFixed(2)}x`, row.avgDays || 0]),
          )}
        </section>
        <section>
          <h2>Inventory and Stock Status</h2>
          ${table(
            ['Item ID', 'Brand and Model', 'Size', 'Color', 'In Stock', 'Reorder', 'Status'],
            inventoryStatusRows.map((row) => [row.itemId, row.name, row.size, row.color, row.stock, row.reorder, row.status]),
          )}
        </section>
      `,
      promotions: `
        <section>
          <h2>Promotion Performance</h2>
          ${table(
            ['Promotion', 'Revenue', 'ROI', 'Conversion'],
            promotionEffectiveness.map((row) => [row.promotion, money(row.revenue), `${row.roi}%`, `${row.conversion}%`]),
            'No promotion performance found for this date range.',
          )}
        </section>
      `,
      returns: `
        <section>
          <h2>Replacement Summary</h2>
          <div class="metrics">
            ${metric('Replacement Transactions', replacementMetrics.replacements)}
            ${metric('Items Replaced', replacementMetrics.items)}
            ${metric('Additional Payments', money(replacementMetrics.additionalPay))}
            ${metric('Even Exchanges', replacementMetrics.evenExchanges)}
          </div>
        </section>
        <section class="columns two">
          <div>
            <h2>Reasons</h2>
            ${table(['Reason', 'Cases', 'Items'], replacementReasonRows.map((row) => [row.reason, row.count, row.items]))}
          </div>
          <div>
            <h2>Top Replaced Products</h2>
            ${table(['Product', 'Cases', 'Items'], replacementTopProducts.map((row) => [row.product, row.count, row.items]))}
          </div>
        </section>
      `,
    };
    const generatedAt = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(reportNames[reportType] ?? 'Meryl Shoes Report')}</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #191919; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
            .cover { border-bottom: 3px solid #facc15; padding-bottom: 18px; margin-bottom: 18px; }
            .brand { color: #8a6b00; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; font-size: 11px; }
            h1 { margin: 8px 0 4px; font-size: 28px; color: #111; }
            h2 { margin: 0 0 10px; font-size: 15px; color: #111; }
            .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
            .meta div, .metric { border: 1px solid #ddd; border-radius: 8px; padding: 10px; background: #fafafa; }
            .meta span, .metric span { display: block; color: #666; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
            .meta strong, .metric strong { display: block; margin-top: 5px; font-size: 17px; color: #111; }
            .metric small { display: block; margin-top: 5px; color: #666; }
            .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
            section { break-inside: avoid; margin: 18px 0; }
            table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; }
            th { background: #1f1f27; color: #fff; text-align: left; font-weight: 700; padding: 9px; border: 1px solid #2e2e38; }
            td { padding: 8px 9px; border: 1px solid #e6e6e6; vertical-align: top; }
            tbody tr:nth-child(even) td { background: #fbfbfb; }
            .empty { text-align: center; color: #777; padding: 18px; }
            .columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: start; }
            .columns.two { grid-template-columns: repeat(2, 1fr); }
            .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; color: #666; font-size: 10px; display: flex; justify-content: space-between; }
            @media print {
              button { display: none; }
              body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="cover">
            <div class="brand">Meryl Shoes</div>
            <h1>${escapeHtml(reportNames[reportType] ?? 'Meryl Shoes Report')}</h1>
            <div>Libertad St., Bacolod City Branch</div>
            <div class="meta">
              <div><span>Date Range</span><strong>${escapeHtml(selectedRangeLabel)}</strong></div>
              <div><span>Revenue</span><strong>${escapeHtml(money(currentMetrics.current.revenue))}</strong></div>
              <div><span>Units Sold</span><strong>${escapeHtml(currentMetrics.current.units.toLocaleString())}</strong></div>
              <div><span>Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
            </div>
          </div>
          ${reportSections[reportType] ?? reportSections.overview}
          <div class="footer">
            <span>Prepared by Store Manager</span>
            <span>Meryl Shoes Management System</span>
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => window.print(), 250);
            };
          </script>
        </body>
      </html>`;
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      toast.error('Allow pop-ups to export the PDF report.');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    toast.success('PDF report opened. Choose Save as PDF in the print dialog.');
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
  const isCustomRangeIncomplete = timeRange === 'custom' && (!customStartDate || !customEndDate || customStartDate > customEndDate);

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
                <SelectItem value="custom">Custom Range</SelectItem>
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
                <SelectItem value="returns">Returns / Replacement Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {timeRange === 'custom' && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-yellow-200/70">Start Date</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-9 w-40 rounded-md border border-[#24242d] bg-[#0b0b0f] px-3 text-sm text-white outline-none focus:ring-2 focus:ring-yellow-400/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-wide text-yellow-200/70">End Date</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-9 w-40 rounded-md border border-[#24242d] bg-[#0b0b0f] px-3 text-sm text-white outline-none focus:ring-2 focus:ring-yellow-400/50"
                />
              </div>
            </>
          )}
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
            disabled={isCustomRangeIncomplete}
            className="h-9 bg-yellow-400 text-black hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
          <Download className="w-4 h-4 mr-2" />
          Export PDF
          </Button>
        </div>
      </div>
      <div className="rounded-md border border-[#24242d] bg-[#07070a] px-4 py-2 text-sm text-yellow-200">
        Showing {selectedRangeLabel}
        {isCustomRangeIncomplete ? <span className="ml-2 text-red-300">Select a valid custom start and end date.</span> : null}
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
                    <YAxis stroke="#fef08a" />
                    <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #24242d', color: '#fef08a' }} />
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
                    <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #24242d', color: '#fef08a' }} />
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

      {reportType === 'returns' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardContent className="pt-6">
                <p className="text-sm text-white/70">Total Replacements</p>
                <p className="text-2xl text-white">{replacementMetrics.replacements.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardContent className="pt-6">
                <p className="text-sm text-white/70">Items Replaced</p>
                <p className="text-2xl text-white">{replacementMetrics.items.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardContent className="pt-6">
                <p className="text-sm text-white/70">Additional Payment</p>
                <p className="text-2xl text-white">{money(replacementMetrics.additionalPay)}</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardContent className="pt-6">
                <p className="text-sm text-white/70">Even Exchanges</p>
                <p className="text-2xl text-white">{replacementMetrics.evenExchanges.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardHeader><CardTitle className="text-yellow-300">Replacement Reasons</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={replacementReasonRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#24242d" />
                    <XAxis dataKey="reason" stroke="#fef08a" />
                    <YAxis stroke="#fef08a" />
                    <Tooltip contentStyle={{ backgroundColor: '#111118', border: '1px solid #24242d', color: '#fef08a' }} />
                    <Bar dataKey="count" fill="#fef08a" name="Cases" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="bg-[#0b0b0f] border-[#24242d]">
              <CardHeader><CardTitle className="text-yellow-300">Top Replaced Products</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {replacementTopProducts.map((row) => (
                  <div key={row.product} className="flex justify-between items-center border-b border-[#24242d] pb-2">
                    <div>
                      <p className="text-yellow-200">{row.product}</p>
                      <p className="text-yellow-300 text-xs">{row.count} replacements</p>
                    </div>
                    <p className="text-yellow-300">{row.items} items</p>
                  </div>
                ))}
                {!replacementTopProducts.length && <p className="text-yellow-200 text-sm">No replacement data for this range.</p>}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-[#0b0b0f] border-[#24242d]">
            <CardHeader><CardTitle className="text-yellow-300">Replacement Transactions</CardTitle></CardHeader>
            <CardContent>
              <Table className="overflow-hidden rounded-lg border border-[#24242d] bg-[#07070a]">
                <TableHeader className="bg-[#0b0b0f]">
                  <TableRow className="border-[#24242d] hover:bg-[#0b0b0f]">
                    <TableHead className="text-yellow-300">Date</TableHead>
                    <TableHead className="text-yellow-300">Replacement ID</TableHead>
                    <TableHead className="text-yellow-300">Sales ID</TableHead>
                    <TableHead className="text-yellow-300">Customer</TableHead>
                    <TableHead className="text-yellow-300 text-center">Items</TableHead>
                    <TableHead className="text-yellow-300 text-center">Additional Pay</TableHead>
                    <TableHead className="text-yellow-300 text-center">Processed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((row, index) => {
                    const details = Array.isArray(row.return_details) ? row.return_details : [];
                    const items = details.reduce((sum: number, d: any) => sum + Number(d.quantity_returned ?? d.quantity ?? 0), 0);
                    const date = returnDate(row);
                    return (
                      <TableRow key={row.return_id ?? `ret-${index}`} className="border-[#24242d] bg-[#07070a] hover:bg-white/[0.03]">
                        <TableCell className="text-yellow-200">{date ? date.toLocaleDateString('en-US') : 'N/A'}</TableCell>
                        <TableCell className="text-yellow-200">{row.return_id ?? '-'}</TableCell>
                        <TableCell className="text-yellow-200">{row.sales_id ?? row.sales_transaction?.sales_id ?? '-'}</TableCell>
                        <TableCell className="text-yellow-200">{row.sales_transaction?.customer?.customer_name ?? row.customer_name ?? 'Walk-in Customer'}</TableCell>
                        <TableCell className="text-yellow-200 text-center">{items}</TableCell>
                        <TableCell className="text-yellow-300 text-center">{money(Number(row.additional_payment ?? row.total_replacement_payments ?? 0))}</TableCell>
                        <TableCell className="text-yellow-200 text-center">{row.user?.username ?? row.processed_by ?? '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!filteredReturns.length && (
                    <TableRow className="border-[#24242d] bg-[#07070a]">
                      <TableCell colSpan={7} className="text-center text-yellow-200 py-6">No replacement transactions for this date range.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
