import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { BarChart3, TrendingUp, Coins, Package, Calendar, Download, FileText } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';

export function ReportsAnalytics() {
  const [timeRange, setTimeRange] = useState('30days');
  const [reportType, setReportType] = useState('overview');
  const [groupBy, setGroupBy] = useState('daily');
  const [compareMode, setCompareMode] = useState(false);

  // Sales trends data
  const salesTrends = [
    { id: 'st1', date: '2026-02-01', sales: 18500, revenue: 22400, customers: 142 },
    { id: 'st2', date: '2026-02-05', sales: 21200, revenue: 25800, customers: 168 },
    { id: 'st3', date: '2026-02-10', sales: 19800, revenue: 24100, customers: 156 },
    { id: 'st4', date: '2026-02-15', sales: 24500, revenue: 29600, customers: 189 },
    { id: 'st5', date: '2026-02-20', sales: 26800, revenue: 32400, customers: 201 },
    { id: 'st6', date: '2026-02-25', sales: 23400, revenue: 28200, customers: 178 },
    { id: 'st7', date: '2026-03-01', sales: 28200, revenue: 34100, customers: 215 },
    { id: 'st8', date: '2026-03-05', sales: 31500, revenue: 38000, customers: 234 },
  ];

  // Revenue performance by category
  const revenueByCategory = [
    { id: 'rc1', category: 'Running', revenue: 45600, percentage: 38, growth: 12.5 },
    { id: 'rc2', category: 'Casual', revenue: 32400, percentage: 27, growth: 8.3 },
    { id: 'rc3', category: 'Sports', revenue: 24800, percentage: 21, growth: 15.2 },
    { id: 'rc4', category: 'Lifestyle', revenue: 12200, percentage: 10, growth: 5.7 },
    { id: 'rc5', category: 'Formal', revenue: 4800, percentage: 4, growth: -2.3 },
  ];

  // Inventory turnover
  const inventoryTurnover = [
    { id: 'it1', month: 'Oct', turnover: 4.2, avgDays: 86 },
    { id: 'it2', month: 'Nov', turnover: 4.8, avgDays: 75 },
    { id: 'it3', month: 'Dec', turnover: 5.5, avgDays: 65 },
    { id: 'it4', month: 'Jan', turnover: 5.2, avgDays: 69 },
    { id: 'it5', month: 'Feb', turnover: 6.1, avgDays: 59 },
    { id: 'it6', month: 'Mar', turnover: 6.8, avgDays: 53 },
  ];

  // Promotion effectiveness
  const promotionEffectiveness = [
    { id: 'pe1', promotion: 'Spring Sale', revenue: 8450, roi: 245, conversion: 18.5 },
    { id: 'pe2', promotion: 'Weekend Special', revenue: 3200, roi: 178, conversion: 12.3 },
    { id: 'pe3', promotion: 'Flash Sale', revenue: 2890, roi: 156, conversion: 9.8 },
    { id: 'pe4', promotion: 'BOGO Casual', revenue: 5680, roi: 198, conversion: 15.2 },
  ];

  // Forecasted demand
  const forecastedDemand = [
    { id: 'fd1', month: 'Apr', forecast: 38500, confidence: 87 },
    { id: 'fd2', month: 'May', forecast: 42300, confidence: 85 },
    { id: 'fd3', month: 'Jun', forecast: 45800, confidence: 82 },
    { id: 'fd4', month: 'Jul', forecast: 41200, confidence: 80 },
    { id: 'fd5', month: 'Aug', forecast: 39600, confidence: 78 },
    { id: 'fd6', month: 'Sep', forecast: 43100, confidence: 81 },
  ];

  // Top performing products
  const topProducts = [
    { id: 'tp1', name: 'Nike Air Max 90', sales: 156, revenue: 18720, margin: 42 },
    { id: 'tp2', name: 'Adidas Ultraboost', sales: 142, revenue: 25560, margin: 38 },
    { id: 'tp3', name: 'Vans Old Skool', sales: 128, revenue: 8960, margin: 45 },
    { id: 'tp4', name: 'Puma Suede', sales: 115, revenue: 9775, margin: 40 },
    { id: 'tp5', name: 'New Balance 574', sales: 98, revenue: 9310, margin: 36 },
  ];

  const monthlyComparison = [
    { id: 'mc1', metric: 'Revenue', current: 38000, previous: 32400, change: 17.3 },
    { id: 'mc2', metric: 'Units Sold', current: 427, previous: 389, change: 9.8 },
    { id: 'mc3', metric: 'Avg Order Value', current: 89, previous: 83, change: 7.2 },
    { id: 'mc4', metric: 'Customer Count', current: 234, previous: 201, change: 16.4 },
  ];

  const categoryDistribution = [
    { id: 'cd1', name: 'Running', value: 38, color: '#fef08a' },
    { id: 'cd2', name: 'Casual', value: 27, color: '#facc15' },
    { id: 'cd3', name: 'Sports', value: 21, color: '#fde047' },
    { id: 'cd4', name: 'Lifestyle', value: 10, color: '#fef9c3' },
    { id: 'cd5', name: 'Formal', value: 4, color: '#fefce8' },
  ];

  const filteredSalesTrends = useMemo(() => {
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

    const grouped = new Map<string, { sales: number; revenue: number; customers: number }>();
    const makeLabel = (date: Date) => {
      if (groupBy === 'monthly') return date.toLocaleDateString('en-US', { month: 'short' });
      if (groupBy === 'weekly') return `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    salesTrends.forEach((row) => {
      const d = new Date(row.date);
      if (Number.isNaN(d.getTime()) || d < start || d > now) return;
      const key = makeLabel(d);
      const prev = grouped.get(key) ?? { sales: 0, revenue: 0, customers: 0 };
      grouped.set(key, {
        sales: prev.sales + row.sales,
        revenue: prev.revenue + row.revenue,
        customers: prev.customers + row.customers,
      });
    });

    return Array.from(grouped.entries()).map(([date, agg], idx) => ({
      id: `flt-${idx}`,
      date,
      sales: Math.round(agg.sales),
      revenue: Math.round(agg.revenue),
      customers: Math.round(agg.customers),
    }));
  }, [groupBy, salesTrends, timeRange]);

  const comparisonSalesTrends = useMemo(() => {
    if (!compareMode) return [];
    return filteredSalesTrends.map((row, idx) => ({
      id: `cmp-${idx}`,
      ...row,
      revenue: Math.round(row.revenue * 0.88),
      sales: Math.round(row.sales * 0.9),
    }));
  }, [compareMode, filteredSalesTrends]);

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

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: '7days', label: '7D' },
            { key: '30days', label: '30D' },
            { key: '90days', label: '90D' },
            { key: 'ytd', label: 'YTD' },
            { key: '12months', label: '1Y' },
          ].map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant="outline"
              onClick={() => setTimeRange(item.key)}
              className={
                timeRange === item.key
                  ? 'border-yellow-400 bg-yellow-400 text-red-900 hover:bg-yellow-500'
                  : 'border-red-800 bg-red-700 text-yellow-200 hover:bg-red-600'
              }
            >
              {item.label}
            </Button>
          ))}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40 bg-red-700 border-red-800 text-yellow-200">
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCompareMode((v) => !v)}
            className={
              compareMode
                ? 'border-yellow-400 bg-yellow-400 text-red-900 hover:bg-yellow-500'
                : 'border-red-800 bg-red-700 text-yellow-200 hover:bg-red-600'
            }
          >
            Compare
          </Button>
        </div>
        <Button onClick={handleExportReport} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
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
                <p className="text-2xl text-yellow-300">₱119.8K</p>
                <p className="text-xs text-green-400 mt-1">↑ 17.3% vs last period</p>
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
                <p className="text-2xl text-yellow-300">1,347</p>
                <p className="text-xs text-green-400 mt-1">↑ 9.8% vs last period</p>
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
                <p className="text-2xl text-yellow-300">6.8x</p>
                <p className="text-xs text-green-400 mt-1">↑ 11.5% improvement</p>
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
                <p className="text-2xl text-yellow-300">53</p>
                <p className="text-xs text-green-400 mt-1">↓ 6 days faster</p>
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
                  <Area key="sales-area" type="monotone" dataKey="sales" stroke="#fef08a" fillOpacity={1} fill="url(#colorSales)" name="Sales (PHP)" />
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
                        <p className="text-yellow-300 text-lg">{typeof item.current === 'number' && item.current > 100 ? `₱${item.current.toLocaleString()}` : item.current}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={item.change > 0 ? "bg-green-600 text-white" : "bg-red-900 text-yellow-200"}>
                          {item.change > 0 ? '↑' : '↓'} {Math.abs(item.change)}%
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
                        <p className="text-yellow-300">₱{product.revenue.toLocaleString()}</p>
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
                    <Bar key="revenue-bar" dataKey="revenue" fill="#fef08a" name="Revenue (₱)" />
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
                          {category.growth > 0 ? '↑' : '↓'} {Math.abs(category.growth)}%
                        </Badge>
                      </div>
                    </div>
                    <p className="text-yellow-300 text-lg">₱{category.revenue.toLocaleString()}</p>
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
                  <Bar key="promo-revenue-bar" dataKey="revenue" fill="#fef08a" name="Revenue (₱)" />
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
                        ₱{promo.revenue.toLocaleString()}
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
                  <Area key="forecast-area" type="monotone" dataKey="forecast" stroke="#facc15" fillOpacity={1} fill="url(#colorForecast)" name="Forecasted Revenue (₱)" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-6 gap-2">
                {forecastedDemand.map((item) => (
                  <div key={item.id} className="text-center">
                    <p className="text-yellow-200 text-sm">{item.month}</p>
                    <p className="text-yellow-300">₱{(item.forecast / 1000).toFixed(1)}K</p>
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
                    <p className="text-yellow-300">Peak Season Expected</p>
                    <p className="text-sm">June is forecasted to be the highest revenue month at ₱45.8K with 82% confidence.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-b border-red-600 pb-3">
                  <Package className="w-5 h-5 text-yellow-400 mt-1" />
                  <div>
                    <p className="text-yellow-300">Inventory Planning</p>
                    <p className="text-sm">Recommend increasing stock levels by 25% for Q2 based on predicted demand surge.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Coins className="w-5 h-5 text-yellow-400 mt-1" />
                  <div>
                    <p className="text-yellow-300">Revenue Outlook</p>
                    <p className="text-sm">Expected total revenue for next 6 months: ₱251,500 with average 83% confidence level.</p>
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
