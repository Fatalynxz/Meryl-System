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
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCustomers, useProducts, usePromotions, useSales } from "../../lib/hooks";

type RevenueTrendPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annually";
type RankingMetric = "units" | "revenue";

const revenueTrendOptions: Array<{ id: RevenueTrendPeriod; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annually", label: "Annually" },
];

const productPeriodDays: Record<RevenueTrendPeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

function money(value: number) {
  return `PHP ${Math.round(value || 0).toLocaleString("en-PH")}`;
}

function shortMoney(value: number) {
  if (value >= 1000000) return `PHP ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `PHP ${(value / 1000).toFixed(1)}K`;
  return money(value);
}

function shortLabel(value: string, max = 18) {
  if (!value) return "N/A";
  return value.length > max ? `${value.slice(0, max)}...` : value;
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
    <Card className="border-[#2b2b36] bg-[#16161d]">
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-white/70">{title}</p>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400/10 ring-1 ring-yellow-400/10">
            <Icon className="h-6 w-6 text-yellow-400" />
          </div>
        </div>
        <p className="whitespace-nowrap text-3xl font-bold leading-none tracking-tight text-white">{value}</p>
        <p className="mt-3 min-h-[2rem] text-sm leading-snug text-emerald-300">{note}</p>
      </CardContent>
    </Card>
  );
}

export function PredictiveAnalytics() {
  const [analyticsView, setAnalyticsView] = useState<"overview" | "product" | "customer" | "sales" | "promotion">("overview");
  const [revenueTrendPeriod, setRevenueTrendPeriod] = useState<RevenueTrendPeriod>("daily");
  const [salesForecastPeriod, setSalesForecastPeriod] = useState<RevenueTrendPeriod>("monthly");
  const [productAnalyticsPeriod, setProductAnalyticsPeriod] = useState<RevenueTrendPeriod>("monthly");
  const [topRankingPeriod, setTopRankingPeriod] = useState<RevenueTrendPeriod>("monthly");
  const [topRankingMetric, setTopRankingMetric] = useState<RankingMetric>("units");
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const customersQuery = useCustomers();
  const promotionsQuery = usePromotions();

  const sales = ((salesQuery.data as any[]) ?? []).filter(isCompletedSale);
  const products = (productsQuery.data as any[]) ?? [];
  const customers = (customersQuery.data as any[]) ?? [];
  const promotions = (promotionsQuery.data as any[]) ?? [];

  const analytics = useMemo(() => {
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    const last90 = new Date(now);
    last90.setDate(now.getDate() - 90);
    const productPeriodStart = new Date(now);
    productPeriodStart.setDate(now.getDate() - productPeriodDays[productAnalyticsPeriod]);
    productPeriodStart.setHours(0, 0, 0, 0);
    const productPeriodLabel = revenueTrendOptions.find((option) => option.id === productAnalyticsPeriod)?.label ?? "Monthly";
    const topRankingPeriodStart = new Date(now);
    topRankingPeriodStart.setDate(now.getDate() - productPeriodDays[topRankingPeriod]);
    topRankingPeriodStart.setHours(0, 0, 0, 0);
    const topRankingPeriodLabel = revenueTrendOptions.find((option) => option.id === topRankingPeriod)?.label ?? "Monthly";

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
        unitsPeriod: 0,
        revenue30: 0,
        revenue90: 0,
        revenuePeriod: 0,
      });
    });

    sales.forEach((sale: any) => {
      const date = toDate(sale.transaction_date ?? sale.created_at);
      if (!date) return;
      const in30 = date >= last30;
      const in90 = date >= last90;
      const inProductPeriod = date >= productPeriodStart;
      const inTopRankingPeriod = date >= topRankingPeriodStart;
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
            unitsPeriod: 0,
            revenue30: 0,
            revenue90: 0,
            revenuePeriod: 0,
          };
          if (inProductPeriod) {
            prev.unitsPeriod += qty;
            prev.revenuePeriod += revenue;
          }
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
        if (inTopRankingPeriod) {
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
    const avgUnitsPeriod = productRows.length
      ? productRows.reduce((sum, product) => sum + product.unitsPeriod, 0) / productRows.length
      : 0;

    const productMovement = productRows
      .map((product) => {
        const averageStock = Math.max(1, (Number(product.stock) + Number(product.units90)) / 2);
        const turnover = Number(product.units90) / averageStock;
        const movement = product.unitsPeriod === 0
          ? "Dead Stock"
          : product.unitsPeriod >= Math.max(3, avgUnitsPeriod * 1.3)
            ? "Fast"
            : product.unitsPeriod <= Math.max(1, avgUnitsPeriod * 0.5)
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
      .sort((a, b) => b.unitsPeriod - a.unitsPeriod || b.stock - a.stock);

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

    const getPeriodStart = (period: RevenueTrendPeriod) => {
      const start = new Date(now);
      if (period === "daily") start.setDate(now.getDate() - 30);
      if (period === "weekly") start.setDate(now.getDate() - 84);
      if (period === "monthly") start.setMonth(now.getMonth() - 11);
      if (period === "quarterly") start.setMonth(now.getMonth() - 21);
      if (period === "annually") start.setFullYear(now.getFullYear() - 4);
      start.setHours(0, 0, 0, 0);
      return start;
    };

    const labelForPeriodDate = (date: Date, period: RevenueTrendPeriod) => {
      if (period === "weekly") {
        const weekEnd = addDays(date, 6);
        return `${formatShortDate(date)}-${formatShortDate(weekEnd)}`;
      }
      if (period === "monthly") return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      if (period === "quarterly") return `Q${getQuarter(date)} ${date.getFullYear()}`;
      if (period === "annually") return String(date.getFullYear());
      return formatShortDate(date);
    };

    const addPeriod = (date: Date, period: RevenueTrendPeriod, amount = 1) => {
      const copy = new Date(date);
      if (period === "daily") copy.setDate(copy.getDate() + amount);
      if (period === "weekly") copy.setDate(copy.getDate() + amount * 7);
      if (period === "monthly") copy.setMonth(copy.getMonth() + amount);
      if (period === "quarterly") copy.setMonth(copy.getMonth() + amount * 3);
      if (period === "annually") copy.setFullYear(copy.getFullYear() + amount);
      return copy;
    };

    const getPeriodEnd = (date: Date, period: RevenueTrendPeriod) => {
      if (period === "daily") return new Date(date);
      if (period === "weekly") return addDays(date, 6);
      if (period === "monthly") return new Date(date.getFullYear(), date.getMonth() + 1, 0);
      if (period === "quarterly") return new Date(date.getFullYear(), date.getMonth() + 3, 0);
      return new Date(date.getFullYear(), 11, 31);
    };

    const countDaysInclusive = (start: Date, end: Date) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
      return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
    };

    const buildPeriodBuckets = (period: RevenueTrendPeriod, start: Date) => {
      const buckets = new Map<string, { key: string; date: Date; label: string; revenue: number; units: number }>();
      dailyRows
        .filter((row) => row.date >= start)
        .forEach((row) => {
        let key = row.date.toISOString().slice(0, 10);
        let label = formatShortDate(row.date);
        let bucketDate = new Date(row.date);

        if (period === "weekly") {
          bucketDate = startOfWeek(row.date);
          key = bucketDate.toISOString().slice(0, 10);
          label = labelForPeriodDate(bucketDate, period);
        } else if (period === "monthly") {
          bucketDate = new Date(row.date.getFullYear(), row.date.getMonth(), 1);
          key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, "0")}`;
          label = labelForPeriodDate(bucketDate, period);
        } else if (period === "quarterly") {
          const quarter = getQuarter(row.date);
          bucketDate = new Date(row.date.getFullYear(), (quarter - 1) * 3, 1);
          key = `${row.date.getFullYear()}-Q${quarter}`;
          label = labelForPeriodDate(bucketDate, period);
        } else if (period === "annually") {
          bucketDate = new Date(row.date.getFullYear(), 0, 1);
          key = String(row.date.getFullYear());
          label = labelForPeriodDate(bucketDate, period);
        }

        const bucket = buckets.get(key) ?? { key, date: bucketDate, label, revenue: 0, units: 0 };
        bucket.revenue += row.revenue;
        bucket.units += row.units;
        buckets.set(key, bucket);
      });
      return Array.from(buckets.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    };

    const trendChart = buildPeriodBuckets(revenueTrendPeriod, getPeriodStart(revenueTrendPeriod))
      .map((row) => ({
        date: row.label,
        revenue: Math.round(row.revenue),
        units: row.units,
      }));

    const forecastHistory = buildPeriodBuckets(salesForecastPeriod, getPeriodStart(salesForecastPeriod));
    const recentForecastBase = forecastHistory.filter((row) => row.revenue > 0 || row.units > 0).slice(-6);
    const forecastBase = recentForecastBase.length ? recentForecastBase : forecastHistory.slice(-3);
    const dailyModelStart = dailyRows[0]?.date && dailyRows[0].date > last90 ? new Date(dailyRows[0].date) : new Date(last90);
    dailyModelStart.setHours(0, 0, 0, 0);
    const dailyModelDays = countDaysInclusive(dailyModelStart, now);
    const dailyModelRows = Array.from({ length: dailyModelDays }, (_, index) => {
      const date = addDays(dailyModelStart, index);
      const key = date.toISOString().slice(0, 10);
      const existing = dailySales.get(key);
      return {
        date,
        index,
        revenue: existing?.revenue ?? 0,
        units: existing?.units ?? 0,
      };
    });
    const dailyModelBase = dailyModelRows.length ? dailyModelRows : [{ date: now, index: 0, revenue: 0, units: 0 }];
    const averageDailyRevenue = dailyModelBase.reduce((sum, row) => sum + row.revenue, 0) / Math.max(1, dailyModelBase.length);
    const averageDailyUnits = dailyModelBase.reduce((sum, row) => sum + row.units, 0) / Math.max(1, dailyModelBase.length);
    const firstHalf = dailyModelBase.slice(0, Math.max(1, Math.floor(dailyModelBase.length / 2)));
    const secondHalf = dailyModelBase.slice(Math.max(1, Math.floor(dailyModelBase.length / 2)));
    const firstHalfRevenue = firstHalf.reduce((sum, row) => sum + row.revenue, 0) / Math.max(1, firstHalf.length);
    const secondHalfRevenue = secondHalf.reduce((sum, row) => sum + row.revenue, 0) / Math.max(1, secondHalf.length);
    const dailyTrendRate = firstHalfRevenue > 0
      ? Math.max(-0.25, Math.min(0.25, (secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue))
      : 0;
    const hasReliableForecastHistory = dailyModelBase.filter((row) => row.revenue > 0 || row.units > 0).length >= 3 || forecastBase.length >= 2;
    const forecastCountByPeriod: Record<RevenueTrendPeriod, number> = {
      daily: 7,
      weekly: 4,
      monthly: 6,
      quarterly: 4,
      annually: 3,
    };
    const lastForecastDate = forecastHistory[forecastHistory.length - 1]?.date ?? now;
    const forecastRows = Array.from({ length: forecastCountByPeriod[salesForecastPeriod] }, (_, index) => {
      const date = addPeriod(lastForecastDate, salesForecastPeriod, index + 1);
      const periodEnd = getPeriodEnd(date, salesForecastPeriod);
      const daysInPeriod = countDaysInclusive(date, periodEnd);
      const multiplier = Math.max(0.1, 1 + dailyTrendRate * ((index + 1) / 2));
      return {
        date: labelForPeriodDate(date, salesForecastPeriod),
        projectedRevenue: Math.round(averageDailyRevenue * daysInPeriod * multiplier),
        projectedUnits: Math.max(0, Math.round(averageDailyUnits * daysInPeriod * multiplier)),
      };
    });
    const visibleForecastHistory = forecastHistory.slice(-5);
    const lastVisibleActualIndex = visibleForecastHistory.length - 1;
    const lastActualRevenue = visibleForecastHistory[lastVisibleActualIndex]?.revenue ?? 0;
    const lastActualUnits = visibleForecastHistory[lastVisibleActualIndex]?.units ?? 0;
    const salesForecastChart = [
      ...visibleForecastHistory.map((row, index) => ({
        date: row.label,
        actualRevenue: Math.round(row.revenue),
        projectedRevenue: index === lastVisibleActualIndex ? Math.round(lastActualRevenue) : null,
        actualUnits: row.units,
        projectedUnits: index === lastVisibleActualIndex ? lastActualUnits : null,
      })),
      ...forecastRows.map((row) => ({
        date: row.date,
        actualRevenue: null,
        projectedRevenue: row.projectedRevenue,
        actualUnits: null,
        projectedUnits: row.projectedUnits,
      })),
    ];
    const forecastTotalRevenue = forecastRows.reduce((sum, row) => sum + row.projectedRevenue, 0);
    const forecastTotalUnits = forecastRows.reduce((sum, row) => sum + row.projectedUnits, 0);
    const forecastPeriodCount = forecastRows.length;
    const forecastConfidence = hasReliableForecastHistory
      ? Math.min(90, Math.max(55, 52 + forecastBase.length * 7))
      : 35;
    const forecastNote = hasReliableForecastHistory
      ? "Based on recent completed sales movement."
      : "Limited history for this period. Treat this as a rough estimate.";
    const salesForecastPeriodLabel = revenueTrendOptions.find((option) => option.id === salesForecastPeriod)?.label ?? "Monthly";

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

    const buildRankingRows = (rows: any[]) => {
      const total = rows.reduce((sum, row) => sum + Number(row[topRankingMetric] ?? 0), 0);
      return rows
        .sort((a, b) => Number(b[topRankingMetric] ?? 0) - Number(a[topRankingMetric] ?? 0))
        .slice(0, 5)
        .map((row) => {
          const value = Number(row[topRankingMetric] ?? 0);
          return {
            ...row,
            share: total > 0 ? Math.round((value / total) * 100) : 0,
          };
        });
    };

    const topBrands = buildRankingRows(Array.from(brandStats.values()));
    const topSizes = buildRankingRows(Array.from(sizeStats.values()));
    const topCategories = buildRankingRows(Array.from(categoryStats.values()));

    const promotionSuggestions = [
      ...overstockSlowMovers.slice(0, 3).map((product) => ({
        title: `Markdown ${product.name}`,
        target: `${product.brand} ${product.category}`,
        reason: `${product.movement} with ${product.stock} units on hand and only ${product.unitsPeriod} sold in the ${productPeriodLabel.toLowerCase()} view.`,
        action: product.unitsPeriod === 0 ? "Bundle or BOGO" : "10%-15% discount",
      })),
      ...restockAlerts.slice(0, 2).map((product) => ({
        title: `Protect stock for ${product.name}`,
        target: `${product.brand} size ${product.size}`,
        reason: `${product.stockCondition}: ${product.stock} units left vs reorder level ${product.reorder}.`,
        action: "Restock before promoting",
      })),
    ].slice(0, 5);

    const totalUnitsAllTime = Math.max(
      sales.reduce((sum: number, sale: any) => {
        const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
        return sum + details.reduce((detailSum: number, detail: any) => detailSum + Number(detail.quantity ?? 0), 0);
      }, 0),
      1,
    );

    const promotionPerformance = promotions
      .map((promo: any, index: number) => {
        const promoProducts = Array.isArray(promo.promo_product) ? promo.promo_product : [];
        const productIds = new Set(promoProducts.map((row: any) => String(row.product_id ?? row.product?.product_id ?? "")));
        const start = toDate(promo.start_date);
        const end = toDate(promo.end_date);

        let revenue = 0;
        let units = 0;
        sales.forEach((sale: any) => {
          const date = toDate(sale.transaction_date ?? sale.created_at);
          if (!date) return;
          if (start && date < start) return;
          if (end && date > end) return;
          const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
          details.forEach((detail: any) => {
            const productId = String(detail.product_id ?? "");
            if (productIds.size && !productIds.has(productId)) return;
            units += Number(detail.quantity ?? 0);
            revenue += Number(detail.subtotal ?? detail.price ?? 0);
          });
        });

        return {
          id: String(promo.promo_id ?? `promo-${index}`),
          name: String(promo.promo_name ?? "Promotion"),
          status: String(promo.status ?? "Scheduled"),
          start: start ? formatShortDate(start) : "N/A",
          end: end ? formatShortDate(end) : "N/A",
          revenue,
          units,
          contribution: Number(((units / totalUnitsAllTime) * 100).toFixed(1)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const activePromotionCount = promotionPerformance.filter((promo) => promo.status.toLowerCase() === "active").length;
    const activePromotionChart = promotionPerformance
      .filter((promo) => promo.status.toLowerCase() === "active")
      .slice(0, 8)
      .map((promo) => ({
        name: shortLabel(promo.name),
        fullName: promo.name,
        revenue: Math.round(promo.revenue),
        units: promo.units,
        contribution: promo.contribution,
      }));
    const promoRevenue = promotionPerformance.reduce((sum, promo) => sum + promo.revenue, 0);
    const promoUnits = promotionPerformance.reduce((sum, promo) => sum + promo.units, 0);

    return {
      productMovement,
      fastProducts: productMovement.filter((product) => product.movement === "Fast").slice(0, 5),
      slowProducts: productMovement.filter((product) => ["Slow", "Dead Stock"].includes(product.movement)).slice(0, 5),
      restockAlerts,
      inventoryTurnover,
      predictedNextMonth,
      projectedUnits,
      trendChart,
      salesForecastChart,
      forecastTotalRevenue,
      forecastTotalUnits,
      forecastPeriodCount,
      forecastConfidence,
      forecastNote,
      hasReliableForecastHistory,
      salesForecastPeriodLabel,
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
      productPeriodLabel,
      topRankingPeriodLabel,
      promotionPerformance,
      activePromotionCount,
      activePromotionChart,
      promoRevenue,
      promoUnits,
    };
  }, [customers, productAnalyticsPeriod, products, promotions, revenueTrendPeriod, sales, salesForecastPeriod, topRankingMetric, topRankingPeriod]);

  if (salesQuery.isLoading || productsQuery.isLoading || customersQuery.isLoading || promotionsQuery.isLoading) {
    return <div className="text-sm text-white/60">Loading analytics...</div>;
  }

  const showOverview = analyticsView === "overview";
  const showProduct = analyticsView === "overview" || analyticsView === "product";
  const showCustomer = analyticsView === "overview" || analyticsView === "customer";
  const showSales = analyticsView === "overview" || analyticsView === "sales";
  const showPromotion = analyticsView === "overview" || analyticsView === "promotion";

  const filterTabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart3, count: null },
    { id: "product" as const, label: "Product Analytics", icon: Package, count: analytics.productMovement.length },
    { id: "customer" as const, label: "Customer Analytics", icon: Users, count: analytics.genderRows.length + analytics.ageRows.length },
    { id: "sales" as const, label: "Sales Analytics", icon: TrendingUp, count: analytics.trendChart.length },
    { id: "promotion" as const, label: "Promotion Analytics", icon: Sparkles, count: analytics.promotionPerformance.length },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#2b2b36] bg-[#16161d] p-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
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
          note="90-day sales vs average stock"
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
          note="Gender + age range groups"
          icon={Users}
        />
      </div>}

      {showSales && <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
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
        </div>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <TrendingUp className="h-5 w-5 text-yellow-400" />
                  Sales Forecast
                </CardTitle>
                <p className="mt-1 max-w-2xl text-sm text-white/55">
                  Recent completed sales with a simple forward projection for the next {analytics.forecastPeriodCount} {analytics.salesForecastPeriodLabel.toLowerCase()} periods.
                  Use this as a planning guide, not a guaranteed result.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {revenueTrendOptions.map((option) => {
                  const active = salesForecastPeriod === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSalesForecastPeriod(option.id)}
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
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_280px]">
              <div className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.salesForecastChart} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2f2f38" />
                    <XAxis dataKey="date" stroke="#a3a3a3" fontSize={12} interval={0} />
                    <YAxis stroke="#a3a3a3" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181f", border: "1px solid #3a3a45", borderRadius: "12px", color: "#fff" }}
                      formatter={(value: any, name: string) => [
                        money(Number(value ?? 0)),
                        name === "actualRevenue" ? "Actual Revenue" : "Forecast Revenue",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualRevenue"
                      stroke="#facc15"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#facc15", stroke: "#111118", strokeWidth: 2 }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="projectedRevenue"
                      stroke="#ffffff"
                      strokeDasharray="7 6"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#ffffff", stroke: "#111118", strokeWidth: 2 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-white/55">
                  <span className="flex items-center gap-2"><span className="h-2 w-8 rounded-full bg-yellow-400" /> Actual sales</span>
                  <span className="flex items-center gap-2"><span className="w-8 border-t-2 border-dashed border-white" /> Forecast</span>
                  {!analytics.hasReliableForecastHistory && (
                    <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-yellow-200">
                      Limited history
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">Projected Revenue</p>
                  <p className="mt-2 text-3xl font-bold text-white">{money(analytics.forecastTotalRevenue)}</p>
                  <p className="mt-1 text-xs text-white/55">Next {analytics.forecastPeriodCount} {analytics.salesForecastPeriodLabel.toLowerCase()} periods</p>
                </div>
                <div className="rounded-2xl border border-[#2b2b36] bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Projected Units</p>
                  <p className="mt-2 text-2xl font-bold text-white">{analytics.forecastTotalUnits.toLocaleString("en-PH")}</p>
                  <p className="mt-1 text-xs text-emerald-300">Estimated items to prepare</p>
                </div>
                <div className="rounded-2xl border border-[#2b2b36] bg-white/[0.03] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Confidence</p>
                  <p className="mt-2 text-2xl font-bold text-white">{analytics.forecastConfidence}%</p>
                  <p className="mt-1 text-xs text-white/55">{analytics.forecastNote}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>}

      {showPromotion && <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard
            title="Active Promotions"
            value={String(analytics.activePromotionCount)}
            note="Campaigns currently running"
            icon={Sparkles}
          />
          <MetricCard
            title="Promotion Revenue"
            value={shortMoney(analytics.promoRevenue)}
            note="Sales value linked to promotion windows"
            icon={TrendingUp}
          />
          <MetricCard
            title="Promotion Units"
            value={analytics.promoUnits.toLocaleString("en-PH")}
            note="Items sold under promotion periods"
            icon={Package}
          />
        </div>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-yellow-400" />
              Promotion Performance
            </CardTitle>
            <p className="text-sm text-white/55">Top campaigns ranked by estimated revenue contribution.</p>
          </CardHeader>
          <CardContent>
            <div className="mb-5 rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Active Promotions Comparison</p>
                <p className="text-xs text-white/55">Revenue and units per campaign</p>
              </div>
              {analytics.activePromotionChart.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={analytics.activePromotionChart} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2f2f38" />
                    <XAxis dataKey="name" stroke="#a3a3a3" fontSize={12} interval={0} angle={-12} textAnchor="end" height={52} />
                    <YAxis yAxisId="left" stroke="#a3a3a3" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="#a3a3a3" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181f", border: "1px solid #3a3a45", borderRadius: "12px", color: "#fff" }}
                      formatter={(value: any, name: string) => [
                        name === "revenue" ? money(Number(value)) : `${value} units`,
                        name === "revenue" ? "Revenue" : "Units",
                      ]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? "Promotion"}
                    />
                    <Bar yAxisId="left" dataKey="revenue" fill="#facc15" radius={[6, 6, 0, 0]} name="revenue" />
                    <Bar yAxisId="right" dataKey="units" fill="#22c55e" radius={[6, 6, 0, 0]} name="units" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="rounded-xl border border-dashed border-[#2b2b36] bg-white/[0.02] p-5 text-center text-sm text-white/60">
                  No active promotions yet. Activate a campaign to view comparison graph.
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#2b2b36]">
              <Table>
                <TableHeader className="bg-[#1f1f28]">
                  <TableRow className="border-[#2b2b36] hover:bg-[#1f1f28]">
                    <TableHead className="text-center text-white">Promotion</TableHead>
                    <TableHead className="text-center text-white">Date Range</TableHead>
                    <TableHead className="text-center text-white">Status</TableHead>
                    <TableHead className="text-center text-white">Units</TableHead>
                    <TableHead className="text-center text-white">Revenue</TableHead>
                    <TableHead className="text-center text-white">Contribution</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.promotionPerformance.length ? analytics.promotionPerformance.slice(0, 10).map((promo) => (
                    <TableRow key={promo.id} className="border-[#2b2b36] hover:bg-white/[0.03]">
                      <TableCell className="text-center font-semibold text-white">{promo.name}</TableCell>
                      <TableCell className="text-center text-white/80">{promo.start} - {promo.end}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={promo.status.toLowerCase() === "active" ? "bg-green-600 text-white" : "bg-white/10 text-white/80"}>
                          {promo.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-yellow-300">{promo.units}</TableCell>
                      <TableCell className="text-center text-white">{money(promo.revenue)}</TableCell>
                      <TableCell className="text-center text-emerald-300">{promo.contribution}%</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow className="border-[#2b2b36]">
                      <TableCell colSpan={6} className="py-8 text-center text-white/60">
                        No promotion data yet. Create promotions to see campaign performance here.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>}

      {showProduct && <Card className="bg-[#16161d] border-[#2b2b36]">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <Package className="h-5 w-5 text-yellow-400" />
                Product Analytics
              </CardTitle>
              <p className="mt-1 text-sm text-white/55">Fast movers, slow movers, dead stock, stock condition, and turnover per item.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {revenueTrendOptions.map((option) => {
                const active = productAnalyticsPeriod === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setProductAnalyticsPeriod(option.id)}
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
          <div className="overflow-hidden rounded-2xl border border-[#2b2b36]">
            <Table>
              <TableHeader className="bg-[#1f1f28]">
                <TableRow className="border-[#2b2b36] hover:bg-[#1f1f28]">
                  <TableHead className="text-center text-white">Product</TableHead>
                  <TableHead className="text-center text-white">Brand</TableHead>
                  <TableHead className="text-center text-white">Category</TableHead>
                  <TableHead className="text-center text-white">Size</TableHead>
                  <TableHead className="text-center text-white">Sold ({analytics.productPeriodLabel})</TableHead>
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
                    <TableCell className="text-center text-yellow-300">{product.unitsPeriod}</TableCell>
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
                  <Badge className="bg-green-600 text-white">{product.unitsPeriod} sold</Badge>
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
                <p className="mt-1 text-xs text-white/55">{product.stock} units left, {product.unitsPeriod} sold in the {analytics.productPeriodLabel.toLowerCase()} view.</p>
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
          <CardHeader className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
              <div className="max-w-3xl">
                <Badge className="mb-3 bg-yellow-400/10 px-3 py-1 text-yellow-300">Buying Preference Rankings</Badge>
                <CardTitle className="text-white">Top Brand, Size, and Category</CardTitle>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  Quick restocking guide based on what customers actually buy: brands, sizes, and categories ranked by units or revenue.
                </p>
              </div>

              <div className="w-full rounded-2xl border border-[#2b2b36] bg-[#111118] p-3 xl:w-[470px]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Period</span>
                  <Badge className="bg-yellow-400 text-red-950">{analytics.topRankingPeriodLabel}</Badge>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {revenueTrendOptions.map((option) => {
                    const active = topRankingPeriod === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setTopRankingPeriod(option.id)}
                        className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                          active
                            ? "bg-yellow-400 text-red-950 shadow-[0_0_18px_rgba(255,214,10,0.18)]"
                            : "border border-[#2b2b36] bg-white/[0.03] text-white/70 hover:border-yellow-400/50 hover:text-yellow-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Rank by</span>
                  <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#2b2b36] bg-white/[0.03] p-1 sm:w-44">
                    {[
                      { id: "units", label: "Units" },
                      { id: "revenue", label: "Revenue" },
                    ].map((option) => {
                      const active = topRankingMetric === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTopRankingMetric(option.id as RankingMetric)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            active ? "bg-yellow-400 text-red-950" : "text-white/65 hover:text-yellow-200"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { title: "Top Brands", subtitle: "Which brands customers choose most", rows: analytics.topBrands },
              { title: "Top Sizes", subtitle: "Sizes to prioritize when restocking", rows: analytics.topSizes },
              { title: "Top Categories", subtitle: "Product groups with strongest demand", rows: analytics.topCategories },
            ].map((group) => (
              <div key={group.title} className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{group.title}</p>
                    <Badge className="bg-white/10 text-xs text-white/70">{group.rows.length} ranked</Badge>
                  </div>
                  <p className="mt-1 text-xs text-white/45">{group.subtitle}</p>
                </div>
                <div className="space-y-2">
                  {group.rows.length ? group.rows.map((row: any, index: number) => (
                    <div key={row.name} className="rounded-xl border border-[#2b2b36] bg-[#181820] p-3 transition hover:border-yellow-400/40 hover:bg-[#1c1c24]">
                      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-sm font-bold text-red-950">
                            {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-white">{row.name}</p>
                          <p className="text-xs text-white/40">{row.share}% share</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-yellow-300">
                            {topRankingMetric === "revenue" ? money(row.revenue) : `${row.units} units`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_36px] items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-yellow-400" style={{ width: `${row.share}%` }} />
                        </div>
                        <span className="text-right text-xs text-white/45">{row.share}%</span>
                      </div>
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
      <div className="grid grid-cols-1 gap-5">
        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Users className="h-5 w-5 text-yellow-400" /> Gender Analytics
                </CardTitle>
                <p className="mt-2 text-sm text-white/55">Demand grouped by customer gender.</p>
              </div>
              <Badge className="bg-yellow-400 text-red-950">{analytics.genderRows.length} groups</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.genderRows.length ? analytics.genderRows.map((segment) => (
              <div key={segment.label} className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4 transition hover:border-yellow-400/35">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-white">{segment.label}</p>
                    <p className="mt-1 text-xs text-white/45">Top category: {segment.topCategory}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-semibold text-yellow-300">{money(segment.revenue)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">Customers</p>
                    <p className="font-semibold text-white">{segment.customers}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">Orders</p>
                    <p className="font-semibold text-white">{segment.orders}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2 sm:col-span-1 col-span-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">Revenue</p>
                    <p className="font-semibold text-white">{money(segment.revenue)}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-[#2b2b36] bg-[#111118] p-6 text-center">
                <p className="font-semibold text-white/70">No gender analytics yet</p>
                <p className="mt-1 text-sm text-white/45">Add gender values to customer profiles to unlock this view.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Users className="h-5 w-5 text-yellow-400" /> Age Range Analytics
                </CardTitle>
                <p className="mt-2 text-sm text-white/55">Demand grouped by recorded age or birthdate.</p>
              </div>
              <Badge className="bg-yellow-400 text-red-950">{analytics.ageRows.length} groups</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.ageRows.length ? analytics.ageRows.map((segment) => (
              <div key={segment.label} className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4 transition hover:border-yellow-400/35">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-white">{segment.label}</p>
                    <p className="mt-1 text-xs text-white/45">Top category: {segment.topCategory}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-semibold text-yellow-300">{money(segment.revenue)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">Customers</p>
                    <p className="font-semibold text-white">{segment.customers}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">Orders</p>
                    <p className="font-semibold text-white">{segment.orders}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] px-3 py-2 sm:col-span-1 col-span-2">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">Revenue</p>
                    <p className="font-semibold text-white">{money(segment.revenue)}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-[#2b2b36] bg-[#111118] p-6 text-center">
                <p className="font-semibold text-white/70">No age range analytics yet</p>
                <p className="mt-1 text-sm text-white/45">Add age or birthdate values to customer profiles to unlock this view.</p>
              </div>
            )}
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
