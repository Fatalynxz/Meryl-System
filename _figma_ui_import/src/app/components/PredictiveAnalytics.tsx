import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Package, Calendar, ArrowUp, ArrowDown, Info } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { useProducts, useSales } from "../../lib/hooks";

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value || 0);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short" });
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Custom tooltip component for better readability
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-red-800 border border-yellow-400 rounded p-2">
        <p className="text-yellow-300 text-xs font-bold">{payload[0].payload.week || payload[0].name}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-xs">
            {entry.name}: {entry.value} units
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Bar chart with labels
const CustomBar = (props: any) => {
  const { fill, x, y, width, height, value } = props;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} />
      {value > 0 && (
        <text
          x={x + width / 2}
          y={y - 5}
          fill="#fef08a"
          textAnchor="middle"
          fontSize="12"
          fontWeight="bold"
        >
          {value}
        </text>
      )}
    </g>
  );
};

export function PredictiveAnalytics() {
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const [dateRange] = useState("30days"); // Can be extended to be dynamic

  const sales = (salesQuery.data as any[]) ?? [];
  const products = (productsQuery.data as any[]) ?? [];

  const {
    forecastAccuracy,
    predictedNextMonth,
    itemsNeedRestock,
    inventoryTurnover,
    salesForecast,
    demandTrends,
    demandTrendsTotal,
    fastMovingProducts,
    slowMovingProducts,
    restockingRecommendations,
  } = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const last30Start = new Date(now);
    last30Start.setDate(now.getDate() - 30);
    const last90Start = new Date(now);
    last90Start.setDate(now.getDate() - 90);

    const salesRows = sales
      .map((sale) => {
        const date = toDate(sale.transaction_date ?? sale.created_at);
        const amount = Number(sale.total_amount ?? 0);
        const payment = Array.isArray((sale as any).payment) ? (sale as any).payment[0] : (sale as any).payment;
        const status = String(payment?.payment_status ?? "").trim().toLowerCase();
        const isCompleted = status === "completed" || status === "paid";
        const details = Array.isArray((sale as any).sales_details) ? (sale as any).sales_details : [];
        return { date, amount, isCompleted, details };
      })
      .filter((row) => row.date && row.isCompleted) as Array<{
      date: Date;
      amount: number;
      isCompleted: boolean;
      details: any[];
    }>;

    const monthlyActualMap = new Map<string, number>();
    salesRows.forEach((row) => {
      const key = monthKey(row.date);
      monthlyActualMap.set(key, (monthlyActualMap.get(key) ?? 0) + row.amount);
    });

    const recentMonths: Date[] = [];
    for (let i = 2; i >= 0; i -= 1) {
      recentMonths.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }

    const last3Actual = recentMonths.map((d) => monthlyActualMap.get(monthKey(d)) ?? 0);
    const growthRates: number[] = [];
    for (let i = 1; i < last3Actual.length; i += 1) {
      const prev = last3Actual[i - 1];
      const curr = last3Actual[i];
      if (prev > 0) growthRates.push((curr - prev) / prev);
    }
    const avgGrowth = growthRates.length > 0 ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0.05;
    const boundedGrowth = Math.max(-0.2, Math.min(0.4, avgGrowth));

    const forecastMonths: Date[] = [];
    for (let i = 0; i < 6; i += 1) {
      forecastMonths.push(new Date(now.getFullYear(), now.getMonth() - 2 + i, 1));
    }

    let rollingForecastBase = last3Actual[last3Actual.length - 1] || 0;
    const confidenceLevels = [94, 92, 90, 87, 84, 82];
    const forecastData = forecastMonths.map((month, idx) => {
      const key = monthKey(month);
      const actual = monthlyActualMap.get(key);
      const isFuture = month >= currentMonthStart;
      if (isFuture) {
        rollingForecastBase = Math.round(rollingForecastBase * (1 + boundedGrowth));
      }
      const predicted = isFuture ? rollingForecastBase : Math.round((actual ?? 0) * (1 + boundedGrowth * 0.4));
      return {
        id: key,
        month: monthLabel(month),
        actual: actual ?? null,
        predicted,
        confidence: confidenceLevels[idx] ?? 80,
      };
    });

    const predictedNext = forecastData.find((f) => monthKey(nextMonth) === f.id)?.predicted ?? rollingForecastBase;

    const salesDetails30 = salesRows
      .filter((row) => row.date >= last30Start)
      .flatMap((row) =>
        row.details.map((d: any) => ({
          productId: d.product_id,
          qty: Number(d.quantity ?? 0),
          subtotal: Number(d.subtotal ?? 0),
          product: Array.isArray(d.product) ? d.product[0] : d.product,
        })),
      );

    const salesDetails90 = salesRows
      .filter((row) => row.date >= last90Start)
      .flatMap((row) =>
        row.details.map((d: any) => ({
          productId: d.product_id,
          qty: Number(d.quantity ?? 0),
          product: Array.isArray(d.product) ? d.product[0] : d.product,
          saleDate: row.date,
        })),
      );

    const weeklyBuckets: Array<{ id: string; week: string; running: number; casual: number; sports: number; formal: number }> = [];
    for (let i = 3; i >= 0; i -= 1) {
      const end = new Date(now);
      end.setDate(now.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      const bucket = { id: `w${4 - i}`, week: `Week ${4 - i}`, running: 0, casual: 0, sports: 0, formal: 0 };
      salesDetails90.forEach((item) => {
        if (item.saleDate < start || item.saleDate > end) return;
        const rawCategory = String(item.product?.category?.[0]?.category_name ?? item.product?.category_name ?? "").toLowerCase();
        if (rawCategory.includes("running")) bucket.running += item.qty;
        else if (rawCategory.includes("casual")) bucket.casual += item.qty;
        else if (rawCategory.includes("sport")) bucket.sports += item.qty;
        else bucket.formal += item.qty;
      });
      weeklyBuckets.push(bucket);
    }

    // Calculate total units sold in each category
    const totalRunning = weeklyBuckets.reduce((sum, w) => sum + w.running, 0);
    const totalCasual = weeklyBuckets.reduce((sum, w) => sum + w.casual, 0);
    const totalSports = weeklyBuckets.reduce((sum, w) => sum + w.sports, 0);
    const totalFormal = weeklyBuckets.reduce((sum, w) => sum + w.formal, 0);
    const grandTotal = totalRunning + totalCasual + totalSports + totalFormal;

    const productStats = new Map<string, { name: string; category: string; sold: number; revenue: number }>();
    salesDetails30.forEach((item) => {
      const key = String(item.productId ?? "");
      if (!key) return;
      const name = String(item.product?.product_name ?? "Unknown Product");
      const category = String(item.product?.category?.[0]?.category_name ?? item.product?.category_name ?? "Uncategorized");
      const prev = productStats.get(key) ?? { name, category, sold: 0, revenue: 0 };
      productStats.set(key, {
        name,
        category,
        sold: prev.sold + item.qty,
        revenue: prev.revenue + item.subtotal,
      });
    });

    const statsList = Array.from(productStats.entries()).map(([id, s]) => {
      const velocity = s.sold / 30;
      return {
        id,
        name: s.name,
        category: s.category,
        sold: s.sold,
        trend: velocity >= 1 ? "up" : "stable",
        velocity,
        forecastNext30: Math.round(s.sold * (1 + Math.max(0.05, boundedGrowth))),
      };
    });

    const fast = [...statsList].sort((a, b) => b.sold - a.sold).slice(0, 5);
    const slow = [...statsList]
      .filter((p) => p.sold > 0)
      .sort((a, b) => a.sold - b.sold)
      .slice(0, 5)
      .map((p) => {
        const daysInStock = p.velocity > 0 ? Math.min(180, Math.round((p.sold + 1) / p.velocity)) : 180;
        const recommendation =
          p.sold <= 2 ? "Bundle Offer" : p.sold <= 5 ? "Discount 15%" : "Promote";
        return { ...p, daysInStock, recommendation, trend: "down" as const };
      });

    const restockRows = products
      .map((p) => {
        const inventory = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
        const stock = Number(inventory?.stock_quantity ?? 0);
        const reorder = Number(p.reorder_level ?? inventory?.reorder_level ?? 10);
        const pid = String(p.product_id ?? "");
        const sold30 = statsList.find((s) => s.id === pid)?.sold ?? 0;
        const velocity = sold30 / 30;
        const daysUntilStockout = velocity > 0 ? Math.max(1, Math.floor(stock / velocity)) : 999;
        const recommendedStock = Math.max(reorder * 2, Math.round(velocity * 30));
        const orderQuantity = Math.max(0, recommendedStock - stock);
        let urgency = "low";
        if (stock <= reorder || daysUntilStockout <= 7) urgency = "high";
        else if (daysUntilStockout <= 14) urgency = "medium";
        return {
          id: pid || String(Math.random()),
          product: String(p.product_name ?? "Unknown Product"),
          currentStock: stock,
          recommendedStock,
          urgency,
          daysUntilStockout,
          orderQuantity,
        };
      })
      .filter((r) => r.orderQuantity > 0 && r.urgency !== "low")
      .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
      .slice(0, 8);

    const totalStock = products.reduce((sum, p) => {
      const inventory = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
      return sum + Number(inventory?.stock_quantity ?? 0);
    }, 0);
    const sold90 = salesDetails90.reduce((sum, row) => sum + row.qty, 0);
    const turnover = totalStock > 0 ? (sold90 / 90) * (30 / Math.max(1, totalStock / products.length || 1)) : 0;
    const turnoverDisplay = Math.max(0, turnover);

    const historicalAccuracy = forecastData
      .filter((f) => f.actual && f.predicted > 0)
      .map((f) => {
        const actual = Number(f.actual ?? 0);
        const predicted = Number(f.predicted ?? 0);
        return 100 - (Math.abs(actual - predicted) / actual) * 100;
      });
    const accuracy = historicalAccuracy.length
      ? historicalAccuracy.reduce((a, b) => a + b, 0) / historicalAccuracy.length
      : 85;

    return {
      forecastAccuracy: Math.max(0, Math.min(99.9, accuracy)),
      predictedNextMonth: predictedNext,
      itemsNeedRestock: restockRows.length,
      inventoryTurnover: turnoverDisplay,
      salesForecast: forecastData,
      demandTrends: weeklyBuckets,
      demandTrendsTotal: { running: totalRunning, casual: totalCasual, sports: totalSports, formal: totalFormal, grand: grandTotal },
      fastMovingProducts: fast,
      slowMovingProducts: slow,
      restockingRecommendations: restockRows,
    };
  }, [products, sales]);

  if (salesQuery.isLoading || productsQuery.isLoading) {
    return <div className="text-sm text-white/60">Loading analytics...</div>;
  }

  const getVelocityColor = (velocity: number) => {
    if (velocity >= 1) return "bg-green-600";
    if (velocity >= 0.5) return "bg-yellow-600";
    return "bg-orange-600";
  };

  const getDaysColor = (days: number) => {
    if (days <= 30) return "bg-red-600";
    if (days <= 90) return "bg-yellow-600";
    return "bg-green-600";
  };

  const getSummaryColor = (value: number, total: number) => {
    const percentage = (value / total) * 100;
    if (percentage > 35) return "bg-green-600";
    if (percentage > 20) return "bg-yellow-600";
    return "bg-orange-600";
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Forecast Accuracy</p>
                <p className="text-2xl font-bold text-yellow-300">{forecastAccuracy.toFixed(1)}%</p>
                <p className="text-xs text-yellow-300/60 mt-1">Model confidence level</p>
              </div>
              <CheckCircle className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Predicted Next Month</p>
                <p className="text-2xl font-bold text-yellow-300">{formatPeso(predictedNextMonth / 1000)}K</p>
                <p className="text-xs text-yellow-300/60 mt-1">Est. revenue</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Restock Alerts</p>
                <p className="text-2xl font-bold text-yellow-300">{itemsNeedRestock}</p>
                <p className="text-xs text-yellow-300/60 mt-1">Items running low</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Inventory Turnover</p>
                <p className="text-2xl font-bold text-yellow-300">{inventoryTurnover.toFixed(1)}x</p>
                <p className="text-xs text-yellow-300/60 mt-1">Per month</p>
              </div>
              <Package className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Forecast */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <CardTitle className="text-yellow-300 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Sales Forecast - Next 6 Months
          </CardTitle>
          <p className="text-xs text-yellow-300/60 mt-2">Actual vs Predicted Sales Trend</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesForecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
              <XAxis dataKey="month" stroke="#fef08a" />
              <YAxis stroke="#fef08a" />
              <Tooltip contentStyle={{ backgroundColor: "#991b1b", border: "1px solid #7f1d1d", color: "#fef08a" }} />
              <Legend wrapperStyle={{ color: "#fef08a" }} />
              <Line key="actual-line" type="monotone" dataKey="actual" stroke="#fef08a" strokeWidth={2} name="Actual Sales (PHP)" />
              <Line key="predicted-line" type="monotone" dataKey="predicted" stroke="#facc15" strokeWidth={2} strokeDasharray="5 5" name="Predicted Sales (PHP)" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-6 gap-2">
            {salesForecast.map((item) => (
              <div key={item.id} className="text-center">
                <p className="text-yellow-200 text-xs font-semibold">{item.month}</p>
                <Badge className="bg-yellow-400 text-red-900 text-xs">{item.confidence}% Confidence</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Product Demand Trends */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Product Demand Trends by Category
              </CardTitle>
              <p className="text-xs text-yellow-300/60 mt-2">Compare sales performance across categories over 4 weeks</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={demandTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
              <XAxis dataKey="week" stroke="#fef08a" />
              <YAxis stroke="#fef08a" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ color: "#fef08a" }} />
              <Bar dataKey="running" fill="#fef08a" name="Running Shoes" shape={<CustomBar />} />
              <Bar dataKey="casual" fill="#facc15" name="Casual Shoes" shape={<CustomBar />} />
              <Bar dataKey="sports" fill="#fde047" name="Sports Shoes" shape={<CustomBar />} />
              <Bar dataKey="formal" fill="#fef9c3" name="Formal / Other" shape={<CustomBar />} />
            </BarChart>
          </ResponsiveContainer>

          {/* Category Breakdown Summary */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-red-800 rounded p-3">
              <p className="text-xs text-yellow-300/60 font-semibold">Running Shoes</p>
              <p className="text-lg font-bold text-yellow-300">{demandTrendsTotal.running}</p>
              <div className="mt-1 flex items-center gap-2">
                <div className={`h-2 flex-1 rounded ${getSummaryColor(demandTrendsTotal.running, demandTrendsTotal.grand)}`}></div>
                <span className="text-xs text-yellow-300/60">{demandTrendsTotal.grand > 0 ? ((demandTrendsTotal.running / demandTrendsTotal.grand) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
            <div className="bg-red-800 rounded p-3">
              <p className="text-xs text-yellow-300/60 font-semibold">Casual Shoes</p>
              <p className="text-lg font-bold text-yellow-300">{demandTrendsTotal.casual}</p>
              <div className="mt-1 flex items-center gap-2">
                <div className={`h-2 flex-1 rounded ${getSummaryColor(demandTrendsTotal.casual, demandTrendsTotal.grand)}`}></div>
                <span className="text-xs text-yellow-300/60">{demandTrendsTotal.grand > 0 ? ((demandTrendsTotal.casual / demandTrendsTotal.grand) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
            <div className="bg-red-800 rounded p-3">
              <p className="text-xs text-yellow-300/60 font-semibold">Sports Shoes</p>
              <p className="text-lg font-bold text-yellow-300">{demandTrendsTotal.sports}</p>
              <div className="mt-1 flex items-center gap-2">
                <div className={`h-2 flex-1 rounded ${getSummaryColor(demandTrendsTotal.sports, demandTrendsTotal.grand)}`}></div>
                <span className="text-xs text-yellow-300/60">{demandTrendsTotal.grand > 0 ? ((demandTrendsTotal.sports / demandTrendsTotal.grand) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
            <div className="bg-red-800 rounded p-3">
              <p className="text-xs text-yellow-300/60 font-semibold">Formal / Other</p>
              <p className="text-lg font-bold text-yellow-300">{demandTrendsTotal.formal}</p>
              <div className="mt-1 flex items-center gap-2">
                <div className={`h-2 flex-1 rounded ${getSummaryColor(demandTrendsTotal.formal, demandTrendsTotal.grand)}`}></div>
                <span className="text-xs text-yellow-300/60">{demandTrendsTotal.grand > 0 ? ((demandTrendsTotal.formal / demandTrendsTotal.grand) * 100).toFixed(0) : 0}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fast vs Slow Moving Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fast-Moving Products */}
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <ArrowUp className="w-5 h-5 text-green-400" />
                Fast-Moving Products
              </CardTitle>
              <Badge className="bg-green-600 text-white">{fastMovingProducts.length} Products</Badge>
            </div>
            <p className="text-xs text-yellow-300/60 mt-2">High-velocity items selling well - Keep stock levels high</p>
          </CardHeader>
          <CardContent>
            <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                    <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap text-center">Units Sold (30d)</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap text-center">Daily Rate</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap text-center">30d Forecast</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fastMovingProducts.map((product, idx) => (
                    <TableRow key={product.id} className="border-red-800 hover:bg-red-600/30">
                      <TableCell className="min-w-[140px]">
                        <div>
                          <p className="text-yellow-200 whitespace-nowrap font-semibold flex items-center gap-2">
                            {idx + 1}. {product.name}
                          </p>
                          <p className="text-yellow-300 text-xs whitespace-nowrap mt-1">{product.category}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <ArrowUp className="w-4 h-4 text-green-400" />
                          <span className="text-yellow-300 font-bold">{product.sold}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${getVelocityColor(product.velocity)} text-white text-xs`}>
                          {product.velocity.toFixed(2)}/day
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-yellow-300 font-semibold">{product.forecastNext30} units</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 p-3 bg-green-700/20 border border-green-600/30 rounded text-xs text-yellow-300">
              💡 <span className="font-semibold">Tip:</span> Ensure adequate inventory levels for these bestsellers to avoid stockouts.
            </div>
          </CardContent>
        </Card>

        {/* Slow-Moving Products */}
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <ArrowDown className="w-5 h-5 text-orange-400" />
                Slow-Moving Products
              </CardTitle>
              <Badge className="bg-orange-600 text-white">{slowMovingProducts.length} Products</Badge>
            </div>
            <p className="text-xs text-yellow-300/60 mt-2">Low-velocity items - Consider promotions or markdowns</p>
          </CardHeader>
          <CardContent>
            <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
              <Table className="w-full text-sm">
                <TableHeader>
                  <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                    <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap text-center">Units (30d)</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap text-center">Days in Stock</TableHead>
                    <TableHead className="text-yellow-300 whitespace-nowrap text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slowMovingProducts.map((product, idx) => (
                    <TableRow key={product.id} className="border-red-800 hover:bg-red-600/30">
                      <TableCell className="min-w-[140px]">
                        <div>
                          <p className="text-yellow-200 whitespace-nowrap font-semibold flex items-center gap-2">
                            {idx + 1}. {product.name}
                          </p>
                          <p className="text-yellow-300 text-xs whitespace-nowrap mt-1">{product.category}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <ArrowDown className="w-4 h-4 text-orange-400" />
                          <span className="text-yellow-300 font-bold">{product.sold}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${getDaysColor(product.daysInStock)} text-white text-xs`}>
                          {product.daysInStock}d
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="bg-yellow-400 text-red-900 hover:bg-yellow-500 text-xs font-bold px-3">
                          {product.recommendation}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 p-3 bg-orange-700/20 border border-orange-600/30 rounded text-xs text-yellow-300">
              💡 <span className="font-semibold">Tip:</span> Apply promotional strategies to move inventory and free up capital.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
