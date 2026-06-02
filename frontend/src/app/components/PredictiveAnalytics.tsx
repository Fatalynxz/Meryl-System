import { type ComponentType, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { AlertTriangle, BarChart3, Package, RefreshCw, Sparkles, TrendingDown, TrendingUp, Users } from "lucide-react";
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
import { productAnalyticsSnapshotsApi } from "../../lib/api";

type RevenueTrendPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annually";
type ProductAnalyticsPeriod = RevenueTrendPeriod | "custom";
type RankingMetric = "units" | "revenue";

const revenueTrendOptions: Array<{ id: RevenueTrendPeriod; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annually", label: "Annually" },
];

const customerPeriodOptions: Array<{ id: RevenueTrendPeriod; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annually", label: "Yearly" },
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

function salesVelocityColor(units: number, maxUnits: number) {
  if (maxUnits <= 0 || units <= 0) return "rgba(63, 63, 70, 0.58)";
  const intensity = Math.max(0.25, units / maxUnits);
  if (intensity >= 0.75) return "rgba(34, 197, 94, 0.92)";
  if (intensity >= 0.45) return "rgba(250, 204, 21, 0.9)";
  return "rgba(249, 115, 22, 0.88)";
}

function sortSizeLabels(a: string, b: string) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
  return a.localeCompare(b, undefined, { numeric: true });
}

function stockBadgeClass(stock: number, reorder: number) {
  if (stock <= 0) return "bg-red-700 text-white";
  if (reorder > 0 && stock <= reorder) return "bg-orange-500 text-white";
  if (reorder > 0 && stock <= reorder * 1.5) return "bg-yellow-400 text-red-950";
  return "bg-green-700 text-white";
}

function getTopKey(map: Map<string, number>) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
}

