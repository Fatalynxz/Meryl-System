import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { BarChart3, TrendingUp, Coins, Package, Calendar, Download, FileText } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { usePredictions, useProducts, usePromotions, useSales } from '../../lib/hooks';

function isCompletedSale(sale: any) {
  const payment = Array.isArray(sale.payment) ? sale.payment[0] : sale.payment;
  const status = String(payment?.payment_status ?? '').toLowerCase();
  return ['completed', 'paid', 'success', 'successful'].includes(status);
}

function saleDate(sale: any) {
  const date = new Date(sale.transaction_date ?? sale.created_at ?? '');
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

function rangeWindow(timeRange: string) {
  const now = new Date();
  const rangeDaysMap: Record<string, number> = {
    '7days': 7,
    '30days': 30,
    '90days': 90,
    '12months': 365,
    ytd: Math.max(1, Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + 1),
  };
  const days = rangeDaysMap[timeRange] ?? 30;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - (days - 1));
  const previousStart = new Date(start);
  previousStart.setDate(start.getDate() - days);
  return { now, start, previousStart, days };
}

export function ReportsAnalytics() {
  const [timeRange, setTimeRange] = useState('30days');
  const [reportType, setReportType] = useState('overview');
  const [groupBy, setGroupBy] = useState('daily');
  const [compareMode, setCompareMode] = useState(false);
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const promotionsQuery = usePromotions();
  const predictionsQuery = usePredictions();

  const salesRows = ((salesQuery.data as any[]) ?? []).filter(isCompletedSale);
  const productRows = (productsQuery.data as any[]) ?? [];
  const promotionRows = (promotionsQuery.data as any[]) ?? [];
  const predictionRows = (predictionsQuery.data as any[]) ?? [];

  const productLookup = useMemo(() => {
    const map = new Map<string, any>();
    productRows.forEach((product: any) => map.set(String(product.product_id ?? ''), product));
    return map;
  }, [productRows]);

  const currentMetrics = useMemo(() => {
    const { now, start, previousStart } = rangeWindow(timeRange);
    const current = salesRows.filter((sale) => {
      const date = saleDate(sale);
      return date && date >= start && date <= now;
    });
    const previous = salesRows.filter((sale) => {
      const date = saleDate(sale);
      return date && date >= previousStart && date < start;
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
  }, [salesRows, timeRange]);

  const filteredSalesTrends = useMemo(() => {
    const { now, start } = rangeWindow(timeRange);
    const grouped = new Map<string, { sales: number; revenue: number; customers: Set<string> }>();
    const makeLabel = (date: Date) => {
      if (groupBy === 'monthly') return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (groupBy === 'weekly') return `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };
    salesRows.forEach((sale) => {
      const date = saleDate(sale);
      if (!date || date < start || date > now) return;
      const key = makeLabel(date);
      const prev = grouped.get(key) ?? { sales: 0, revenue: 0, customers: new Set<string>() };
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        prev.sales += Number(detail.quantity ?? 0);
      });
      prev.revenue += Number(sale.total_amount ?? 0);
      if (sale.customer_id) prev.customers.add(String(sale.customer_id));
      grouped.set(key, prev);
    });
    return Array.from(grouped.entries()).map(([date, agg], idx) => ({
      id: `flt-${idx}`,
      date,
      sales: Math.round(agg.sales),
      revenue: Math.round(agg.revenue),
      customers: agg.customers.size,
    }));
  }, [groupBy, salesRows, timeRange]);

  const comparisonSalesTrends = useMemo(() => {
    if (!compareMode) return [];
    return filteredSalesTrends.map((row, idx) => ({
      id: `cmp-${idx}`,
      ...row,
      revenue: Math.round(row.revenue * ((currentMetrics.previous.revenue || 0) / Math.max(currentMetrics.current.revenue || 1, 1))),
      sales: Math.round(row.sales * ((currentMetrics.previous.units || 0) / Math.max(currentMetrics.current.units || 1, 1))),
    }));
  }, [compareMode, currentMetrics, filteredSalesTrends]);

  const topProducts = useMemo(() => {
    const { now, start } = rangeWindow(timeRange);
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
  }, [productLookup, salesRows, timeRange]);

  const revenueByCategory = useMemo(() => {
    const { now, start, previousStart } = rangeWindow(timeRange);
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
  }, [productLookup, salesRows, timeRange]);

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

  const monthlyComparison = useMemo(() => {
    const averageOrder = currentMetrics.current.transactions
      ? currentMetrics.current.revenue / currentMetrics.current.transactions
      : 0;
    const previousAverageOrder = currentMetrics.previous.transactions
      ? currentMetrics.previous.revenue / currentMetrics.previous.transactions
      : 0;
    return [
      { id: 'mc1', metric: 'Revenue', current: currentMetrics.current.revenue, previous: currentMetrics.previous.revenue, change: percentChange(currentMetrics.current.revenue, currentMetrics.previous.revenue), currency: true },
      { id: 'mc2', metric: 'Units Sold', current: currentMetrics.current.units, previous: currentMetrics.previous.units, change: percentChange(currentMetrics.current.units, currentMetrics.previous.units), currency: false },
      { id: 'mc3', metric: 'Avg Order Value', current: averageOrder, previous: previousAverageOrder, change: percentChange(averageOrder, previousAverageOrder), currency: true },
      { id: 'mc4', metric: 'Customer Count', current: currentMetrics.current.customers, previous: currentMetrics.previous.customers, change: percentChange(currentMetrics.current.customers, currentMetrics.previous.customers), currency: false },
    ];
  }, [currentMetrics]);

  const inventoryTurnover = useMemo(() => {
    const stockByProduct = new Map<string, number>();
    productRows.forEach((product: any) => {
      const inventory = Array.isArray(product.inventory) ? product.inventory[0] : product.inventory;
      stockByProduct.set(String(product.product_id ?? ''), Number(inventory?.stock_quantity ?? 0));
    });
    const totalStock = Array.from(stockByProduct.values()).reduce((sum, value) => sum + value, 0);
    return Array.from({ length: 6 }, (_, index) => {
      const month = new Date();
      month.setMonth(month.getMonth() - (5 - index));
      const monthKey = month.toISOString().slice(0, 7);
      let units = 0;
      salesRows.forEach((sale) => {
        const date = saleDate(sale);
        if (!date || date.toISOString().slice(0, 7) !== monthKey) return;
        const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
        details.forEach((detail: any) => {
          units += Number(detail.quantity ?? 0);
        });
      });
      const turnover = totalStock > 0 ? Number((units / totalStock).toFixed(2)) : 0;
      const avgDays = units > 0 ? Math.max(1, Math.round((totalStock / units) * 30)) : 0;
      return {
        id: `it${index}`,
        month: month.toLocaleDateString('en-US', { month: 'short' }),
        turnover,
        avgDays,
      };
    });
  }, [productRows, salesRows]);

  const latestTurnover = inventoryTurnover.at(-1)?.turnover ?? 0;
  const latestAvgDays = inventoryTurnover.at(-1)?.avgDays ?? 0;
  const previousTurnover = inventoryTurnover.at(-2)?.turnover ?? 0;
  const previousAvgDays = inventoryTurnover.at(-2)?.avgDays ?? 0;

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

  const forecastedDemand = useMemo(() => {
    const futurePredictions = predictionRows
      .map((row: any) => {
        const date = new Date(row.prediction_date ?? row.created_at ?? '');
        return { row, date };
      })
      .filter(({ date }) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const byMonth = new Map<string, { forecast: number; confidence: number[]; date: Date }>();
    futurePredictions.forEach(({ row, date }) => {
      const key = date.toISOString().slice(0, 7);
      const prev = byMonth.get(key) ?? { forecast: 0, confidence: [], date };
      prev.forecast += Number(row.predicted_demand ?? 0);
      const history = Array.isArray(row.prediction_history) ? row.prediction_history[0] : row.prediction_history;
      if (history?.prediction_accuracy != null) prev.confidence.push(Number(history.prediction_accuracy));
      byMonth.set(key, prev);
    });
    const rows = Array.from(byMonth.values()).slice(0, 6).map((item, index) => ({
      id: `fd${index}`,
      month: item.date.toLocaleDateString('en-US', { month: 'short' }),
      forecast: Math.round(item.forecast),
      confidence: item.confidence.length
        ? Math.round(item.confidence.reduce((sum, value) => sum + value, 0) / item.confidence.length)
        : 75,
    }));
    if (rows.length) return rows;
    const avgRevenue = filteredSalesTrends.length
      ? filteredSalesTrends.reduce((sum, row) => sum + row.revenue, 0) / filteredSalesTrends.length
      : 0;
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() + index + 1);
      return {
        id: `fd-fallback-${index}`,
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        forecast: Math.round(avgRevenue * (1 + index * 0.04)),
        confidence: avgRevenue > 0 ? 70 : 0,
      };
    });
  }, [filteredSalesTrends, predictionRows]);

  const handleExportReport = () => {
    const header = 'Date,Sales,Revenue,Customers';
    const rows = filteredSalesTrends.map((r) => `${r.date},${r.sales},${r.revenue},${r.customers}`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${timeRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported successfully!');
  };

  const revenueChange = percentChange(currentMetrics.current.revenue, currentMetrics.previous.revenue);
  const unitsChange = percentChange(currentMetrics.current.units, currentMetrics.previous.units);
  const turnoverChange = percentChange(latestTurnover, previousTurnover);
  const avgDaysChange = previousAvgDays ? previousAvgDays - latestAvgDays : 0;
  const totalForecastDemand = forecastedDemand.reduce((sum, item) => sum + item.forecast, 0);
  const averageForecastConfidence = forecastedDemand.length
    ? Math.round(forecastedDemand.reduce((sum, item) => sum + item.confidence, 0) / forecastedDemand.length)
    : 0;
  const highestForecast = forecastedDemand.reduce(
    (best, item) => (item.forecast > best.forecast ? item : best),
    forecastedDemand[0] ?? { month: 'N/A', forecast: 0, confidence: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-yellow-200/70">Date Range</span>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-44 bg-red-700 border-red-800 text-yellow-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="90days">Last 90 Days</SelectItem>
                <SelectItem value="12months">Last 12 Months</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-yellow-200/70">Report Type</span>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="w-48 bg-red-700 border-red-800 text-yellow-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                <SelectItem value="overview">Overview Report</SelectItem>
                <SelectItem value="sales">Sales Analysis</SelectItem>
                <SelectItem value="inventory">Inventory Report</SelectItem>
                <SelectItem value="promotions">Promotions Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-yellow-200/70">Group By</span>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="w-36 bg-red-700 border-red-800 text-yellow-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCompareMode((v) => !v)}
            className={`h-9 ${
              compareMode
                ? 'border-yellow-400 bg-yellow-400 text-red-900 hover:bg-yellow-500'
                : 'border-red-800 bg-red-700 text-yellow-200 hover:bg-red-600'
            }`}
          >
            Compare
          </Button>
        </div>
        <Button onClick={handleExportReport} className="h-9 bg-yellow-400 text-red-900 hover:bg-yellow-500">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Total Revenue</p>
                <p className="text-2xl text-yellow-300">{money(currentMetrics.current.revenue)}</p>
                <p className={`text-xs mt-1 ${revenueChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {revenueChange >= 0 ? '+' : ''}{revenueChange.toFixed(1)}% vs last period
                </p>
              </div>
              <Coins className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Units Sold</p>
                <p className="text-2xl text-yellow-300">{currentMetrics.current.units.toLocaleString()}</p>
                <p className={`text-xs mt-1 ${unitsChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {unitsChange >= 0 ? '+' : ''}{unitsChange.toFixed(1)}% vs last period
                </p>
              </div>
              <Package className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Inventory Turnover</p>
                <p className="text-2xl text-yellow-300">{latestTurnover.toFixed(2)}x</p>
                <p className={`text-xs mt-1 ${turnoverChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {turnoverChange >= 0 ? '+' : ''}{turnoverChange.toFixed(1)}% vs last month
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Avg Days to Sell</p>
                <p className="text-2xl text-yellow-300">{latestAvgDays || 0}</p>
                <p className={`text-xs mt-1 ${avgDaysChange >= 0 ? 'text-green-400' : 'text-red-300'}`}>
                  {avgDaysChange >= 0 ? `${avgDaysChange} days faster` : `${Math.abs(avgDaysChange)} days slower`}
                </p>
              </div>
              <Calendar className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Main Analytics Tabs */}
      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-red-700 border border-red-800">
          <TabsTrigger value="sales" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-red-900 text-yellow-200">
            Sales Trends
          </TabsTrigger>
          <TabsTrigger value="revenue" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-red-900 text-yellow-200">
            Revenue
          </TabsTrigger>
          <TabsTrigger value="inventory" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-red-900 text-yellow-200">
            Inventory
          </TabsTrigger>
          <TabsTrigger value="promotions" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-red-900 text-yellow-200">
            Promotions
          </TabsTrigger>
          <TabsTrigger value="forecast" className="data-[state=active]:bg-yellow-400 data-[state=active]:text-red-900 text-yellow-200">
            Forecast
          </TabsTrigger>
        </TabsList>

        {/* Sales Trends Tab */}
        <TabsContent value="sales" className="space-y-4">
          <Card className="bg-red-700 border-red-800">
            <CardHeader>
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Sales Performance Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={filteredSalesTrends}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fef08a" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#fef08a" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#facc15" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#facc15" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
                  <XAxis dataKey="date" stroke="#fef08a" />
                  <YAxis stroke="#fef08a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
                  />
                  <Legend wrapperStyle={{ color: '#fef08a' }} />
                  <Area key="revenue-area" type="monotone" dataKey="revenue" stroke="#facc15" fillOpacity={1} fill="url(#colorRevenue)" name="Revenue (PHP)" />
                  <Area key="sales-area" type="monotone" dataKey="sales" stroke="#fef08a" fillOpacity={1} fill="url(#colorSales)" name="Units Sold" />
                  {compareMode && (
                    <Line
                      key="compare-revenue-line"
                      type="monotone"
                      data={comparisonSalesTrends}
                      dataKey="revenue"
                      stroke="#ffffff"
                      strokeDasharray="5 5"
                      dot={false}
                      name="Previous Period"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-red-700 border-red-800">
              <CardHeader>
                <CardTitle className="text-yellow-300">Monthly Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {monthlyComparison.map((item) => (
                    <div key={item.id} className="flex justify-between items-center border-b border-red-600 pb-3">
                      <div>
                        <p className="text-yellow-200">{item.metric}</p>
                        <p className="text-yellow-300 text-lg">
                          {item.currency ? money(item.current) : Math.round(item.current).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge className={item.change > 0 ? "bg-green-600 text-white" : "bg-red-900 text-yellow-200"}>
                          {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}%
                        </Badge>
                        <p className="text-yellow-200 text-xs mt-1">vs previous</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-red-700 border-red-800">
              <CardHeader>
                <CardTitle className="text-yellow-300">Top Performing Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topProducts.slice(0, 5).map((product) => (
                    <div key={product.id} className="flex justify-between items-center border-b border-red-600 pb-2">
                      <div className="flex-1">
                        <p className="text-yellow-200">{product.name}</p>
                        <p className="text-yellow-300 text-xs">{product.sales} units sold</p>
                      </div>
                      <div className="text-right">
                        <p className="text-yellow-300">{money(product.revenue)}</p>
                        <Badge className="bg-yellow-400 text-red-900 text-xs mt-1">
                          {product.margin}% margin
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-red-700 border-red-800">
              <CardHeader>
                <CardTitle className="text-yellow-300">Revenue by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
                    <XAxis dataKey="category" stroke="#fef08a" />
                    <YAxis stroke="#fef08a" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
                    />
                    <Legend wrapperStyle={{ color: '#fef08a' }} />
                    <Bar key="revenue-bar" dataKey="revenue" fill="#fef08a" name="Revenue (PHP)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-red-700 border-red-800">
              <CardHeader>
                <CardTitle className="text-yellow-300">Category Distribution</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name} ${value}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryDistribution.map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-red-700 border-red-800">
            <CardHeader>
              <CardTitle className="text-yellow-300">Category Performance Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {revenueByCategory.map((category) => (
                  <div key={category.id} className="border-b border-red-600 pb-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-yellow-200">{category.category}</p>
                      <div className="flex items-center gap-4">
                        <Badge className="bg-yellow-400 text-red-900">
                          {category.percentage}% of total
                        </Badge>
                        <Badge className={category.growth > 0 ? "bg-green-600 text-white" : "bg-red-900 text-yellow-200"}>
                          {category.growth > 0 ? '+' : ''}{category.growth.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                    <p className="text-yellow-300 text-lg">{money(category.revenue)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <Card className="bg-red-700 border-red-800">
            <CardHeader>
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Inventory Turnover Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={inventoryTurnover}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
                  <XAxis dataKey="month" stroke="#fef08a" />
                  <YAxis yAxisId="left" stroke="#fef08a" />
                  <YAxis yAxisId="right" orientation="right" stroke="#facc15" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
                  />
                  <Legend wrapperStyle={{ color: '#fef08a' }} />
                  <Line key="turnover-line" yAxisId="left" type="monotone" dataKey="turnover" stroke="#fef08a" strokeWidth={2} name="Turnover Rate" />
                  <Line key="avgdays-line" yAxisId="right" type="monotone" dataKey="avgDays" stroke="#facc15" strokeWidth={2} name="Avg Days to Sell" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Promotions Tab */}
        <TabsContent value="promotions" className="space-y-4">
          <Card className="bg-red-700 border-red-800">
            <CardHeader>
              <CardTitle className="text-yellow-300">Promotion Effectiveness Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={promotionEffectiveness}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
                  <XAxis dataKey="promotion" stroke="#fef08a" />
                  <YAxis stroke="#fef08a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
                  />
                  <Legend wrapperStyle={{ color: '#fef08a' }} />
                  <Bar key="promo-revenue-bar" dataKey="revenue" fill="#fef08a" name="Revenue (PHP)" />
                  <Bar key="promo-roi-bar" dataKey="roi" fill="#facc15" name="ROI (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-red-700 border-red-800">
            <CardHeader>
              <CardTitle className="text-yellow-300">Promotion Performance Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {promotionEffectiveness.map((promo) => (
                  <div key={promo.id} className="flex justify-between items-center border-b border-red-600 pb-3">
                    <div>
                      <p className="text-yellow-200">{promo.promotion}</p>
                      <p className="text-yellow-300 text-xs">Conversion: {promo.conversion}%</p>
                    </div>
                    <div className="flex gap-3">
                      <Badge className="bg-yellow-400 text-red-900">
                        {money(promo.revenue)}
                      </Badge>
                      <Badge className="bg-green-600 text-white">
                        {promo.roi}% ROI
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast" className="space-y-4">
          <Card className="bg-red-700 border-red-800">
            <CardHeader>
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Forecasted Demand - Next 6 Months
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={forecastedDemand}>
                  <defs>
                    <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#facc15" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#facc15" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
                  <XAxis dataKey="month" stroke="#fef08a" />
                  <YAxis stroke="#fef08a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
                  />
                  <Legend wrapperStyle={{ color: '#fef08a' }} />
                  <Area key="forecast-area" type="monotone" dataKey="forecast" stroke="#facc15" fillOpacity={1} fill="url(#colorForecast)" name="Forecasted Demand" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-6 gap-2">
                {forecastedDemand.map((item) => (
                  <div key={item.id} className="text-center">
                    <p className="text-yellow-200 text-sm">{item.month}</p>
                    <p className="text-yellow-300">{item.forecast.toLocaleString()} units</p>
                    <Badge className="bg-yellow-400 text-red-900 text-xs mt-1">
                      {item.confidence}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-red-700 border-red-800">
            <CardHeader>
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Forecast Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-yellow-200">
                <div className="flex items-start gap-3 border-b border-red-600 pb-3">
                  <TrendingUp className="w-5 h-5 text-green-400 mt-1" />
                  <div>
                    <p className="text-yellow-300">Peak Demand Window</p>
                    <p className="text-sm">
                      {highestForecast.month} has the highest forecast at {highestForecast.forecast.toLocaleString()} units with {highestForecast.confidence}% confidence.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-b border-red-600 pb-3">
                  <Package className="w-5 h-5 text-yellow-400 mt-1" />
                  <div>
                    <p className="text-yellow-300">Inventory Planning</p>
                    <p className="text-sm">
                      Use the product-level prediction table to prepare replenishment for months with rising demand.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Coins className="w-5 h-5 text-yellow-400 mt-1" />
                  <div>
                    <p className="text-yellow-300">Demand Outlook</p>
                    <p className="text-sm">
                      Expected total demand for the next 6 months: {totalForecastDemand.toLocaleString()} units with average {averageForecastConfidence}% confidence.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
