import { useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { AlertTriangle, BarChart3, Package, Sparkles, TrendingDown, TrendingUp, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCustomers, useProducts, useSales } from "../../lib/hooks";

type RevenueTrendPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annually";

const revenueTrendOptions: Array<{ id: RevenueTrendPeriod; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annually", label: "Annually" },
];

function money(value: number) {
  return `PHP ${Math.round(value || 0).toLocaleString("en-PH")}`;
}

function shortMoney(value: number) {
  if (value >= 1000000) return `PHP ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `PHP ${(value / 1000).toFixed(1)}K`;
  return money(value);
}

function toDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getOne(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getQuarter(date: Date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function getCategory(product: any) {
  const category = getOne(product?.category);
  return String(product?.category_name ?? category?.category_name ?? "Uncategorized");
}

function getInventory(product: any) {
  return getOne(product?.inventory) ?? {};
}

function getStock(product: any) {
  const inventory = getInventory(product);
  return Number(inventory?.stock_quantity ?? product?.stock_quantity ?? 0);
}

function getReorder(product: any) {
  const inventory = getInventory(product);
  return Number(inventory?.reorder_level ?? product?.reorder_level ?? 0);
}

function getPrice(product: any, detail?: any) {
  const inventory = getInventory(product);
  return Number(inventory?.srp ?? product?.srp ?? detail?.price ?? product?.selling_price ?? product?.unit_price ?? product?.cost_price ?? 0);
}

function isCompletedSale(sale: any) {
  const payment = getOne(sale?.payment);
  const paymentStatus = String(payment?.payment_status ?? sale?.payment_status ?? "completed").toLowerCase();
  const saleStatus = String(sale?.sales_status ?? sale?.status ?? "completed").toLowerCase();
  return !["cancelled", "canceled", "fully returned"].includes(saleStatus) &&
    ["completed", "paid", "success", "successful"].includes(paymentStatus);
}

function getSaleAmount(sale: any) {
  return Number(sale?.adjusted_total_amount ?? sale?.total_amount ?? sale?.original_total_amount ?? 0);
}

function getCustomerGender(customer: any) {
  const raw = String(customer?.gender ?? customer?.customer_gender ?? customer?.sex ?? "Unknown").trim();
  if (!raw) return "Unknown";
  const normalized = raw.toLowerCase();
  if (normalized.includes("men") || normalized === "male" || normalized === "m") return "Men";
  if (normalized.includes("women") || normalized === "female" || normalized === "f") return "Women";
  if (normalized.includes("boy")) return "Kids (Boy)";
  if (normalized.includes("girl")) return "Kids (Girl)";
  if (normalized.includes("kid") || normalized.includes("child")) return "Kids";
  return raw;
}

function getCustomerAge(customer: any) {
  const direct = Number(customer?.age ?? customer?.customer_age);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const birthDate = toDate(customer?.birthdate ?? customer?.birth_date ?? customer?.date_of_birth);
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

function getAgeRange(customer: any) {
  const existing = String(customer?.age_range ?? "").trim();
  if (existing) return existing;
  const age = getCustomerAge(customer);
  if (!age) return "Unknown Age";
  if (age <= 12) return "Kids 12 below";
  if (age <= 17) return "Teens 13-17";
  if (age <= 24) return "Young Adults 18-24";
  if (age <= 34) return "Adults 25-34";
  if (age <= 44) return "Adults 35-44";
  if (age <= 59) return "Adults 45-59";
  return "Seniors 60+";
}

function movementBadgeClass(movement: string) {
  if (movement === "Fast") return "bg-green-600 text-white";
  if (movement === "Slow") return "bg-orange-500 text-white";
  if (movement === "Dead Stock") return "bg-red-700 text-white";
  return "bg-yellow-400 text-red-950";
}

function stockBadgeClass(stock: number, reorder: number) {
  if (stock <= 0) return "bg-red-700 text-white";
  if (reorder > 0 && stock <= reorder) return "bg-orange-500 text-white";
  if (reorder > 0 && stock <= reorder * 1.5) return "bg-yellow-400 text-red-950";
  return "bg-green-700 text-white";
}

function MetricCard({ title, value, note, icon: Icon }: { title: string; value: string; note: string; icon: any }) {
  return (
    <Card className="bg-[#16161d] border-[#2b2b36]">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white/75">{title}</p>
            <p className="mt-2 text-3xl font-bold text-white">{value}</p>
            <p className="mt-2 text-xs text-emerald-300">{note}</p>
          </div>
          <div className="rounded-2xl bg-yellow-400/10 p-3">
            <Icon className="h-8 w-8 text-yellow-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PredictiveAnalytics() {
  const [analyticsView, setAnalyticsView] = useState<"overview" | "product" | "customer" | "sales">("overview");
  const [revenueTrendPeriod, setRevenueTrendPeriod] = useState<RevenueTrendPeriod>("daily");
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const customersQuery = useCustomers();

  const sales = ((salesQuery.data as any[]) ?? []).filter(isCompletedSale);
  const products = (productsQuery.data as any[]) ?? [];
  const customers = (customersQuery.data as any[]) ?? [];

  const analytics = useMemo(() => {
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    const last90 = new Date(now);
    last90.setDate(now.getDate() - 90);

    const customerMap = new Map(customers.map((customer: any) => [String(customer.customer_id ?? ""), customer]));
    const productMap = new Map(products.map((product: any) => [String(product.product_id ?? ""), product]));

    const productStats = new Map<string, any>();
    const categoryStats = new Map<string, any>();
    const brandStats = new Map<string, any>();
    const sizeStats = new Map<string, any>();
    const customerSegments = new Map<string, any>();
    const genderSegments = new Map<string, any>();
    const ageSegments = new Map<string, any>();
    const dailySales = new Map<string, { date: Date; revenue: number; units: number }>();

    products.forEach((product: any) => {
      const id = String(product.product_id ?? "");
      if (!id) return;
      productStats.set(id, {
        id,
        name: String(product.product_name ?? "Unknown Product"),
        brand: String(product.brand ?? "N/A"),
        category: getCategory(product),
        size: String(product.size ?? "N/A"),
        gender: String(product.gender ?? "N/A"),
        stock: getStock(product),
        reorder: getReorder(product),
        price: getPrice(product),
        units30: 0,
        units90: 0,
        revenue30: 0,
        revenue90: 0,
      });
    });

    sales.forEach((sale: any) => {
      const date = toDate(sale.transaction_date ?? sale.created_at);
      if (!date) return;
      const in30 = date >= last30;
      const in90 = date >= last90;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      const customer = getOne(sale.customer) ?? customerMap.get(String(sale.customer_id ?? ""));
      const gender = getCustomerGender(customer);
      const ageRange = getAgeRange(customer);
      const segmentKey = `${gender} / ${ageRange}`;
      const segment = customerSegments.get(segmentKey) ?? {
        segment: segmentKey,
        gender,
        ageRange,
        customers: new Set<string>(),
        orders: 0,
        units: 0,
        revenue: 0,
        topCategories: new Map<string, number>(),
      };

      if (customer?.customer_id) segment.customers.add(String(customer.customer_id));
      segment.orders += 1;
      segment.revenue += getSaleAmount(sale);

      const genderSegment = genderSegments.get(gender) ?? {
        label: gender,
        customers: new Set<string>(),
        orders: 0,
        units: 0,
        revenue: 0,
        topCategories: new Map<string, number>(),
      };
      const ageSegment = ageSegments.get(ageRange) ?? {
        label: ageRange,
        customers: new Set<string>(),
        orders: 0,
        units: 0,
        revenue: 0,
        topCategories: new Map<string, number>(),
      };
      if (customer?.customer_id) {
        genderSegment.customers.add(String(customer.customer_id));
        ageSegment.customers.add(String(customer.customer_id));
      }
      genderSegment.orders += 1;
      genderSegment.revenue += getSaleAmount(sale);
      ageSegment.orders += 1;
      ageSegment.revenue += getSaleAmount(sale);

      const dayKey = date.toISOString().slice(0, 10);
      const day = dailySales.get(dayKey) ?? { date, revenue: 0, units: 0 };
      day.revenue += getSaleAmount(sale);

      details.forEach((detail: any) => {
        const product = getOne(detail.product) ?? productMap.get(String(detail.product_id ?? ""));
        const id = String(detail.product_id ?? product?.product_id ?? "");
        const qty = Number(detail.quantity ?? 0);
        const revenue = Number(detail.subtotal ?? detail.price * qty ?? 0);
        const category = getCategory(product);
        const brand = String(product?.brand ?? "N/A");
        const size = String(product?.size ?? "N/A");

        day.units += qty;
        segment.units += qty;
        segment.topCategories.set(category, (segment.topCategories.get(category) ?? 0) + qty);
        genderSegment.units += qty;
        ageSegment.units += qty;
        genderSegment.topCategories.set(category, (genderSegment.topCategories.get(category) ?? 0) + qty);
        ageSegment.topCategories.set(category, (ageSegment.topCategories.get(category) ?? 0) + qty);

        if (id) {
          const prev = productStats.get(id) ?? {
            id,
            name: String(product?.product_name ?? "Unknown Product"),
            brand,
            category,
            size,
            gender: String(product?.gender ?? "N/A"),
            stock: getStock(product),
            reorder: getReorder(product),
            price: getPrice(product, detail),
            units30: 0,
            units90: 0,
            revenue30: 0,
            revenue90: 0,
          };
          if (in30) {
            prev.units30 += qty;
            prev.revenue30 += revenue;
          }
          if (in90) {
            prev.units90 += qty;
            prev.revenue90 += revenue;
          }
          productStats.set(id, prev);
        }

        const categoryPrev = categoryStats.get(category) ?? { name: category, units: 0, revenue: 0 };
        const brandPrev = brandStats.get(brand) ?? { name: brand, units: 0, revenue: 0 };
        const sizePrev = sizeStats.get(size) ?? { name: size, units: 0, revenue: 0 };
        if (in90) {
          categoryPrev.units += qty;
          categoryPrev.revenue += revenue;
          brandPrev.units += qty;
          brandPrev.revenue += revenue;
          sizePrev.units += qty;
          sizePrev.revenue += revenue;
        }
        categoryStats.set(category, categoryPrev);
        brandStats.set(brand, brandPrev);
        sizeStats.set(size, sizePrev);
      });

      dailySales.set(dayKey, day);
      customerSegments.set(segmentKey, segment);
      genderSegments.set(gender, genderSegment);
      ageSegments.set(ageRange, ageSegment);
    });

    const productRows = Array.from(productStats.values());
    const avgUnits30 = productRows.length
      ? productRows.reduce((sum, product) => sum + product.units30, 0) / productRows.length
      : 0;

    const productMovement = productRows
      .map((product) => {
        const averageStock = Math.max(1, (Number(product.stock) + Number(product.units90)) / 2);
        const turnover = Number(product.units90) / averageStock;
        const movement = product.units30 === 0
          ? "Dead Stock"
          : product.units30 >= Math.max(3, avgUnits30 * 1.3)
            ? "Fast"
            : product.units30 <= Math.max(1, avgUnits30 * 0.5)
              ? "Slow"
              : "Steady";
        const stockCondition = product.stock <= 0
          ? "Out of Stock"
          : product.reorder > 0 && product.stock <= product.reorder
            ? "Critical"
            : product.reorder > 0 && product.stock <= product.reorder * 1.5
              ? "Warning"
              : "Good";
        return { ...product, turnover, movement, stockCondition };
      })
      .sort((a, b) => b.units30 - a.units30 || b.stock - a.stock);

    const totalUnits90 = productMovement.reduce((sum, product) => sum + product.units90, 0);
    const totalStock = productMovement.reduce((sum, product) => sum + product.stock, 0);
    const avgInventory = Math.max(1, (totalStock + totalUnits90) / 2);
    const inventoryTurnover = totalUnits90 / avgInventory;

    const restockAlerts = productMovement
      .filter((product) => product.stock <= product.reorder || product.stock <= 0)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 6);

    const overstockSlowMovers = productMovement
      .filter((product) => ["Slow", "Dead Stock"].includes(product.movement) && product.stock > Math.max(5, product.reorder))
      .slice(0, 6);

    const dailyRows = Array.from(dailySales.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    const last30Days = dailyRows.filter((row) => row.date >= last30);
    const revenue30 = last30Days.reduce((sum, row) => sum + row.revenue, 0);
    const activeSalesDays = Math.max(1, last30Days.length);
    const predictedNextMonth = Math.round((revenue30 / activeSalesDays) * 30);
    const projectedUnits = Math.round((last30Days.reduce((sum, row) => sum + row.units, 0) / activeSalesDays) * 30);

    const trendStart = new Date(now);
    if (revenueTrendPeriod === "daily") trendStart.setDate(now.getDate() - 30);
    if (revenueTrendPeriod === "weekly") trendStart.setDate(now.getDate() - 84);
    if (revenueTrendPeriod === "monthly") trendStart.setMonth(now.getMonth() - 11);
    if (revenueTrendPeriod === "quarterly") trendStart.setMonth(now.getMonth() - 21);
    if (revenueTrendPeriod === "annually") trendStart.setFullYear(now.getFullYear() - 4);
    trendStart.setHours(0, 0, 0, 0);

    const trendBuckets = new Map<string, { key: string; date: Date; label: string; revenue: number; units: number }>();
    dailyRows
      .filter((row) => row.date >= trendStart)
      .forEach((row) => {
        let key = row.date.toISOString().slice(0, 10);
        let label = formatShortDate(row.date);
        let bucketDate = new Date(row.date);

        if (revenueTrendPeriod === "weekly") {
          bucketDate = startOfWeek(row.date);
          const weekEnd = addDays(bucketDate, 6);
          key = bucketDate.toISOString().slice(0, 10);
          label = `${formatShortDate(bucketDate)}-${formatShortDate(weekEnd)}`;
        } else if (revenueTrendPeriod === "monthly") {
          bucketDate = new Date(row.date.getFullYear(), row.date.getMonth(), 1);
          key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
          label = row.date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        } else if (revenueTrendPeriod === "quarterly") {
          const quarter = getQuarter(row.date);
          bucketDate = new Date(row.date.getFullYear(), (quarter - 1) * 3, 1);
          key = `${row.date.getFullYear()}-Q${quarter}`;
          label = `Q${quarter} ${row.date.getFullYear()}`;
        } else if (revenueTrendPeriod === "annually") {
          bucketDate = new Date(row.date.getFullYear(), 0, 1);
          key = String(row.date.getFullYear());
          label = String(row.date.getFullYear());
        }

        const bucket = trendBuckets.get(key) ?? { key, date: bucketDate, label, revenue: 0, units: 0 };
        bucket.revenue += row.revenue;
        bucket.units += row.units;
        trendBuckets.set(key, bucket);
      });

    const trendChart = Array.from(trendBuckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((row) => ({
        date: row.label,
        revenue: Math.round(row.revenue),
        units: row.units,
      }));

    const categoryChart = Array.from(categoryStats.values())
      .sort((a, b) => b.units - a.units)
      .slice(0, 5)
      .map((row, index) => ({ ...row, fill: ["#facc15", "#fde047", "#fef08a", "#fbbf24", "#fef9c3"][index] }));

    const segmentRows = Array.from(customerSegments.values())
      .map((segment) => {
        const topCategory = Array.from(segment.topCategories.entries()).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] ?? "N/A";
        return {
          segment: segment.segment,
          gender: segment.gender,
          ageRange: segment.ageRange,
          customers: segment.customers.size,
          orders: segment.orders,
          units: segment.units,
          revenue: segment.revenue,
          topCategory,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const formatCustomerSegment = (segment: any) => {
      const topCategory = Array.from(segment.topCategories.entries()).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] ?? "N/A";
      return {
        label: segment.label,
        customers: segment.customers.size,
        orders: segment.orders,
        units: segment.units,
        revenue: segment.revenue,
        topCategory,
      };
    };

    const isKnownGender = (label: string) => !["unknown", "n/a", "none"].includes(String(label).trim().toLowerCase());
    const isKnownAgeRange = (label: string) => !["unknown age", "unknown", "n/a", "none"].includes(String(label).trim().toLowerCase());

    const genderRows = Array.from(genderSegments.values())
      .map(formatCustomerSegment)
      .filter((row) => isKnownGender(row.label))
      .sort((a, b) => b.revenue - a.revenue);
    const ageRows = Array.from(ageSegments.values())
      .map(formatCustomerSegment)
      .filter((row) => isKnownAgeRange(row.label))
      .sort((a, b) => b.revenue - a.revenue);

    const topBrands = Array.from(brandStats.values()).sort((a, b) => b.units - a.units).slice(0, 5);
    const topSizes = Array.from(sizeStats.values()).sort((a, b) => b.units - a.units).slice(0, 5);
    const topCategories = Array.from(categoryStats.values()).sort((a, b) => b.units - a.units).slice(0, 5);

    const promotionSuggestions = [
      ...overstockSlowMovers.slice(0, 3).map((product) => ({
        title: `Markdown ${product.name}`,
        target: `${product.brand} ${product.category}`,
        reason: `${product.movement} with ${product.stock} units on hand and only ${product.units30} sold in 30 days.`,
        action: product.units30 === 0 ? "Bundle or BOGO" : "10%-15% discount",
      })),
      ...restockAlerts.slice(0, 2).map((product) => ({
        title: `Protect stock for ${product.name}`,
        target: `${product.brand} size ${product.size}`,
        reason: `${product.stockCondition}: ${product.stock} units left vs reorder level ${product.reorder}.`,
        action: "Restock before promoting",
      })),
    ].slice(0, 5);

    return {
      productMovement,
      fastProducts: productMovement.filter((product) => product.movement === "Fast").slice(0, 5),
      slowProducts: productMovement.filter((product) => ["Slow", "Dead Stock"].includes(product.movement)).slice(0, 5),
      restockAlerts,
      inventoryTurnover,
      predictedNextMonth,
      projectedUnits,
      trendChart,
      categoryChart,
      segmentRows,
      genderRows,
      ageRows,
      topBrands,
      topSizes,
      topCategories,
      promotionSuggestions,
      revenue30,
      totalUnits90,
    };
  }, [customers, products, revenueTrendPeriod, sales]);

  if (salesQuery.isLoading || productsQuery.isLoading || customersQuery.isLoading) {
    return <div className="text-sm text-white/60">Loading analytics...</div>;
  }

  const showOverview = analyticsView === "overview";
  const showProduct = analyticsView === "overview" || analyticsView === "product";
  const showCustomer = analyticsView === "overview" || analyticsView === "customer";
  const showSales = analyticsView === "overview" || analyticsView === "sales";

  const filterTabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart3, count: null },
    { id: "product" as const, label: "Product Analytics", icon: Package, count: analytics.productMovement.length },
    { id: "customer" as const, label: "Customer Analytics", icon: Users, count: analytics.genderRows.length + analytics.ageRows.length },
    { id: "sales" as const, label: "Sales Analytics", icon: TrendingUp, count: analytics.trendChart.length },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#2b2b36] bg-[#16161d] p-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = analyticsView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAnalyticsView(tab.id)}
                className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-yellow-400 text-red-950 shadow-lg shadow-yellow-400/10"
                    : "bg-white/[0.03] text-white/70 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-red-950/15" : "bg-yellow-400/15 text-yellow-300"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showOverview && <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Predicted Next Month"
          value={shortMoney(analytics.predictedNextMonth)}
          note={`${analytics.projectedUnits.toLocaleString("en-PH")} projected units`}
          icon={TrendingUp}
        />
        <MetricCard
          title="Inventory Turnover"
          value={`${analytics.inventoryTurnover.toFixed(2)}x`}
          note="Based on last 90 days sold vs average stock"
          icon={Package}
        />
        <MetricCard
          title="Restock Alerts"
          value={String(analytics.restockAlerts.length)}
          note="Items at or below reorder level"
          icon={AlertTriangle}
        />
        <MetricCard
          title="Customer Segments"
          value={String(analytics.genderRows.length + analytics.ageRows.length)}
          note="Separate gender and age range groups"
          icon={Users}
        />
      </div>}

      {showSales && <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <BarChart3 className="h-5 w-5 text-yellow-400" />
                  Revenue Trend
                </CardTitle>
                <p className="mt-1 text-sm text-white/55">Completed sales grouped by {revenueTrendOptions.find((option) => option.id === revenueTrendPeriod)?.label.toLowerCase()} period.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {revenueTrendOptions.map((option) => {
                  const active = revenueTrendPeriod === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setRevenueTrendPeriod(option.id)}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? "bg-yellow-400 text-red-950"
                          : "border border-[#2b2b36] bg-white/[0.03] text-white/70 hover:border-yellow-400/50 hover:text-yellow-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analytics.trendChart} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2f2f38" />
                <XAxis dataKey="date" stroke="#a3a3a3" fontSize={12} />
                <YAxis stroke="#a3a3a3" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181f", border: "1px solid #3a3a45", borderRadius: "12px", color: "#fff" }}
                  formatter={(value: any, name: string) => [name === "revenue" ? money(Number(value)) : `${value} units`, name === "revenue" ? "Revenue" : "Units"]}
                />
                <Bar dataKey="revenue" fill="#facc15" radius={[8, 8, 0, 0]} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="text-white">Category Mix</CardTitle>
            <p className="text-sm text-white/55">Where units are moving fastest.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={analytics.categoryChart} dataKey="units" nameKey="name" outerRadius={95} innerRadius={48} paddingAngle={3}>
                  {analytics.categoryChart.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181f", border: "1px solid #3a3a45", borderRadius: "12px", color: "#fff" }}
                  formatter={(value: any) => [`${value} units`, "Sold"]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {analytics.categoryChart.map((category) => (
                <div key={category.name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="truncate text-white/75">{category.name}</span>
                  <span className="font-semibold text-yellow-300">{category.units}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>}

      {showProduct && <Card className="bg-[#16161d] border-[#2b2b36]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Package className="h-5 w-5 text-yellow-400" />
            Product Analytics
          </CardTitle>
          <p className="text-sm text-white/55">Fast movers, slow movers, dead stock, stock condition, and turnover per item.</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-[#2b2b36]">
            <Table>
              <TableHeader className="bg-[#1f1f28]">
                <TableRow className="border-[#2b2b36] hover:bg-[#1f1f28]">
                  <TableHead className="text-center text-white">Product</TableHead>
                  <TableHead className="text-center text-white">Brand</TableHead>
                  <TableHead className="text-center text-white">Category</TableHead>
                  <TableHead className="text-center text-white">Size</TableHead>
                  <TableHead className="text-center text-white">Sold 30D</TableHead>
                  <TableHead className="text-center text-white">Stock</TableHead>
                  <TableHead className="text-center text-white">Turnover</TableHead>
                  <TableHead className="text-center text-white">Movement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.productMovement.slice(0, 8).map((product) => (
                  <TableRow key={product.id} className="border-[#2b2b36] hover:bg-white/[0.03]">
                    <TableCell className="text-center font-semibold text-white">{product.name}</TableCell>
                    <TableCell className="text-center text-white/80">{product.brand}</TableCell>
                    <TableCell className="text-center text-white/80">{product.category}</TableCell>
                    <TableCell className="text-center text-white/80">{product.size}</TableCell>
                    <TableCell className="text-center text-yellow-300">{product.units30}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={stockBadgeClass(product.stock, product.reorder)}>{product.stock} units</Badge>
                    </TableCell>
                    <TableCell className="text-center text-white/80">{product.turnover.toFixed(2)}x</TableCell>
                    <TableCell className="text-center">
                      <Badge className={movementBadgeClass(product.movement)}>{product.movement}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>}

      {showProduct && <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <TrendingUp className="h-5 w-5 text-green-400" /> Fast Movers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.fastProducts.length ? analytics.fastProducts.map((product) => (
              <div key={product.id} className="rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-white">{product.name}</p>
                  <Badge className="bg-green-600 text-white">{product.units30} sold</Badge>
                </div>
                <p className="mt-1 text-xs text-white/55">Keep stocked. Forecast depends on continued demand.</p>
              </div>
            )) : <p className="text-sm text-white/55">No fast movers yet.</p>}
          </CardContent>
        </Card>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <TrendingDown className="h-5 w-5 text-orange-400" /> Slow / Dead Stock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.slowProducts.length ? analytics.slowProducts.map((product) => (
              <div key={product.id} className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-white">{product.name}</p>
                  <Badge className={movementBadgeClass(product.movement)}>{product.movement}</Badge>
                </div>
                <p className="mt-1 text-xs text-white/55">{product.stock} units left, {product.units30} sold in 30 days.</p>
              </div>
            )) : <p className="text-sm text-white/55">No slow movers detected.</p>}
          </CardContent>
        </Card>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-400" /> Restock Watch
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.restockAlerts.length ? analytics.restockAlerts.map((product) => (
              <div key={product.id} className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold text-white">{product.name}</p>
                  <Badge className={stockBadgeClass(product.stock, product.reorder)}>{product.stockCondition}</Badge>
                </div>
                <p className="mt-1 text-xs text-white/55">Stock {product.stock}, reorder at {product.reorder}.</p>
              </div>
            )) : <p className="text-sm text-white/55">No restock alerts. Inventory looks healthy.</p>}
          </CardContent>
        </Card>
      </div>}

      {showProduct && (
      <div className="grid grid-cols-1 gap-6">
        {showProduct && (
        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="text-white">Top Brand, Size, and Category</CardTitle>
            <p className="text-sm text-white/55">Descriptive analytics for buying decisions.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-1">
            {[
              { title: "Brands", rows: analytics.topBrands },
              { title: "Sizes", rows: analytics.topSizes },
              { title: "Categories", rows: analytics.topCategories },
            ].map((group) => (
              <div key={group.title} className="rounded-2xl border border-[#2b2b36] bg-white/[0.03] p-4">
                <p className="mb-3 text-sm font-semibold text-yellow-300">{group.title}</p>
                <div className="space-y-2">
                  {group.rows.length ? group.rows.map((row: any, index: number) => (
                    <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-white/80">{index + 1}. {row.name}</span>
                      <span className="font-semibold text-white">{row.units} units</span>
                    </div>
                  )) : <span className="text-sm text-white/45">No data yet.</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        )}
      </div>
      )}

      {showCustomer && (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-yellow-400" /> Gender Analytics
            </CardTitle>
            <p className="text-sm text-white/55">Customer demand grouped by recorded customer gender.</p>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex justify-end">
              <Badge className="bg-yellow-400 text-red-950">{analytics.genderRows.length} groups</Badge>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#2b2b36]">
              <Table>
                <TableHeader className="bg-[#1f1f28]">
                  <TableRow className="border-[#2b2b36] hover:bg-[#1f1f28]">
                    <TableHead className="text-center text-white">Gender</TableHead>
                    <TableHead className="text-center text-white">Customers</TableHead>
                    <TableHead className="text-center text-white">Orders</TableHead>
                    <TableHead className="text-center text-white">Revenue</TableHead>
                    <TableHead className="text-center text-white">Top Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.genderRows.length ? analytics.genderRows.map((segment) => (
                    <TableRow key={segment.label} className="border-[#2b2b36] hover:bg-white/[0.03]">
                      <TableCell className="text-center font-semibold text-white">{segment.label}</TableCell>
                      <TableCell className="text-center text-white/80">{segment.customers}</TableCell>
                      <TableCell className="text-center text-white/80">{segment.orders}</TableCell>
                      <TableCell className="text-center text-yellow-300">{money(segment.revenue)}</TableCell>
                      <TableCell className="text-center text-white/80">{segment.topCategory}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-white/50">
                        No gender analytics yet. Add gender values to customer profiles to unlock this view.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-yellow-400" /> Age Range Analytics
            </CardTitle>
            <p className="text-sm text-white/55">Customer demand grouped by recorded age or birthdate.</p>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex justify-end">
              <Badge className="bg-yellow-400 text-red-950">{analytics.ageRows.length} groups</Badge>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#2b2b36]">
              <Table>
                <TableHeader className="bg-[#1f1f28]">
                  <TableRow className="border-[#2b2b36] hover:bg-[#1f1f28]">
                    <TableHead className="text-center text-white">Age Range</TableHead>
                    <TableHead className="text-center text-white">Customers</TableHead>
                    <TableHead className="text-center text-white">Orders</TableHead>
                    <TableHead className="text-center text-white">Revenue</TableHead>
                    <TableHead className="text-center text-white">Top Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.ageRows.length ? analytics.ageRows.map((segment) => (
                    <TableRow key={segment.label} className="border-[#2b2b36] hover:bg-white/[0.03]">
                      <TableCell className="text-center font-semibold text-white">{segment.label}</TableCell>
                      <TableCell className="text-center text-white/80">{segment.customers}</TableCell>
                      <TableCell className="text-center text-white/80">{segment.orders}</TableCell>
                      <TableCell className="text-center text-yellow-300">{money(segment.revenue)}</TableCell>
                      <TableCell className="text-center text-white/80">{segment.topCategory}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-white/50">
                        No age range analytics yet. Add age or birthdate values to customer profiles to unlock this view.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {(showOverview || analyticsView === "product") && <Card className="bg-[#16161d] border-[#2b2b36]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-yellow-400" /> Targeted Marketing Recommendations
          </CardTitle>
          <p className="text-sm text-white/55">Suggested actions from slow movers, stock risk, and customer demand.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {analytics.promotionSuggestions.length ? analytics.promotionSuggestions.map((suggestion, index) => (
              <div key={`${suggestion.title}-${index}`} className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{suggestion.title}</p>
                    <p className="mt-1 text-sm text-yellow-200">{suggestion.target}</p>
                  </div>
                  <Badge className="bg-yellow-400 text-red-950">{suggestion.action}</Badge>
                </div>
                <p className="mt-3 text-sm text-white/65">{suggestion.reason}</p>
              </div>
            )) : (
              <div className="rounded-2xl border border-[#2b2b36] bg-white/[0.03] p-4 text-sm text-white/60">
                No promotion recommendation yet. Once sales and inventory movement grow, this section will suggest markdowns, bundles, or restock-first actions.
              </div>
            )}
          </div>
        </CardContent>
      </Card>}
    </div>
  );
}

export default PredictiveAnalytics;