function MetricCard({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="bg-[#16161d] border-[#2b2b36]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{title}</p>
            <p className="mt-2 text-2xl font-bold text-white">{value}</p>
            <p className="mt-1 text-xs text-white/55">{note}</p>
          </div>
          <Icon className="h-5 w-5 text-yellow-400" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PredictiveAnalytics() {
  const [analyticsView, setAnalyticsView] = useState<"product" | "customer" | "sales" | "promotion">("product");
  const [revenueTrendPeriod, setRevenueTrendPeriod] = useState<RevenueTrendPeriod>("daily");
  const [salesForecastPeriod, setSalesForecastPeriod] = useState<RevenueTrendPeriod>("monthly");
  const [productAnalyticsPeriod, setProductAnalyticsPeriod] = useState<ProductAnalyticsPeriod>("monthly");
  const [customerAnalyticsPeriod, setCustomerAnalyticsPeriod] = useState<RevenueTrendPeriod>("monthly");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [topRankingPeriod, setTopRankingPeriod] = useState<RevenueTrendPeriod>("monthly");
  const [topRankingMetric, setTopRankingMetric] = useState<RankingMetric>("units");
  const [isRefreshingSnapshots, setIsRefreshingSnapshots] = useState(false);
  const [snapshotRefreshNote, setSnapshotRefreshNote] = useState<string | null>(null);
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const customersQuery = useCustomers();
  const promotionsQuery = usePromotions();

  const sales = ((salesQuery.data as any[]) ?? []).filter(isCompletedSale);
  const products = (productsQuery.data as any[]) ?? [];
  const customers = (customersQuery.data as any[]) ?? [];
  const promotions = (promotionsQuery.data as any[]) ?? [];
  const effectiveProductAnalyticsPeriod: RevenueTrendPeriod =
    productAnalyticsPeriod === "custom" ? "monthly" : productAnalyticsPeriod;
  const snapshotQuery = useQuery({
    queryKey: ["product-analytics-snapshots", productAnalyticsPeriod, customStartDate, customEndDate],
    queryFn: () =>
      productAnalyticsSnapshotsApi.fetch(
        productAnalyticsPeriod,
        productAnalyticsPeriod === "custom" ? { start_date: customStartDate, end_date: customEndDate } : undefined,
      ),
    staleTime: 60_000,
    retry: 1,
  });
  const handleRefreshProductAnalytics = async () => {
    try {
      setIsRefreshingSnapshots(true);
      setSnapshotRefreshNote(null);
      if (productAnalyticsPeriod === "custom" && (!customStartDate || !customEndDate)) {
        setSnapshotRefreshNote("Custom range requires both start and end dates.");
        return;
      }
      if (productAnalyticsPeriod === "custom" && customStartDate > customEndDate) {
        setSnapshotRefreshNote("Custom range is invalid: start date must be before or equal to end date.");
        return;
      }
      await productAnalyticsSnapshotsApi.rebuild(
        [productAnalyticsPeriod],
        productAnalyticsPeriod === "custom" ? { start_date: customStartDate, end_date: customEndDate } : undefined,
      );
      await snapshotQuery.refetch();
      setSnapshotRefreshNote("Product analytics refreshed.");
    } catch (error: any) {
      setSnapshotRefreshNote(error?.message ? `Refresh failed: ${error.message}` : "Refresh failed.");
    } finally {
      setIsRefreshingSnapshots(false);
    }
  };

  const computedAnalytics = useMemo(() => {
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    const last90 = new Date(now);
    last90.setDate(now.getDate() - 90);
    const productPeriodStart = new Date(now);
    productPeriodStart.setDate(now.getDate() - productPeriodDays[effectiveProductAnalyticsPeriod]);
    productPeriodStart.setHours(0, 0, 0, 0);
    const customerPeriodStart = new Date(now);
    customerPeriodStart.setDate(now.getDate() - productPeriodDays[customerAnalyticsPeriod]);
    customerPeriodStart.setHours(0, 0, 0, 0);
    const productPeriodLabel =
      productAnalyticsPeriod === "custom"
        ? customStartDate && customEndDate
          ? `Custom (${customStartDate} to ${customEndDate})`
          : "Custom Range"
        : revenueTrendOptions.find((option) => option.id === productAnalyticsPeriod)?.label ?? "Monthly";
    const customerPeriodLabel = customerPeriodOptions.find((option) => option.id === customerAnalyticsPeriod)?.label ?? "Monthly";
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
      const inCustomerPeriod = date >= customerPeriodStart;
      const customer = inCustomerPeriod
        ? (getOne(sale.customer) ?? customerMap.get(String(sale.customer_id ?? "")))
        : null;
      const gender = inCustomerPeriod ? getCustomerGender(customer) : "";
      const ageRange = inCustomerPeriod ? getAgeRange(customer) : "";
      const segmentKey = inCustomerPeriod ? `${gender} / ${ageRange}` : "";
      const segment = inCustomerPeriod
        ? (customerSegments.get(segmentKey) ?? {
            segment: segmentKey,
            gender,
            ageRange,
            customers: new Set<string>(),
            orders: 0,
            units: 0,
            revenue: 0,
            topCategories: new Map<string, number>(),
            topBrands: new Map<string, number>(),
            topSizes: new Map<string, number>(),
            topProducts: new Map<string, number>(),
          })
        : null;

      if (inCustomerPeriod && segment) {
        if (customer?.customer_id) segment.customers.add(String(customer.customer_id));
        segment.orders += 1;
        segment.revenue += getSaleAmount(sale);
      }

      const genderSegment = inCustomerPeriod
        ? (genderSegments.get(gender) ?? {
            label: gender,
            customers: new Set<string>(),
            orders: 0,
            units: 0,
            revenue: 0,
            topCategories: new Map<string, number>(),
            topBrands: new Map<string, number>(),
            topSizes: new Map<string, number>(),
            topProducts: new Map<string, number>(),
          })
        : null;
      const ageSegment = inCustomerPeriod
        ? (ageSegments.get(ageRange) ?? {
            label: ageRange,
            customers: new Set<string>(),
            orders: 0,
            units: 0,
            revenue: 0,
            topCategories: new Map<string, number>(),
            topBrands: new Map<string, number>(),
            topSizes: new Map<string, number>(),
            topProducts: new Map<string, number>(),
          })
        : null;
      if (inCustomerPeriod && customer?.customer_id) {
        genderSegment?.customers.add(String(customer.customer_id));
        ageSegment?.customers.add(String(customer.customer_id));
      }
      if (inCustomerPeriod) {
        if (genderSegment) {
          genderSegment.orders += 1;
          genderSegment.revenue += getSaleAmount(sale);
        }
        if (ageSegment) {
          ageSegment.orders += 1;
          ageSegment.revenue += getSaleAmount(sale);
        }
      }

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
        const productName = String(product?.product_name ?? detail?.product_name ?? "Unknown Product");

        day.units += qty;
        if (inCustomerPeriod && segment) {
          segment.units += qty;
          segment.topCategories.set(category, (segment.topCategories.get(category) ?? 0) + qty);
          segment.topBrands.set(brand, (segment.topBrands.get(brand) ?? 0) + qty);
          segment.topSizes.set(size, (segment.topSizes.get(size) ?? 0) + qty);
          segment.topProducts.set(productName, (segment.topProducts.get(productName) ?? 0) + qty);
        }
        if (inCustomerPeriod && genderSegment) {
          genderSegment.units += qty;
          genderSegment.topCategories.set(category, (genderSegment.topCategories.get(category) ?? 0) + qty);
          genderSegment.topBrands.set(brand, (genderSegment.topBrands.get(brand) ?? 0) + qty);
          genderSegment.topSizes.set(size, (genderSegment.topSizes.get(size) ?? 0) + qty);
          genderSegment.topProducts.set(productName, (genderSegment.topProducts.get(productName) ?? 0) + qty);
        }
        if (inCustomerPeriod && ageSegment) {
          ageSegment.units += qty;
          ageSegment.topCategories.set(category, (ageSegment.topCategories.get(category) ?? 0) + qty);
          ageSegment.topBrands.set(brand, (ageSegment.topBrands.get(brand) ?? 0) + qty);
          ageSegment.topSizes.set(size, (ageSegment.topSizes.get(size) ?? 0) + qty);
          ageSegment.topProducts.set(productName, (ageSegment.topProducts.get(productName) ?? 0) + qty);
        }

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
      if (inCustomerPeriod && segment) customerSegments.set(segmentKey, segment);
      if (inCustomerPeriod && genderSegment) genderSegments.set(gender, genderSegment);
      if (inCustomerPeriod && ageSegment) ageSegments.set(ageRange, ageSegment);
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
        const topCategory = getTopKey(segment.topCategories);
        return {
          segment: segment.segment,
          gender: segment.gender,
          ageRange: segment.ageRange,
          customers: segment.customers.size,
          orders: segment.orders,
          units: segment.units,
          revenue: segment.revenue,
          topCategory,
          topBrand: getTopKey(segment.topBrands),
          topSize: getTopKey(segment.topSizes),
          topProduct: getTopKey(segment.topProducts),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const formatCustomerSegment = (segment: any) => {
      const topCategory = getTopKey(segment.topCategories);
      return {
        label: segment.label,
        customers: segment.customers.size,
        orders: segment.orders,
        units: segment.units,
        revenue: segment.revenue,
        topCategory,
        topBrand: getTopKey(segment.topBrands),
        topSize: getTopKey(segment.topSizes),
        topProduct: getTopKey(segment.topProducts),
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
    const genderChart = genderRows.map((row, index) => ({
      name: shortLabel(row.label, 14),
      fullLabel: row.label,
      revenue: Math.round(row.revenue),
      orders: row.orders,
      customers: row.customers,
      fill: ["#facc15", "#f97316", "#22c55e", "#38bdf8", "#a78bfa"][index % 5],
    }));
    const ageChart = ageRows.map((row, index) => ({
      name: shortLabel(row.label, 16),
      fullLabel: row.label,
      revenue: Math.round(row.revenue),
      orders: row.orders,
      customers: row.customers,
      fill: ["#38bdf8", "#facc15", "#22c55e", "#f97316", "#a78bfa", "#fb7185"][index % 6],
    }));

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
    const today = new Date().toISOString().slice(0, 10);

    const promotionPerformance = promotions
      .map((promo: any, index: number) => {
        const promoProducts = Array.isArray(promo.promo_product) ? promo.promo_product : [];
        const productIds = new Set(promoProducts.map((row: any) => String(row.product_id ?? row.product?.product_id ?? "")));
        const start = toDate(promo.start_date);
        const end = toDate(promo.end_date);
        const startDate = String(promo.start_date ?? "").slice(0, 10);
        const endDate = String(promo.end_date ?? "").slice(0, 10);
        const rawStatus = String(promo.status ?? promo.promo_status ?? "").toLowerCase();

        const derivedStatus =
          rawStatus.includes("expired") || (endDate && endDate < today)
            ? "Ended"
            : rawStatus.includes("active") || (startDate && startDate <= today && endDate && endDate >= today)
              ? "Active"
              : "Scheduled";

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
          status: derivedStatus,
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
      genderChart,
      ageChart,
      customerPeriodLabel,
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
  }, [customerAnalyticsPeriod, customers, customEndDate, customStartDate, effectiveProductAnalyticsPeriod, productAnalyticsPeriod, products, promotions, revenueTrendPeriod, sales, salesForecastPeriod, topRankingMetric, topRankingPeriod]);

  const analytics = useMemo(() => {
    const snapshotData = snapshotQuery.data;
    if (!snapshotData?.snapshots?.length) return computedAnalytics;

    const productById = new Map(
      products.map((product: any) => [String(product.product_id ?? ""), product]),
    );
    const movementLabel = (value: string) => {
      const lower = String(value ?? "").toLowerCase();
      if (lower === "fast") return "Fast";
      if (lower === "slow") return "Slow";
      if (lower === "steady") return "Steady";
      return "Dead Stock";
    };
    const productMovement = snapshotData.snapshots
      .map((row) => {
        const product = productById.get(String(row.product_id ?? ""));
        const stock = Number(row.stock_quantity ?? 0);
        const reorder = getReorder(product);
        const movement = movementLabel(row.movement_label);
        const stockCondition = stock <= 0
          ? "Out of Stock"
          : reorder > 0 && stock <= reorder
            ? "Critical"
            : reorder > 0 && stock <= reorder * 1.5
              ? "Warning"
              : "Good";
        return {
          id: row.product_id,
          name: String(product?.product_name ?? "Unknown Product"),
          brand: String(row.brand ?? product?.brand ?? "N/A"),
          category: String(row.category_name ?? getCategory(product)),
          size: String(row.size_label ?? product?.size ?? "N/A"),
          gender: String(product?.gender ?? "N/A"),
          stock,
          reorder,
          price: Number(row.average_unit_price ?? getPrice(product)),
          units30: 0,
          units90: Number(row.units_sold ?? 0),
          unitsPeriod: Number(row.units_sold ?? 0),
          revenue30: 0,
          revenue90: Number(row.revenue ?? 0),
          revenuePeriod: Number(row.revenue ?? 0),
          turnover: Number(row.turnover_ratio ?? 0),
          movement,
          stockCondition,
        };
      })
      .sort((a, b) => b.unitsPeriod - a.unitsPeriod || b.stock - a.stock);

    const dimRows = snapshotData.dimensions ?? [];
    const toRankRows = (type: "brand" | "size" | "category") =>
      dimRows
        .filter((row) => row.dimension_type === type)
        .sort((a, b) => Number(a.rank_position ?? 9999) - Number(b.rank_position ?? 9999))
        .slice(0, 5)
        .map((row) => ({
          name: row.dimension_value,
          units: Number(row.units ?? 0),
          revenue: Number(row.revenue ?? 0),
          share: Math.round(Number(row.share_percent ?? 0)),
        }));

    const categoryChart = dimRows
      .filter((row) => row.dimension_type === "category")
      .sort((a, b) => Number(b.units ?? 0) - Number(a.units ?? 0))
      .slice(0, 5)
      .map((row, index) => ({
        name: row.dimension_value,
        units: Number(row.units ?? 0),
        revenue: Number(row.revenue ?? 0),
        fill: ["#facc15", "#fde047", "#fef08a", "#fbbf24", "#fef9c3"][index],
      }));

    const promotionSuggestions = (snapshotData.recommendations ?? [])
      .slice(0, 5)
      .map((rec) => {
        const product = productById.get(String(rec.product_id ?? ""));
        const action = rec.recommendation_type === "markdown"
          ? `${Number(rec.suggested_discount_min ?? 10)}%-${Number(rec.suggested_discount_max ?? 15)}% discount`
          : rec.recommendation_type === "bundle_or_bogo"
            ? "Bundle or BOGO"
            : "Restock before promoting";
        return {
          title: rec.title,
          target: `${String(product?.brand ?? "N/A")} ${String(getCategory(product))}`,
          reason: rec.message,
          action,
        };
      });

    const totalUnits90 = productMovement.reduce((sum, product) => sum + Number(product.units90 ?? 0), 0);
    const totalStock = productMovement.reduce((sum, product) => sum + Number(product.stock ?? 0), 0);
    const avgInventory = Math.max(1, (totalStock + totalUnits90) / 2);

    return {
      ...computedAnalytics,
      productMovement,
      fastProducts: productMovement.filter((product) => product.movement === "Fast").slice(0, 5),
      slowProducts: productMovement.filter((product) => ["Slow", "Dead Stock"].includes(product.movement)).slice(0, 5),
      restockAlerts: productMovement.filter((product) => product.stock <= product.reorder || product.stock <= 0).slice(0, 6),
      inventoryTurnover: totalUnits90 / avgInventory,
      categoryChart,
      topBrands: toRankRows("brand"),
      topSizes: toRankRows("size"),
      topCategories: toRankRows("category"),
      promotionSuggestions: promotionSuggestions.length ? promotionSuggestions : computedAnalytics.promotionSuggestions,
    };
  }, [computedAnalytics, products, snapshotQuery.data]);

  if (salesQuery.isLoading || productsQuery.isLoading || customersQuery.isLoading || promotionsQuery.isLoading) {
    return <div className="text-sm text-white/60">Loading analytics...</div>;
  }

  const showProduct = analyticsView === "product";
  const showCustomer = analyticsView === "customer";
  const showSales = analyticsView === "sales";
  const showPromotion = analyticsView === "promotion";
  const hasActivePromotionPerformance = analytics.activePromotionChart.some((promo) => promo.revenue > 0 || promo.units > 0);
  const categoryUnitsTotal = analytics.categoryChart.reduce((sum, row) => sum + Number(row.units ?? 0), 0);
  const sizeCurveProducts = analytics.productMovement.slice(0, 40);
  const sizeCurveSizes = Array.from(
    new Set(sizeCurveProducts.map((product) => String(product.size ?? "N/A"))),
  ).sort(sortSizeLabels);
  const sizeCurveRows = Array.from(
    sizeCurveProducts.reduce((map, product) => {
      const key = [product.brand, product.name, product.category].join("::");
      const row = map.get(key) ?? {
        key,
        productName: product.name,
        brand: product.brand,
        category: product.category,
        totalSold: 0,
        totalStock: 0,
        sizes: new Map<string, any>(),
      };
      const size = String(product.size ?? "N/A");
      row.totalSold += Number(product.unitsPeriod ?? 0);
      row.totalStock += Number(product.stock ?? 0);
      row.sizes.set(size, product);
      map.set(key, row);
      return map;
    }, new Map<string, any>()).values(),
  )
    .sort((a, b) => b.totalSold - a.totalSold || b.totalStock - a.totalStock)
    .slice(0, 8);
  const maxSizeCurveSold = Math.max(1, ...sizeCurveProducts.map((product) => Number(product.unitsPeriod ?? 0)));
  const maxSizeCurveStock = Math.max(1, ...sizeCurveProducts.map((product) => Number(product.stock ?? 0)));

  const filterTabs = [
    { id: "product" as const, label: "Product Analytics", icon: Package, count: analytics.productMovement.length },
    { id: "customer" as const, label: "Customer Analytics", icon: Users, count: analytics.genderRows.length + analytics.ageRows.length },
    { id: "sales" as const, label: "Sales Analytics", icon: TrendingUp, count: analytics.trendChart.length },
    { id: "promotion" as const, label: "Promotion Analytics", icon: Sparkles, count: analytics.promotionPerformance.length },
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
                  labelStyle={{ color: "#facc15" }}
                  itemStyle={{ color: "#facc15" }}
                  formatter={(value: any) => [money(Number(value)), "Revenue"]}
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
                  labelStyle={{ color: "#facc15" }}
                  itemStyle={{ color: "#facc15" }}
                  formatter={(value: any) => {
                    const units = Number(value ?? 0);
                    const pct = categoryUnitsTotal > 0 ? Math.round((units / categoryUnitsTotal) * 100) : 0;
                    return [`${pct}% (${units} units)`, "Share"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {analytics.categoryChart.map((category) => (
                <div key={category.name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="truncate text-white/75">{category.name}</span>
                  <span className="font-semibold text-yellow-300">
                    {categoryUnitsTotal > 0 ? Math.round((Number(category.units ?? 0) / categoryUnitsTotal) * 100) : 0}%
                  </span>
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
                      labelStyle={{ color: "#facc15" }}
                      itemStyle={{ color: "#facc15" }}
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Active Promotions Comparison</p>
                  <p className="text-xs text-white/55">Revenue and units per campaign</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-white/75">
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                    Revenue
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-white/75">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Units
                  </span>
                </div>
              </div>
              {analytics.activePromotionChart.length && hasActivePromotionPerformance ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={analytics.activePromotionChart} margin={{ top: 8, right: 8, left: 8, bottom: 8 }} barGap={8}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#2f2f38" />
                    <XAxis dataKey="name" stroke="#a3a3a3" fontSize={12} interval={0} angle={0} textAnchor="middle" height={42} />
                    <YAxis yAxisId="left" stroke="#a3a3a3" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="#a3a3a3" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#18181f", border: "1px solid #3a3a45", borderRadius: "12px", color: "#fff" }}
                      labelStyle={{ color: "#facc15" }}
                      itemStyle={{ color: "#facc15" }}
                      formatter={(value: any, name: string) => [
                        name === "revenue" ? money(Number(value)) : `${value} units`,
                        name === "revenue" ? "Revenue" : "Units",
                      ]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? "Promotion"}
                    />
                    <Bar yAxisId="left" dataKey="revenue" fill="#facc15" radius={[6, 6, 0, 0]} name="revenue" barSize={22} />
                    <Bar yAxisId="right" dataKey="units" fill="#22c55e" radius={[6, 6, 0, 0]} name="units" barSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="rounded-xl border border-dashed border-[#2b2b36] bg-white/[0.02] p-5 text-center text-sm text-white/60">
                  {analytics.activePromotionChart.length
                    ? "Active promotions are detected, but no sales performance has been recorded yet."
                    : "No active promotions yet. Activate a campaign to view comparison graph."}
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
              {snapshotRefreshNote ? (
                <p className="mt-2 text-xs text-white/60">{snapshotRefreshNote}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshProductAnalytics}
                disabled={
                  isRefreshingSnapshots
                  || (
                    productAnalyticsPeriod === "custom"
                    && (
                      !customStartDate
                      || !customEndDate
                      || customStartDate > customEndDate
                    )
                  )
                }
                className="inline-flex items-center gap-2 rounded-xl border border-[#2b2b36] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-yellow-400/50 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingSnapshots ? "animate-spin" : ""}`} />
                {isRefreshingSnapshots ? "Refreshing..." : "Refresh Analytics"}
              </button>
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
              <button
                type="button"
                onClick={() => setProductAnalyticsPeriod("custom")}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  productAnalyticsPeriod === "custom"
                    ? "bg-yellow-400 text-red-950"
                    : "border border-[#2b2b36] bg-white/[0.03] text-white/70 hover:border-yellow-400/50 hover:text-yellow-200"
                }`}
              >
                Custom Range
              </button>
            </div>
          </div>
          {productAnalyticsPeriod === "custom" ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="rounded-xl border border-[#2b2b36] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50"
              />
              <input
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="rounded-xl border border-[#2b2b36] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50"
              />
              {customStartDate && customEndDate && customStartDate > customEndDate ? (
                <p className="sm:col-span-2 text-xs text-red-300">
                  End date must be on or after start date.
                </p>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-4">
            <div className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">Size Curve Bubble Heatmap</p>
                  <p className="mt-1 text-xs text-white/50">Rows are product styles, columns are sizes. Color shows sales velocity; bubble size shows stock depth.</p>
                </div>
                <Badge className="bg-yellow-400 text-red-950">{sizeCurveRows.length} styles</Badge>
              </div>
              {sizeCurveRows.length ? (
                <div className="overflow-x-auto rounded-xl border border-[#24242f] bg-[#15151d]">
                  <div
                    className="grid w-full min-w-max items-stretch"
                    style={{ gridTemplateColumns: `minmax(180px,1.35fr) repeat(${sizeCurveSizes.length}, minmax(76px,1fr)) minmax(84px,0.6fr) minmax(84px,0.6fr)` }}
                  >
                    <div className="sticky left-0 z-10 border-b border-r border-[#2b2b36] bg-[#1b1b26] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/55">
                      Style
                    </div>
                    {sizeCurveSizes.map((size) => (
                      <div key={size} className="border-b border-r border-[#2b2b36] bg-[#1b1b26] px-2 py-2 text-center text-xs font-semibold text-yellow-300">
                        {size}
                      </div>
                    ))}
                    <div className="border-b border-r border-[#2b2b36] bg-[#1b1b26] px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em] text-white/55">
                      Sold
                    </div>
                    <div className="border-b border-[#2b2b36] bg-[#1b1b26] px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em] text-white/55">
                      Stock
                    </div>

                    {sizeCurveRows.map((row) => (
                      <div key={row.key} className="contents">
                        <div className="sticky left-0 z-10 border-b border-r border-[#2b2b36] bg-[#15151d] px-3 py-3">
                          <p className="truncate text-sm font-semibold text-white" title={row.productName}>{row.productName}</p>
                          <p className="truncate text-xs text-white/45">{row.brand} - {row.category}</p>
                        </div>
                        {sizeCurveSizes.map((size) => {
                          const product = row.sizes.get(size);
                          const sold = Number(product?.unitsPeriod ?? 0);
                          const stock = Number(product?.stock ?? 0);
                          const diameter = product ? Math.max(12, Math.min(36, 10 + (stock / maxSizeCurveStock) * 26)) : 0;
                          const backgroundColor = salesVelocityColor(sold, maxSizeCurveSold);
                          return (
                            <div
                              key={`${row.key}-${size}`}
                              className="flex min-h-[68px] items-center justify-center border-b border-r border-[#2b2b36] px-2 py-2"
                              title={product ? `${row.productName} / Size ${size}: ${sold} sold, ${stock} stock` : `${row.productName} / Size ${size}: no variant`}
                            >
                              {product ? (
                                <div className="flex flex-col items-center gap-1">
                                  <span
                                    className="inline-flex items-center justify-center rounded-full border border-white/25 text-[10px] font-bold text-white shadow-sm"
                                    style={{ width: `${diameter}px`, height: `${diameter}px`, backgroundColor }}
                                  >
                                    {stock}
                                  </span>
                                  <span className="text-[10px] font-semibold text-white/60">{sold} sold</span>
                                </div>
                              ) : (
                                <span className="text-xs text-white/20">-</span>
                              )}
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-center border-b border-r border-[#2b2b36] px-2 py-3 text-sm font-semibold text-yellow-300">
                          {row.totalSold}
                        </div>
                        <div className="flex items-center justify-center border-b border-[#2b2b36] px-2 py-3 text-sm font-semibold text-white">
                          {row.totalStock}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-[#2b2b36] text-sm text-white/50">
                  No size-curve data yet.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">How to Read</p>
                  <p className="mt-1 text-xs text-white/50">Use it like a retail size-curve report.</p>
                </div>
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                  <p className="font-semibold text-emerald-200">Bright color + small bubble</p>
                  <p className="mt-1 text-xs text-white/60">Popular size is selling, but stock is low. Reorder first.</p>
                </div>
                <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 p-3">
                  <p className="font-semibold text-orange-200">Light/gray color + large bubble</p>
                  <p className="mt-1 text-xs text-white/60">Stock is deep but sales are weak. Consider markdown or promo.</p>
                </div>
                <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/10 p-3">
                  <p className="font-semibold text-yellow-200">Number inside bubble</p>
                  <p className="mt-1 text-xs text-white/60">Current stock for that size. Text below is units sold.</p>
                </div>
              </div>
            </div>
          </div>

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

              <div className="w-full rounded-xl border border-[#2b2b36] bg-[#0f1017] p-2 xl:w-[350px]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow-300/80">Period</span>
                  <Badge className="bg-yellow-400 px-2 py-0.5 text-[11px] text-red-950">{analytics.topRankingPeriodLabel}</Badge>
                </div>

                <div className="relative">
                  <select
                    value={topRankingPeriod}
                    onChange={(event) => setTopRankingPeriod(event.target.value as RevenueTrendPeriod)}
                    className="h-8 w-full appearance-none rounded-md border border-[#2b2b36] bg-[#181820] px-3 pr-8 text-[13px] font-medium text-white outline-none transition focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400/40"
                  >
                    {revenueTrendOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/70">⌄</span>
                </div>

                <div className="mb-1 mt-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow-300/80">Rank by</span>
                </div>
                <div className="relative">
                  <select
                    value={topRankingMetric}
                    onChange={(event) => setTopRankingMetric(event.target.value as RankingMetric)}
                    className="h-8 w-full appearance-none rounded-md border border-yellow-400 bg-[#181820] px-3 pr-8 text-[13px] font-medium text-white outline-none transition focus:ring-1 focus:ring-yellow-400/40"
                  >
                    <option value="units">Units</option>
                    <option value="revenue">Revenue</option>
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/80">⌄</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { title: "Top Brands", subtitle: "Which brands customers choose most", rows: analytics.topBrands },
              { title: "Top Sizes", subtitle: "Sizes to prioritize when restocking", rows: analytics.topSizes },
              { title: "Top Shoe Categories", subtitle: "Shoe groups with strongest demand", rows: analytics.topCategories },
            ].map((group) => (
              <div key={group.title} className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{group.title}</p>
                    <Badge className="bg-white/10 text-xs text-white/70">{group.rows.length} ranked</Badge>
                  </div>
                  <p className="mt-1 text-xs text-white/45">{group.subtitle}</p>
                </div>
                {group.rows.length ? (
                  <div className="h-[280px] rounded-xl border border-[#2b2b36] bg-[#181820] p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={group.rows.map((row: any) => ({
                          name: shortLabel(row.name, 14),
                          value: topRankingMetric === "revenue" ? Number(row.revenue ?? 0) : Number(row.units ?? 0),
                          display: topRankingMetric === "revenue" ? money(Number(row.revenue ?? 0)) : `${row.units} units`,
                        }))}
                        layout="vertical"
                        margin={{ top: 8, right: 20, bottom: 8, left: 6 }}
                      >
                        <CartesianGrid stroke="#2b2b36" horizontal={false} />
                        <XAxis type="number" stroke="#a1a1aa" tick={{ fill: "#d4d4d8", fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" width={120} stroke="#a1a1aa" tick={{ fill: "#d4d4d8", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ background: "#101017", border: "1px solid #2b2b36", borderRadius: 12 }}
                          labelStyle={{ color: "#facc15" }}
                          itemStyle={{ color: "#facc15" }}
                          formatter={(value: any) =>
                            topRankingMetric === "revenue" ? money(Number(value)) : `${Number(value)} units`
                          }
                        />
                        <Bar dataKey="value" radius={[0, 8, 8, 0]} fill="#facc15" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <span className="text-sm text-white/45">No data yet.</span>
                )}
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
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Customer Analytics Period</p>
                <p className="text-xs text-white/50">Filter gender and age charts by time window.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {customerPeriodOptions.map((option) => {
                  const active = customerAnalyticsPeriod === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setCustomerAnalyticsPeriod(option.id)}
                      className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
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
          </CardContent>
        </Card>

        <Card className="bg-[#16161d] border-[#2b2b36]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Users className="h-5 w-5 text-yellow-400" /> Gender Analytics
                </CardTitle>
                <p className="mt-2 text-sm text-white/55">Demand grouped by customer gender ({analytics.customerPeriodLabel}).</p>
              </div>
              <Badge className="bg-yellow-400 text-red-950">{analytics.genderRows.length} groups</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.genderRows.length ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.genderChart}>
                        <CartesianGrid stroke="#2b2b36" vertical={false} />
                        <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fill: "#d4d4d8", fontSize: 12 }} />
                        <YAxis stroke="#a1a1aa" tick={{ fill: "#d4d4d8", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{ background: "#101017", border: "1px solid #2b2b36", borderRadius: 12 }}
                          labelStyle={{ color: "#facc15" }}
                          itemStyle={{ color: "#facc15" }}
                          formatter={(value: any, name: string) => (name === "revenue" ? money(Number(value)) : value)}
                        />
                        <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                          {analytics.genderChart.map((row: any) => (
                            <Cell key={row.fullLabel} fill={row.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[#2b2b36] bg-[#111118]">
                  <div className="overflow-x-auto">
                  <Table className="table-fixed w-full min-w-[980px]">
                    <colgroup>
                      <col className="w-[11%]" />
                      <col className="w-[11%]" />
                      <col className="w-[9%]" />
                      <col className="w-[24%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[18%]" />
                    </colgroup>
                    <TableHeader className="bg-[#1f1f28]">
                      <TableRow className="border-[#2b2b36] hover:bg-[#1f1f28]">
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Gender</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Top Brand</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Top Size</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Top Product</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Customers</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Orders</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Units</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.genderRows.map((row: any) => (
                        <TableRow key={row.label} className="border-[#2b2b36] hover:bg-white/[0.03]">
                          <TableCell className="py-3 text-center align-middle font-semibold text-white">{row.label}</TableCell>
                          <TableCell className="py-3 text-center align-middle text-white/80">{row.topBrand}</TableCell>
                          <TableCell className="py-3 text-center align-middle text-white/80">{row.topSize}</TableCell>
                          <TableCell className="py-3 text-center align-middle truncate text-white/80">{row.topProduct}</TableCell>
                          <TableCell className="py-3 text-center align-middle"><Badge className="bg-green-700 text-white">{row.customers}</Badge></TableCell>
                          <TableCell className="py-3 text-center align-middle text-white">{row.orders}</TableCell>
                          <TableCell className="py-3 text-center align-middle text-yellow-300">{row.units}</TableCell>
                          <TableCell className="py-3 text-center align-middle font-semibold text-yellow-300">{money(row.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              </div>
            ) : (
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
                <p className="mt-2 text-sm text-white/55">Demand grouped by recorded age ({analytics.customerPeriodLabel}).</p>
              </div>
              <Badge className="bg-yellow-400 text-red-950">{analytics.ageRows.length} groups</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.ageRows.length ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[#2b2b36] bg-[#111118] p-4">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.ageChart} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid stroke="#2b2b36" horizontal={false} />
                        <XAxis type="number" stroke="#a1a1aa" tick={{ fill: "#d4d4d8", fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" stroke="#a1a1aa" tick={{ fill: "#d4d4d8", fontSize: 12 }} width={140} />
                        <Tooltip
                          contentStyle={{ background: "#101017", border: "1px solid #2b2b36", borderRadius: 12 }}
                          labelStyle={{ color: "#facc15" }}
                          itemStyle={{ color: "#facc15" }}
                          formatter={(value: any, name: string) => (name === "revenue" ? money(Number(value)) : value)}
                        />
                        <Bar dataKey="revenue" radius={[0, 8, 8, 0]}>
                          {analytics.ageChart.map((row: any) => (
                            <Cell key={row.fullLabel} fill={row.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[#2b2b36] bg-[#111118]">
                  <div className="overflow-x-auto">
                  <Table className="table-fixed w-full min-w-[980px]">
                    <colgroup>
                      <col className="w-[12%]" />
                      <col className="w-[11%]" />
                      <col className="w-[9%]" />
                      <col className="w-[23%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[9%]" />
                      <col className="w-[18%]" />
                    </colgroup>
                    <TableHeader className="bg-[#1f1f28]">
                      <TableRow className="border-[#2b2b36] hover:bg-[#1f1f28]">
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Age Range</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Top Brand</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Top Size</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Top Product</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Customers</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Orders</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Units</TableHead>
                        <TableHead className="py-3 text-center text-sm font-semibold text-white">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.ageRows.map((row: any) => (
                        <TableRow key={row.label} className="border-[#2b2b36] hover:bg-white/[0.03]">
                          <TableCell className="py-3 text-center align-middle font-semibold text-white">{row.label}</TableCell>
                          <TableCell className="py-3 text-center align-middle text-white/80">{row.topBrand}</TableCell>
                          <TableCell className="py-3 text-center align-middle text-white/80">{row.topSize}</TableCell>
                          <TableCell className="py-3 text-center align-middle truncate text-white/80">{row.topProduct}</TableCell>
                          <TableCell className="py-3 text-center align-middle"><Badge className="bg-green-700 text-white">{row.customers}</Badge></TableCell>
                          <TableCell className="py-3 text-center align-middle text-white">{row.orders}</TableCell>
                          <TableCell className="py-3 text-center align-middle text-yellow-300">{row.units}</TableCell>
                          <TableCell className="py-3 text-center align-middle font-semibold text-yellow-300">{money(row.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#2b2b36] bg-[#111118] p-6 text-center">
                <p className="font-semibold text-white/70">No age range analytics yet</p>
                <p className="mt-1 text-sm text-white/45">Add age or birthdate values to customer profiles to unlock this view.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {showProduct && <Card className="bg-[#16161d] border-[#2b2b36]">
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
