import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tag, Plus, Edit, Trash2, TrendingUp, Coins, ShoppingCart, Percent, Mail, CheckCircle, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useCustomers, useProducts, usePromotions, usePromotionsMutations, useSales } from '../../lib/hooks';
import { useAuth } from '../../lib/auth-context';
import { writeAuditLog } from '../../lib/audit';
import { supabase } from '../../lib/supabase';

type Promotion = {
  promo_id: string;
  promo_name: string;
  discount_type: 'Percentage' | 'Fixed Amount' | 'BOGO' | 'Bundle';
  discount_value: number;
  targetProducts: string;
  start_date: string;
  end_date: string;
  status: 'Active' | 'Scheduled' | 'Ended';
  salesGenerated: number;
  unitsAffected: number;
  effectiveness: number;
  targetSalesGoal: number;
};

type Notification = {
  notification_id: string;
  customer_id: string;
  promo_id: string;
  email: string;
  email_status: 'sent' | 'pending' | 'failed' | 'Sent' | 'Pending' | 'Failed';
  date_sent: string;
  send_error?: string;
};

type Customer = {
  customer_id: string;
  name: string;
  email: string;
  status: 'Active' | 'Inactive';
};

type PromotionRecommendation = {
  id: string;
  title: string;
  rationale: string;
  discount_type: Promotion['discount_type'];
  discount_value: number;
  targetProducts: string;
};

type PromotionMarginProduct = {
  id: string;
  name: string;
  category: string;
  srp: number;
  unitCost: number;
  stock: number;
  reorderLevel: number;
  sold30: number;
  isSlowMover: boolean;
};


const PROMO_TYPE_MARKERS = {
  bundle: "__TYPE_BUNDLE__",
  bogo: "__TYPE_BOGO__",
} as const;

function stripPromoTypeMarker(name: string | undefined) {
  const value = String(name ?? "");
  return value
    .replace(PROMO_TYPE_MARKERS.bundle, "")
    .replace(PROMO_TYPE_MARKERS.bogo, "")
    .trim();
}

function encodePromoNameWithType(name: string | undefined, type: Promotion["discount_type"] | string | undefined) {
  const cleanName = stripPromoTypeMarker(name);
  const normalizedType = String(type ?? "").toLowerCase();
  if (normalizedType.includes("bundle")) return `${cleanName} ${PROMO_TYPE_MARKERS.bundle}`.trim();
  if (normalizedType.includes("bogo") || normalizedType.includes("buy one get one")) {
    return `${cleanName} ${PROMO_TYPE_MARKERS.bogo}`.trim();
  }
  return cleanName;
}

function decodeDisplayType(rawType: string, rawName: string | undefined): Promotion["discount_type"] {
  const loweredName = String(rawName ?? "").toLowerCase();
  if (loweredName.includes(PROMO_TYPE_MARKERS.bundle.toLowerCase())) return "Bundle";
  if (loweredName.includes(PROMO_TYPE_MARKERS.bogo.toLowerCase())) return "BOGO";
  if (rawType.includes("fixed")) return "Fixed Amount";
  return "Percentage";
}

function toDbDiscountType(value: Promotion['discount_type'] | string | undefined) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('bundle')) return 'fixed';
  if (normalized.includes('fixed')) return 'fixed';
  if (normalized.includes('bogo')) return 'percentage';
  return 'percentage';
}

function toDbStatus(value: Promotion['status'] | string | undefined, startDate?: string) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('ended')) return 'expired';
  if (normalized.includes('scheduled')) return 'inactive';
  if (normalized.includes('active')) return 'active';
  return 'inactive';
}

function isMissingTargetProductsColumnError(error: any) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return message.includes("target_products") && message.includes("column");
}

function todayDateInput() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60 * 1000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function validatePromotionDates(startDate?: string, endDate?: string) {
  const today = todayDateInput();
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  if (!start || !end) return 'Please choose both start and end dates.';
  if (start < today) return 'Start date cannot be in the past.';
  if (end < today) return 'End date cannot be in the past.';
  if (end < start) return 'End date cannot be earlier than the start date.';
  return '';
}

function formatTargetProducts(categories: string[], products: string[]) {
  const cats = categories.filter(Boolean);
  const prods = products.filter(Boolean);
  if (!cats.length && !prods.length) return 'All Products';
  if (!cats.length) return `Products: ${prods.join(', ')}`;
  if (!prods.length) return `Categories: ${cats.join(', ')}`;
  return `Categories: ${cats.join(', ')} | Products: ${prods.join(', ')}`;
}

function parseTargetProducts(text: string | undefined) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.toLowerCase() === 'all products') {
    return { categories: [] as string[], products: [] as string[] };
  }

  const categories: string[] = [];
  const products: string[] = [];
  raw.split('|').forEach((segment) => {
    const value = segment.trim();
    if (!value) return;
    if (value.toLowerCase().startsWith('categories:')) {
      value
        .slice('categories:'.length)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => categories.push(v));
      return;
    }
    if (value.toLowerCase().startsWith('products:')) {
      value
        .slice('products:'.length)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => products.push(v));
      return;
    }
    // Backward compatibility: handle old recommendation format like "Running Shoes Category".
    if (value.toLowerCase().endsWith(' category')) {
      categories.push(value.slice(0, -' category'.length).trim());
      return;
    }
    products.push(value);
  });

  return {
    categories: Array.from(new Set(categories)),
    products: Array.from(new Set(products)),
  };
}

function normalizeRecommendationTarget(value: string | undefined) {
  return String(value ?? 'All Products')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function recommendationSignature(type: string | undefined, target: string | undefined) {
  return `${String(type ?? '').toLowerCase()}::${normalizeRecommendationTarget(target)}`;
}

function rangesOverlap(startA?: string, endA?: string, startB?: string, endB?: string) {
  const aStart = String(startA ?? "").slice(0, 10);
  const aEnd = String(endA ?? "").slice(0, 10);
  const bStart = String(startB ?? "").slice(0, 10);
  const bEnd = String(endB ?? "").slice(0, 10);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return !(aEnd < bStart || bEnd < aStart);
}

function normalizeTargetSignature(target: string | undefined) {
  const parsed = parseTargetProducts(target);
  const categories = Array.from(new Set(parsed.categories.map((c) => c.trim().toLowerCase()))).sort();
  const products = Array.from(new Set(parsed.products.map((p) => p.trim().toLowerCase()))).sort();
  if (!categories.length && !products.length) return "all";
  return `c:${categories.join(",")}|p:${products.join(",")}`;
}

function getPromoPriority(discountType: string | undefined) {
  const type = String(discountType ?? "").toLowerCase();
  if (type.includes("bogo")) return 4;
  if (type.includes("bundle")) return 3;
  if (type.includes("fixed")) return 2;
  if (type.includes("percent")) return 1;
  return 0;
}

function estimatePromotionPrice(srp: number, discountType: string | undefined, discountValue: number) {
  const type = String(discountType ?? "").toLowerCase();
  const value = Number(discountValue || 0);
  if (srp <= 0) return 0;
  if (type.includes("percent") || type.includes("bogo")) {
    return Math.max(0, srp * (1 - value / 100));
  }
  if (type.includes("fixed") || type.includes("bundle")) {
    return Math.max(0, srp - value);
  }
  return srp;
}

function resolvePromotionTargetProducts(targetProducts: string | undefined, products: PromotionMarginProduct[]) {
  const parsed = parseTargetProducts(targetProducts);
  const wantsAll = !parsed.categories.length && !parsed.products.length;
  const categories = new Set(parsed.categories.map((c) => c.trim().toLowerCase()));
  const names = new Set(parsed.products.map((p) => p.trim().toLowerCase()));

  return products.filter((product) => {
    const category = product.category.trim().toLowerCase();
    const name = product.name.trim().toLowerCase();
    if (wantsAll) return true;
    if (names.size > 0) {
      if (!names.has(name)) return false;
      return !categories.size || categories.has(category);
    }
    return categories.has(category);
  });
}

function saleIsCompleted(sale: any) {
  const payment = Array.isArray(sale?.payment) ? sale.payment[0] : sale?.payment;
  const status = String(payment?.payment_status ?? sale?.payment_status ?? '').toLowerCase();
  return status === 'completed' || status === 'paid' || !status;
}

function productDetailMatchesPromotion(detail: any, promotion: Promotion) {
  const product = Array.isArray(detail?.product) ? detail.product[0] : detail?.product;
  const productName = String(product?.product_name ?? '').trim().toLowerCase();
  const category = Array.isArray(product?.category) ? product.category[0] : product?.category;
  const categoryName = String(category?.category_name ?? '').trim().toLowerCase();
  const parsed = parseTargetProducts(promotion.targetProducts);
  const wantsAll = !parsed.categories.length && !parsed.products.length;
  const categories = new Set(parsed.categories.map((item) => item.trim().toLowerCase()));
  const products = new Set(parsed.products.map((item) => item.trim().toLowerCase()));

  if (wantsAll) return true;
  if (products.size > 0) {
    if (!products.has(productName)) return false;
    return !categories.size || categories.has(categoryName);
  }
  return categories.has(categoryName);
}

function sanitizeTargetProductsToSellable(
  targetProducts: string | undefined,
  categoryOptions: string[],
  productOptions: Array<{ name: string; category: string; stock: number }>,
) {
  const parsed = parseTargetProducts(targetProducts);
  const allowedCategories = new Set(categoryOptions.map((c) => c.trim().toLowerCase()));
  const productByName = new Map(
    productOptions.map((p) => [p.name.trim().toLowerCase(), { name: p.name, category: p.category }]),
  );

  const categories = parsed.categories.filter((c) => allowedCategories.has(c.trim().toLowerCase()));
  const normalizedCategorySet = new Set(categories.map((c) => c.trim().toLowerCase()));

  const products = parsed.products.filter((p) => {
    const row = productByName.get(p.trim().toLowerCase());
    if (!row) return false;
    if (!normalizedCategorySet.size) return true;
    return normalizedCategorySet.has(String(row.category || "").trim().toLowerCase());
  });

  return formatTargetProducts(
    Array.from(new Set(categories)),
    Array.from(new Set(products)),
  );
}

function deriveTargetProductsFromLinks(row: any) {
  const links = Array.isArray(row?.promo_product) ? row.promo_product : [];
  if (!links.length) return 'All Products';
  const categories = new Set<string>();
  const products = new Set<string>();
  links.forEach((link: any) => {
    const product = Array.isArray(link?.product) ? link.product[0] : link?.product;
    const productName = String(product?.product_name ?? '').trim();
    const categoryName = String(product?.category?.[0]?.category_name ?? product?.category?.category_name ?? '').trim();
    if (productName) products.add(productName);
    if (categoryName) categories.add(categoryName);
  });
  if (!categories.size && !products.size) return 'All Products';
  const categoryList = Array.from(categories);
  const productList = Array.from(products);

  // Keep table labels concise: prefer category summary when links include category coverage.
  if (categoryList.length > 0) {
    return `Categories: ${categoryList.join(', ')}`;
  }
  if (productList.length <= 3) {
    return `Products: ${productList.join(', ')}`;
  }
  return `Products: ${productList.slice(0, 3).join(', ')} +${productList.length - 3} more`;
}

function normalizeRecommendationTitle(value: string | undefined) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function PromotionManagement() {
  const { user } = useAuth();
  const salesQuery = useSales();
  const productsQuery = useProducts();
  const promotionsQuery = usePromotions();
  const promotionsMutations = usePromotionsMutations();
  const customersQuery = useCustomers();
  const customers: Customer[] = ((customersQuery.data as any[]) ?? []).map((row: any) => ({
    customer_id: String(row.customer_id ?? ''),
    name: String(row.customer_name ?? row.name ?? 'Customer'),
    email: String(row.email ?? '').trim(),
    status: String(row.status ?? 'active').toLowerCase() === 'active' ? 'Active' : 'Inactive',
  }));
  const customerNameMap = new Map(customers.map((c) => [c.customer_id, c.name]));
  const productRows = (productsQuery.data as any[]) ?? [];
  const sellableProductRows = useMemo(
    () =>
      productRows.filter((p: any) => {
        const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
        const stock = Number(inv?.stock_quantity ?? 0);
        const invStatus = String(inv?.inventory_status ?? 'active').toLowerCase();
        const productStatus = String(p.status ?? 'active').toLowerCase();
        return stock > 0 && invStatus === 'active' && productStatus === 'active';
      }),
    [productRows],
  );
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          sellableProductRows
            .map(
              (p: any) =>
                String(p.category?.[0]?.category_name ?? p.category?.category_name ?? '').trim(),
            )
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [sellableProductRows],
  );
  const productOptions = useMemo(
    () =>
      sellableProductRows
        .map((p: any) => {
          const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
          return {
            name: String(p.product_name ?? 'Unknown Product').trim(),
            category: String(p.category?.[0]?.category_name ?? p.category?.category_name ?? '').trim(),
            stock: Number(inv?.stock_quantity ?? 0),
          };
        })
        .filter((p: any) => p.name)
        .reduce((acc: Array<{ name: string; category: string; stock: number }>, current) => {
          const idx = acc.findIndex(
            (row) => row.name.toLowerCase() === current.name.toLowerCase() && row.category.toLowerCase() === current.category.toLowerCase(),
          );
          if (idx >= 0) acc[idx] = { ...acc[idx], stock: acc[idx].stock + current.stock };
          else acc.push(current);
          return acc;
        }, [])
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [sellableProductRows],
  );
  const promotionMarginProducts = useMemo<PromotionMarginProduct[]>(() => {
    const sales = (salesQuery.data as any[]) ?? [];
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    const soldByProduct = new Map<string, number>();

    sales.forEach((sale: any) => {
      const txDate = new Date(sale.transaction_date ?? sale.created_at ?? '');
      if (Number.isNaN(txDate.getTime()) || txDate < last30) return;
      const payment = Array.isArray(sale.payment) ? sale.payment[0] : sale.payment;
      const status = String(payment?.payment_status ?? '').toLowerCase();
      if (status !== 'completed' && status !== 'paid') return;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((detail: any) => {
        const productId = String(detail.product_id ?? '');
        if (!productId) return;
        soldByProduct.set(productId, (soldByProduct.get(productId) ?? 0) + Number(detail.quantity ?? 0));
      });
    });

    return sellableProductRows
      .map((p: any) => {
        const inv = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
        const productId = String(p.product_id ?? '');
        const stock = Number(inv?.stock_quantity ?? 0);
        const reorderLevel = Number(p.reorder_level ?? inv?.reorder_level ?? 10);
        const sold30 = soldByProduct.get(productId) ?? 0;
        return {
          id: productId,
          name: String(p.product_name ?? 'Unknown Product').trim(),
          category: String(p.category?.[0]?.category_name ?? p.category?.category_name ?? '').trim(),
          srp: Number(inv?.srp ?? p.srp ?? p.selling_price ?? p.price ?? 0),
          unitCost: Number(p.cost_price ?? p.unit_price ?? p.base_price ?? 0),
          stock,
          reorderLevel,
          sold30,
          isSlowMover: stock >= reorderLevel * 2 && sold30 <= 2,
        };
      })
      .filter((p) => p.id && p.name && p.srp > 0 && p.unitCost > 0);
  }, [salesQuery.data, sellableProductRows]);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [formData, setFormData] = useState<Partial<Promotion>>({
    promo_name: '',
    discount_type: 'Percentage',
    discount_value: 0,
    targetSalesGoal: 10000,
    targetProducts: '',
    start_date: '',
    end_date: '',
    status: 'Scheduled'
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hiddenRecommendationIds, setHiddenRecommendationIds] = useState<Set<string>>(new Set());
  const [pendingRecommendationId, setPendingRecommendationId] = useState<string | null>(null);
  const [showNotificationDialog, setShowNotificationDialog] = useState(false);
  const [lastNotificationBatch, setLastNotificationBatch] = useState<Notification[]>([]);
  const [lastNotificationPromo, setLastNotificationPromo] = useState<Partial<Promotion>>({});
  const [isSavingPromotion, setIsSavingPromotion] = useState(false);
  const [isUpdatingPromotion, setIsUpdatingPromotion] = useState(false);

  const syncPromotionProductLinks = async (promoId: string, targetProducts: string | undefined) => {
    const promo_id = String(promoId ?? '').trim();
    if (!promo_id) return;

    const parsed = parseTargetProducts(targetProducts);
    const wantsAll = !parsed.categories.length && !parsed.products.length;
    const productRowsForLink = sellableProductRows;
    const normalizedCategories = new Set(parsed.categories.map((c) => c.toLowerCase()));
    const normalizedProducts = new Set(parsed.products.map((p) => p.toLowerCase()));

    const targetProductIds = productRowsForLink
      .filter((row: any) => {
        const productName = String(row?.product_name ?? '').trim();
        const categoryName = String(row?.category?.[0]?.category_name ?? row?.category?.category_name ?? '').trim();
        if (!productName) return false;
        if (wantsAll) return false;
        if (normalizedProducts.size > 0) {
          if (!normalizedProducts.has(productName.toLowerCase())) return false;
          if (normalizedCategories.size > 0 && !normalizedCategories.has(categoryName.toLowerCase())) return false;
          return true;
        }
        return normalizedCategories.has(categoryName.toLowerCase());
      })
      .map((row: any) => String(row?.product_id ?? '').trim())
      .filter(Boolean);

    await supabase.from('promo_product').delete().eq('promo_id', promo_id);
    if (!targetProductIds.length) return;

    const uniqueIds = Array.from(new Set(targetProductIds));
    const rows = uniqueIds.map((product_id) => ({ promo_id, product_id }));
    const { error } = await supabase.from('promo_product').insert(rows as any);
    if (error) throw error;
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('promotions.hiddenRecommendationIds');
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      setHiddenRecommendationIds(new Set(ids.map((id) => String(id))));
    } catch {
      // ignore bad stored values
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'promotions.hiddenRecommendationIds',
        JSON.stringify(Array.from(hiddenRecommendationIds)),
      );
    } catch {
      // ignore local storage write failures
    }
  }, [hiddenRecommendationIds]);

  const triggerPromotionEmailNotification = async (promoId: string) => {
    const parseResult = async (response: Response) => response.json().catch(() => ({}));
    const callNotify = async (url: string) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const result = await parseResult(response);
      return { response, result };
    };

    const secureUrl = `/api/promotions/${encodeURIComponent(promoId)}/notify`;
    const publicUrl = `/api/promotions/${encodeURIComponent(promoId)}/notify/public`;

    let { response, result } = await callNotify(secureUrl);

    const needsPublicFallback =
      !response.ok &&
      String(result?.error || '').toLowerCase() === 'authentication_required';

    if (needsPublicFallback) {
      ({ response, result } = await callNotify(publicUrl));
    }

    if (!response.ok || result?.ok === false) {
      throw new Error(result?.error || 'Failed to send promotion notifications');
    }

    return result as {
      ok: boolean;
      promo_id: string;
      delivery?: { enabled?: boolean; sent?: number; failed?: number; reason?: string };
      recipients?: Notification[];
    };
  };

  const promotions: Promotion[] = useMemo(() => {
    const rows = (promotionsQuery.data as any[]) ?? [];
    const sales = (salesQuery.data as any[]) ?? [];
    return rows.map((row) => {
      const rawType = String(row.discount_type ?? 'Percentage').toLowerCase();
      const discount_type: Promotion['discount_type'] = decodeDisplayType(rawType, row.promo_name);
      const rawStatus = String(row.status ?? 'Scheduled').toLowerCase();
      const today = new Date().toISOString().slice(0, 10);
      const start = String(row.start_date ?? '').slice(0, 10);
      const end = String(row.end_date ?? '').slice(0, 10);
      const status: Promotion['status'] =
        rawStatus.includes('expired') || (end && end < today)
          ? 'Ended'
          : rawStatus.includes('active') || (start && start <= today && end && end >= today)
            ? 'Active'
            : 'Scheduled';
      const targetSalesGoal = Number(row.target_sales_goal ?? row.targetSalesGoal ?? 10000) || 10000;
      const basePromotion = {
        promo_id: String(row.promo_id ?? ''),
        promo_name: stripPromoTypeMarker(String(row.promo_name ?? 'Promotion')),
        discount_type,
        discount_value: Number(row.discount_value ?? 0),
        targetProducts: String(row.target_products ?? row.targetProducts ?? deriveTargetProductsFromLinks(row)),
        start_date: String(row.start_date ?? '').slice(0, 10),
        end_date: String(row.end_date ?? '').slice(0, 10),
        status,
        salesGenerated: 0,
        unitsAffected: 0,
        effectiveness: 0,
        targetSalesGoal,
      };
      const performance = sales.reduce(
        (sum, sale: any) => {
          if (!saleIsCompleted(sale)) return sum;
          const saleDate = String(sale.transaction_date ?? sale.created_at ?? '').slice(0, 10);
          if (start && saleDate && saleDate < start) return sum;
          if (end && saleDate && saleDate > end) return sum;
          const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
          details.forEach((detail: any) => {
            const discount = Number(detail.discount_applied ?? 0);
            if (discount <= 0) return;
            if (!productDetailMatchesPromotion(detail, basePromotion)) return;
            sum.sales += Number(detail.subtotal ?? 0);
            sum.units += Number(detail.quantity ?? 0);
          });
          return sum;
        },
        { sales: 0, units: 0 },
      );

      return {
        ...basePromotion,
        salesGenerated: Math.round(performance.sales),
        unitsAffected: performance.units,
        effectiveness: Math.min(100, Math.round((performance.sales / Math.max(1, targetSalesGoal)) * 100)),
      };
    });
  }, [promotionsQuery.data, salesQuery.data]);

  const productRecommendations = useMemo<PromotionRecommendation[]>(() => {
    const sales = (salesQuery.data as any[]) ?? [];
    const products = (productsQuery.data as any[]) ?? [];
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);

    const soldByProduct = new Map<string, number>();
    sales.forEach((sale: any) => {
      const txDate = new Date(sale.transaction_date ?? sale.created_at ?? '');
      if (Number.isNaN(txDate.getTime()) || txDate < last30) return;
      const payment = Array.isArray(sale.payment) ? sale.payment[0] : sale.payment;
      const status = String(payment?.payment_status ?? '').toLowerCase();
      if (status !== 'completed' && status !== 'paid') return;
      const details = Array.isArray(sale.sales_details) ? sale.sales_details : [];
      details.forEach((d: any) => {
        const pid = String(d.product_id ?? '');
        if (!pid) return;
        soldByProduct.set(pid, (soldByProduct.get(pid) ?? 0) + Number(d.quantity ?? 0));
      });
    });

    const rows = products.map((p: any) => {
      const inventory = Array.isArray(p.inventory) ? p.inventory[0] : p.inventory;
      const stock = Number(inventory?.stock_quantity ?? 0);
      const reorder = Number(p.reorder_level ?? inventory?.reorder_level ?? 10);
      const sold30 = soldByProduct.get(String(p.product_id ?? '')) ?? 0;
      const velocity = sold30 / 30;
      return {
        id: String(p.product_id ?? ''),
        name: String(p.product_name ?? 'Unknown Product'),
        category: String(p.category?.[0]?.category_name ?? p.category?.category_name ?? 'General'),
        stock,
        reorder,
        sold30,
        velocity,
      };
    });

    const slow = rows
      .filter((r) => r.stock >= r.reorder * 2 && r.sold30 > 0 && r.sold30 <= 5)
      .sort((a, b) => a.sold30 - b.sold30)[0];
    const overstock = rows
      .filter((r) => r.stock >= r.reorder * 3 && r.sold30 <= 2)
      .sort((a, b) => b.stock - a.stock)[0];
    const categoryRollup = new Map<string, { stock: number; sold: number }>();
    rows.forEach((r) => {
      const prev = categoryRollup.get(r.category) ?? { stock: 0, sold: 0 };
      categoryRollup.set(r.category, { stock: prev.stock + r.stock, sold: prev.sold + r.sold30 });
    });
    const weakCategory = Array.from(categoryRollup.entries())
      .map(([category, v]) => ({ category, ratio: v.stock > 0 ? v.sold / v.stock : 0 }))
      .sort((a, b) => a.ratio - b.ratio)[0];

    const recs: PromotionRecommendation[] = [];
    if (slow) {
      recs.push({
        id: `slow-${slow.id}`,
        title: `Boost slow mover: ${slow.name}`,
        rationale: `${slow.sold30} sold in 30d with ${slow.stock} units on hand.`,
        discount_type: 'Percentage',
        discount_value: 15,
        targetProducts: slow.name,
      });
    }
    if (overstock) {
      recs.push({
        id: `overstock-${overstock.id}`,
        title: `Clear overstock: ${overstock.name}`,
        rationale: `${overstock.stock} units in stock and very low movement.`,
        discount_type: 'Bundle',
        discount_value: 1,
        targetProducts: overstock.name,
      });
    }
    if (weakCategory) {
      recs.push({
        id: `category-${weakCategory.category}`,
        title: `Category push: ${weakCategory.category}`,
        rationale: `Lowest sell-through ratio in last 30 days.`,
        discount_type: 'BOGO',
        discount_value: 50,
        targetProducts: `Categories: ${weakCategory.category}`,
      });
    }
    recs.push({
      id: 'weekend-traffic',
      title: 'Weekend traffic booster',
      rationale: 'Use short promo window to increase conversion without long margin impact.',
      discount_type: 'Percentage',
      discount_value: 20,
      targetProducts: 'All Products',
    });
    return recs.slice(0, 4);
  }, [productsQuery.data, salesQuery.data]);

  const activeRecommendationSignatures = useMemo(() => {
    const covered = new Set<string>();
    promotions
      .filter((promo) => promo.status !== 'Ended')
      .forEach((promo) => {
        covered.add(recommendationSignature(promo.discount_type, promo.targetProducts));
      });
    return covered;
  }, [promotions]);

  const activeRecommendationTitles = useMemo(() => {
    const covered = new Set<string>();
    promotions
      .filter((promo) => promo.status !== 'Ended')
      .forEach((promo) => {
        covered.add(normalizeRecommendationTitle(promo.promo_name));
      });
    return covered;
  }, [promotions]);

  const visibleProductRecommendations = useMemo(
    () =>
      productRecommendations.filter(
        (rec) =>
          !hiddenRecommendationIds.has(rec.id) &&
          !activeRecommendationSignatures.has(recommendationSignature(rec.discount_type, rec.targetProducts)) &&
          !activeRecommendationTitles.has(normalizeRecommendationTitle(rec.title)),
      ),
    [activeRecommendationSignatures, activeRecommendationTitles, hiddenRecommendationIds, productRecommendations],
  );

  const validatePromotionMargin = (draft: Partial<Promotion>) => {
    const type = String(draft.discount_type ?? 'Percentage');
    const value = Number(draft.discount_value ?? 0);
    if (value <= 0) return '';

    const targets = resolvePromotionTargetProducts(draft.targetProducts, promotionMarginProducts);
    if (!targets.length) return '';

    const riskyProduct = targets.find((product) => {
      const promoPrice = estimatePromotionPrice(product.srp, type, value);
      const minimumPrice = product.isSlowMover ? product.unitCost * 1.03 : product.unitCost * 1.1;
      return promoPrice < minimumPrice;
    });
    if (!riskyProduct) return '';

    const promoPrice = estimatePromotionPrice(riskyProduct.srp, type, value);
    const minimumPrice = riskyProduct.isSlowMover ? riskyProduct.unitCost * 1.03 : riskyProduct.unitCost * 1.1;
    const marginLabel = riskyProduct.isSlowMover ? 'slow-mover floor' : 'regular margin floor';
    return `${riskyProduct.name} would sell at ₱${promoPrice.toFixed(2)}, below the ${marginLabel} of ₱${minimumPrice.toFixed(2)}. Lower the discount or target only products that can still make profit.`;
  };

  const applyRecommendation = (rec: PromotionRecommendation) => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 7);
    const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
    setFormData({
      promo_name: rec.title,
      discount_type: rec.discount_type,
      discount_value: rec.discount_value,
      targetSalesGoal: 10000,
      targetProducts: rec.targetProducts,
      start_date: toDateInput(start),
      end_date: toDateInput(end),
      status: 'Scheduled',
    });
    setPendingRecommendationId(rec.id);
    setIsAddDialogOpen(true);
    toast.success('Recommendation applied to promotion form');
  };

  const promotionPerformance = useMemo(() => {
    const rows = [...promotions]
      .sort((a, b) => Number(b.salesGenerated || 0) - Number(a.salesGenerated || 0))
      .slice(0, 6)
      .map((p, index) => ({
        id: p.promo_id || `pp${index + 1}`,
        name: p.promo_name || `Promo ${index + 1}`,
        revenue: Number(p.salesGenerated || 0),
        units: Number(p.unitsAffected || 0),
        roi: Number(p.effectiveness || 0),
      }));
    return rows;
  }, [promotions]);

  const handleAddPromotion = async () => {
    if (!formData.promo_name || !formData.targetProducts || !formData.start_date || !formData.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (Number(formData.targetSalesGoal || 0) <= 0) {
      toast.error('Please enter a target sales goal greater than zero.');
      return;
    }
    const draftType = String(formData.discount_type ?? "Percentage");
    const draftTarget = String(formData.targetProducts ?? "All Products");
    const duplicate = promotions.find((promo) => {
      if (promo.status === "Ended") return false;
      if (!rangesOverlap(formData.start_date, formData.end_date, promo.start_date, promo.end_date)) return false;
      const sameType = String(promo.discount_type ?? "").toLowerCase() === String(formData.discount_type ?? "").toLowerCase();
      if (!sameType) return false;
      return normalizeTargetSignature(promo.targetProducts) === normalizeTargetSignature(draftTarget);
    });
    if (duplicate) {
      const existingPriority = getPromoPriority(String(duplicate.discount_type ?? ""));
      const incomingPriority = getPromoPriority(draftType);
      const winner = incomingPriority >= existingPriority ? "new promotion" : `"${duplicate.promo_name}"`;
      toast.warning(`Overlapping promo scope detected with "${duplicate.promo_name}". POS will apply a single winner by priority/specificity (current winner: ${winner}).`);
    }
    const dateError = validatePromotionDates(formData.start_date, formData.end_date);
    if (dateError) {
      toast.error(dateError);
      return;
    }
    const marginError = validatePromotionMargin(formData);
    if (marginError) {
      toast.error(marginError);
      return;
    }

    try {
      setIsSavingPromotion(true);
      const newPromotionPayload = {
        promo_name: encodePromoNameWithType(formData.promo_name!, formData.discount_type),
        discount_type: toDbDiscountType(formData.discount_type),
        discount_value: String(formData.discount_type ?? '').toLowerCase().includes('bogo')
          ? Number(formData.discount_value || 50)
          : Number(formData.discount_value || 0),
        target_sales_goal: Number(formData.targetSalesGoal || 10000),
        target_products: formData.targetProducts || 'All Products',
        targetProducts: formData.targetProducts || 'All Products',
        start_date: formData.start_date!,
        end_date: formData.end_date!,
        status: toDbStatus(formData.status, formData.start_date),
      };

      let createdPromotion: any;
      try {
        createdPromotion = await promotionsMutations.createMutation.mutateAsync(newPromotionPayload as any);
      } catch (error: any) {
        if (!isMissingTargetProductsColumnError(error)) throw error;
        const { target_products: _ignored, ...fallbackPayload } = newPromotionPayload as any;
        createdPromotion = await promotionsMutations.createMutation.mutateAsync(fallbackPayload);
      }

      const createdPromoId = String(createdPromotion?.promo_id || '').trim();
      try {
        await syncPromotionProductLinks(createdPromoId, formData.targetProducts || 'All Products');
      } catch (syncError: any) {
        console.warn("Promotion link sync warning (create):", syncError);
        toast.warning("Promotion saved, but product-link sync is limited by current permissions.");
      }
      await writeAuditLog({
        actorUserId: user?.user_id,
        actionType: "create_promotion",
        entityType: "promotion",
        entityId: createdPromoId || null,
        newData: {
          promo_name: formData.promo_name,
          discount_type: formData.discount_type,
          discount_value: formData.discount_value,
          targetSalesGoal: formData.targetSalesGoal,
          targetProducts: formData.targetProducts,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: formData.status,
        },
      });
      let recipients: Notification[] = [];
      let deliverySummary = { sent: 0, failed: 0, enabled: false, reason: '' };
      let notifyWarning = '';
      if (createdPromoId) {
        try {
          const notifyResult = await triggerPromotionEmailNotification(createdPromoId);
          recipients = (notifyResult.recipients || []) as Notification[];
          deliverySummary = {
            sent: Number(notifyResult.delivery?.sent || 0),
            failed: Number(notifyResult.delivery?.failed || 0),
            enabled: Boolean(notifyResult.delivery?.enabled),
            reason: String(notifyResult.delivery?.reason || ''),
          };
        } catch (notifyError: any) {
          notifyWarning = String(notifyError?.message || 'notification_failed');
        }
      }

      setNotifications([...notifications, ...recipients]);
      setLastNotificationBatch(recipients);
      setLastNotificationPromo({
        promo_name: formData.promo_name,
        start_date: formData.start_date,
        end_date: formData.end_date,
      });
      await promotionsQuery.refetch();
      if (pendingRecommendationId) {
        setHiddenRecommendationIds((prev) => new Set(prev).add(pendingRecommendationId));
      }
      setIsAddDialogOpen(false);
      setPendingRecommendationId(null);
      setFormData({});
      if (deliverySummary.enabled) {
        toast.success(`Promotion created! Emails sent: ${deliverySummary.sent}, failed: ${deliverySummary.failed}.`);
      } else {
        const reason = notifyWarning || deliverySummary.reason;
        if (reason) {
          toast.warning(`Promotion created. Email send skipped (${reason}).`);
        } else {
          toast.success('Promotion created.');
        }
      }
      setShowNotificationDialog(recipients.length > 0);
    } catch (error: any) {
      toast.error(error?.message ?? 'Unable to create promotion');
    } finally {
      setIsSavingPromotion(false);
    }
  };

  const handleEditPromotion = async () => {
    if (!editingPromotion) return;
    if (Number(formData.targetSalesGoal || 0) <= 0) {
      toast.error('Please enter a target sales goal greater than zero.');
      return;
    }
    const draftType = String(formData.discount_type ?? "Percentage");
    const draftTarget = String(formData.targetProducts ?? "All Products");
    const duplicate = promotions.find((promo) => {
      if (promo.promo_id === editingPromotion.promo_id) return false;
      if (promo.status === "Ended") return false;
      if (!rangesOverlap(formData.start_date, formData.end_date, promo.start_date, promo.end_date)) return false;
      const sameType = String(promo.discount_type ?? "").toLowerCase() === String(formData.discount_type ?? "").toLowerCase();
      if (!sameType) return false;
      return normalizeTargetSignature(promo.targetProducts) === normalizeTargetSignature(draftTarget);
    });
    if (duplicate) {
      const existingPriority = getPromoPriority(String(duplicate.discount_type ?? ""));
      const incomingPriority = getPromoPriority(draftType);
      const winner = incomingPriority >= existingPriority ? "edited promotion" : `"${duplicate.promo_name}"`;
      toast.warning(`Overlapping promo scope detected with "${duplicate.promo_name}". POS will apply a single winner by priority/specificity (current winner: ${winner}).`);
    }
    const dateError = validatePromotionDates(formData.start_date, formData.end_date);
    const isKeepingExistingPastStartDate =
      dateError === 'Start date cannot be in the past.' &&
      String(formData.start_date || '') === String(editingPromotion.start_date || '');
    if (dateError) {
      if (!isKeepingExistingPastStartDate) {
        toast.error(dateError);
        return;
      }
    }
    const marginError = validatePromotionMargin(formData);
    if (marginError) {
      toast.error(marginError);
      return;
    }
    try {
      setIsUpdatingPromotion(true);
      const payload = {
        promo_name: encodePromoNameWithType(formData.promo_name, formData.discount_type),
        discount_type: toDbDiscountType(formData.discount_type),
        discount_value: String(formData.discount_type ?? '').toLowerCase().includes('bogo')
          ? Number(formData.discount_value || 50)
          : formData.discount_value,
        target_sales_goal: Number(formData.targetSalesGoal || 10000),
        target_products: formData.targetProducts,
        targetProducts: formData.targetProducts,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: toDbStatus(formData.status, formData.start_date),
      } as any;

      try {
        await promotionsMutations.updateMutation.mutateAsync({
          id: editingPromotion.promo_id,
          payload,
        } as any);
      } catch (error: any) {
        if (!isMissingTargetProductsColumnError(error)) throw error;
        const { target_products: _ignored, ...fallbackPayload } = payload;
        await promotionsMutations.updateMutation.mutateAsync({
          id: editingPromotion.promo_id,
          payload: fallbackPayload,
        } as any);
      }
      try {
        await syncPromotionProductLinks(editingPromotion.promo_id, formData.targetProducts);
      } catch (syncError: any) {
        console.warn("Promotion link sync warning (update):", syncError);
        toast.warning("Promotion updated, but product-link sync is limited by current permissions.");
      }
      await promotionsQuery.refetch();
      await writeAuditLog({
        actorUserId: user?.user_id,
        actionType: "update_promotion",
        entityType: "promotion",
        entityId: editingPromotion.promo_id,
        oldData: editingPromotion,
        newData: formData,
      });
      setEditingPromotion(null);
      setFormData({});
      toast.success('Promotion updated successfully!');
    } catch (error: any) {
      toast.error(error?.message ?? 'Unable to update promotion');
    } finally {
      setIsUpdatingPromotion(false);
    }
  };

  const handleDeletePromotion = async (promo_id: string) => {
    try {
      const response = await fetch(`/api/promotions/${encodeURIComponent(promo_id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        // Fallback for local/dev setups or missing Flask session:
        // remove links first, then remove promotion row.
        const linkDelete = await supabase.from("promo_product").delete().eq("promo_id", promo_id);
        if (linkDelete.error) {
          throw new Error(linkDelete.error.message || "Unable to delete promo-product links");
        }
        const promoDelete = await supabase.from("promotion").delete().eq("promo_id", promo_id);
        if (promoDelete.error) {
          throw new Error(promoDelete.error.message || String(result?.error || "Unable to delete promotion"));
        }
      }
      await promotionsQuery.refetch();
      await writeAuditLog({
        actorUserId: user?.user_id,
        actionType: "delete_promotion",
        entityType: "promotion",
        entityId: promo_id,
      });
      toast.success('Promotion deleted successfully!');
    } catch (error: any) {
      toast.error(error?.message ?? 'Unable to delete promotion');
    }
  };

  const openEditDialog = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setFormData(promotion);
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      // Cancel/exit should not permanently hide recommendation cards.
      setPendingRecommendationId(null);
      setFormData({});
    }
  };

  const totalRevenue = promotions.reduce((sum, p) => sum + p.salesGenerated, 0);
  const activePromotions = promotions.filter(p => p.status === 'Active').length;
  const avgEffectiveness = promotions.filter(p => p.effectiveness > 0).reduce((sum, p) => sum + p.effectiveness, 0) / promotions.filter(p => p.effectiveness > 0).length || 0;
  const sentNotificationCount = lastNotificationBatch.filter(
    (notif) => String(notif.email_status || '').toLowerCase() === 'sent',
  ).length;
  const failedNotificationCount = lastNotificationBatch.filter(
    (notif) => String(notif.email_status || '').toLowerCase() === 'failed',
  ).length;
  const notificationSummaryTone =
    failedNotificationCount > 0 && sentNotificationCount === 0
      ? 'failed'
      : failedNotificationCount > 0
        ? 'partial'
        : 'sent';

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Active Promotions</p>
                <p className="text-2xl text-yellow-300">{activePromotions}</p>
              </div>
              <Tag className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Revenue Generated</p>
                <p className="text-2xl text-yellow-300">₱{totalRevenue.toLocaleString()}</p>
              </div>
              <Coins className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Avg Effectiveness</p>
                <p className="text-2xl text-yellow-300">{avgEffectiveness.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-200">Units Affected</p>
                <p className="text-2xl text-yellow-300">{promotions.reduce((sum, p) => sum + p.unitsAffected, 0)}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Recommendations */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <CardTitle className="text-yellow-300 flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Recommended by Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleProductRecommendations.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-red-800 bg-red-800/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-yellow-200 font-medium">{rec.title}</p>
                    <p className="text-yellow-300/80 text-xs mt-1">{rec.rationale}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge className="bg-yellow-400 text-red-900">{rec.discount_type}</Badge>
                      <Badge className="bg-red-600 text-yellow-200">
                        {rec.discount_type === 'Percentage'
                          ? `${rec.discount_value}%`
                          : rec.discount_type === 'Fixed Amount'
                            ? `₱${rec.discount_value}`
                            : rec.discount_type === 'BOGO'
                              ? 'Buy 1 Get 1'
                              : 'Bundle'}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-yellow-400 text-red-900 hover:bg-yellow-500"
                    onClick={() => applyRecommendation(rec)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ))}
            {!visibleProductRecommendations.length && (
              <div className="md:col-span-2 rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm text-yellow-100">
                All current analytics recommendations are already covered by active or scheduled promotions.
                Delete, end, or expire a matching promotion and the recommendation will appear again if the sales data still supports it.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active Promotions Table */}
      <Card className="bg-red-700 border-red-800">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Promotion Campaigns
            </CardTitle>
            <Dialog open={isAddDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Promotion
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#15161d] border-[#2a2c36] text-yellow-100 max-w-2xl max-h-[88vh] overflow-hidden p-0 shadow-2xl">
                <DialogHeader className="border-b border-white/10 bg-[#171821] px-6 py-5">
                  <DialogTitle className="text-white text-xl">Create New Promotion</DialogTitle>
                </DialogHeader>
                <div className="max-h-[calc(88vh-10rem)] overflow-y-auto px-6 py-5 pr-4 [scrollbar-width:thin] [scrollbar-color:#facc15_#20212a]">
                  <PromotionForm
                    formData={formData}
                    setFormData={setFormData}
                    categoryOptions={categoryOptions}
                    productOptions={productOptions}
                  />
                </div>
                <DialogFooter className="border-t border-white/10 bg-[#171821]/95 px-6 py-4">
                  <Button
                    onClick={handleAddPromotion}
                    disabled={isSavingPromotion}
                    className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-60"
                  >
                    {isSavingPromotion ? 'Creating...' : 'Create Promotion'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border border-red-800 rounded-lg overflow-x-auto">
            <Table className="w-full min-w-[920px]">
              <TableHeader>
                <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Promotion Name</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Type</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Discount</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Period</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Status</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Performance</TableHead>
                  <TableHead className="text-yellow-300 whitespace-nowrap text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotions.map((promotion) => (
                  <TableRow key={promotion.promo_id} className="border-red-800">
                    <TableCell className="min-w-[200px] text-center align-middle">
                      <div>
                        <p className="text-yellow-200 break-words leading-tight">{promotion.promo_name}</p>
                        <p className="mt-1 text-yellow-300 text-xs break-words leading-tight">{promotion.targetProducts}</p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center align-middle">
                      <Badge className="bg-yellow-400 text-red-900">
                        {promotion.discount_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-yellow-300 whitespace-nowrap text-center align-middle">
                      {promotion.discount_type === 'Percentage' ? `${promotion.discount_value}%` :
                       promotion.discount_type === 'Fixed Amount' ? `₱${promotion.discount_value}` :
                       promotion.discount_type === 'BOGO' ? 'Buy 1 Get 1' : 'Bundle'}
                    </TableCell>
                    <TableCell className="text-yellow-200 text-sm text-center align-middle">
                      <div className="leading-tight">
                        <p>{promotion.start_date}</p>
                        <p className="text-yellow-300/80">to {promotion.end_date}</p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center align-middle">
                      <Badge className={
                        promotion.status === 'Active' ? 'bg-green-600 text-white' :
                        promotion.status === 'Scheduled' ? 'bg-yellow-600 text-red-900' :
                        'bg-gray-600 text-white'
                      }>
                        {promotion.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-[220px] text-center align-middle">
                      <div className="space-y-1">
                        <div className="flex flex-wrap justify-center gap-3 text-xs text-yellow-200">
                          <span className="whitespace-nowrap">Sales: ₱{promotion.salesGenerated}</span>
                          <span className="whitespace-nowrap">Goal: PHP {promotion.targetSalesGoal.toLocaleString()}</span>
                          <span className="whitespace-nowrap">{promotion.unitsAffected} units</span>
                        </div>
                        <Progress value={promotion.effectiveness} className="h-2 bg-red-600" />
                        <p className="text-xs text-yellow-300">{promotion.effectiveness}% of target</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <div className="flex gap-2 justify-center">
                        <Dialog open={editingPromotion?.promo_id === promotion.promo_id} onOpenChange={(open) => !open && setEditingPromotion(null)}>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                              onClick={() => openEditDialog(promotion)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-[#15161d] border-[#2a2c36] text-yellow-100 max-w-2xl max-h-[88vh] overflow-hidden p-0 shadow-2xl">
                            <DialogHeader className="border-b border-white/10 bg-[#171821] px-6 py-5">
                              <DialogTitle className="text-white text-xl">Edit Promotion</DialogTitle>
                            </DialogHeader>
                            <div className="max-h-[calc(88vh-10rem)] overflow-y-auto px-6 py-5 pr-4 [scrollbar-width:thin] [scrollbar-color:#facc15_#20212a]">
                              <PromotionForm
                                formData={formData}
                                setFormData={setFormData}
                                categoryOptions={categoryOptions}
                                productOptions={productOptions}
                              />
                            </div>
                            <DialogFooter className="border-t border-white/10 bg-[#171821]/95 px-6 py-4">
                              <Button
                                onClick={handleEditPromotion}
                                disabled={isUpdatingPromotion}
                                className="bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-60"
                              >
                                {isUpdatingPromotion ? 'Updating...' : 'Update Promotion'}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                          onClick={() => handleDeletePromotion(promotion.promo_id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notification Confirmation Dialog */}
      <Dialog open={showNotificationDialog} onOpenChange={setShowNotificationDialog}>
        <DialogContent className="bg-[#15161d] border-[#2a2c36] text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Notification Summary
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className={`flex items-center gap-3 p-4 rounded-lg border ${
                notificationSummaryTone === 'sent'
                  ? 'bg-emerald-950/40 border-emerald-700'
                  : notificationSummaryTone === 'partial'
                    ? 'bg-amber-950/40 border-amber-700'
                    : 'bg-red-950/40 border-red-800'
              }`}
            >
              {notificationSummaryTone === 'sent' ? (
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              ) : (
                <X className="w-6 h-6 text-red-300" />
              )}
              <div>
                <p className="text-white font-semibold">
                  {sentNotificationCount} sent, {failedNotificationCount} failed
                </p>
                <p className="text-sm text-gray-300">
                  {failedNotificationCount > 0
                    ? 'Some emails were not accepted by Gmail. Check the failed recipients below for the exact reason.'
                    : 'All selected customers were notified about this promotion.'}
                </p>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              <p className="text-gray-200 mb-2">Notification Recipients:</p>
              <div className="space-y-2">
                {lastNotificationBatch.map((notif) => {
                  const customerName = customerNameMap.get(notif.customer_id) || 'Customer';
                  const status = String(notif.email_status || 'pending').toLowerCase();
                  const isFailed = status === 'failed';
                  return (
                    <div key={notif.notification_id} className="flex items-start justify-between gap-3 p-3 bg-[#1f2029] rounded border border-[#30323d]">
                      <div className="flex items-start gap-3 min-w-0">
                        <Mail className="w-4 h-4 text-yellow-400 mt-1" />
                        <div className="min-w-0">
                          <p className="text-white text-sm">{customerName}</p>
                          <p className="text-gray-300 text-xs break-all">{notif.email || 'No email address'}</p>
                          {isFailed && notif.send_error ? (
                            <p className="text-red-300 text-xs mt-1 break-words">{notif.send_error}</p>
                          ) : null}
                        </div>
                      </div>
                      <Badge className={`${isFailed ? 'bg-red-900 text-red-100 border border-red-700' : 'bg-emerald-900 text-emerald-100 border border-emerald-700'} text-xs shrink-0`}>
                        {status.slice(0, 1).toUpperCase() + status.slice(1)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-[#1f2029] border border-[#30323d] rounded-lg">
              <p className="text-white text-sm">Promotion Details:</p>
              <div className="mt-2 space-y-1 text-sm text-gray-300">
                <p><span className="text-yellow-300">Promotion:</span> {lastNotificationPromo.promo_name || 'Promotion'}</p>
                <p><span className="text-yellow-300">Start Date:</span> {lastNotificationPromo.start_date || formData.start_date || lastNotificationBatch[0]?.date_sent || 'N/A'}</p>
                <p><span className="text-yellow-300">End Date:</span> {lastNotificationPromo.end_date || formData.end_date || 'N/A'}</p>
                <p className="text-xs text-gray-400 mt-2">Successful recipients received this promotion via Gmail.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowNotificationDialog(false)} className="bg-yellow-400 text-black hover:bg-yellow-300">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromotionForm({ formData, setFormData, categoryOptions, productOptions }: {
  formData: Partial<Promotion>;
  setFormData: (data: Partial<Promotion>) => void;
  categoryOptions: string[];
  productOptions: Array<{ name: string; category: string; stock: number }>;
}) {
  const minPromotionDate = todayDateInput();
  const isBogoType = String(formData.discount_type ?? '').toLowerCase().includes('bogo');
  const isFixedAmountType = String(formData.discount_type ?? '').toLowerCase().includes('fixed');
  const isPercentageType = String(formData.discount_type ?? '').toLowerCase().includes('percent');
  const parsed = useMemo(() => parseTargetProducts(formData.targetProducts), [formData.targetProducts]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(parsed.categories);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(parsed.products);
  const [pendingCategory, setPendingCategory] = useState('');
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    const sanitizedTarget = sanitizeTargetProductsToSellable(
      formData.targetProducts,
      categoryOptions,
      productOptions,
    );
    const next = parseTargetProducts(sanitizedTarget);
    setSelectedCategories(next.categories);
    setSelectedProducts(next.products);

    if (String(formData.targetProducts ?? "").trim() !== sanitizedTarget) {
      setFormData({
        ...formData,
        targetProducts: sanitizedTarget,
      });
    }
  }, [formData.targetProducts, categoryOptions, productOptions]);

  const filteredProductOptions = useMemo(() => {
    if (!selectedCategories.length) return productOptions;
    return productOptions.filter((p) => selectedCategories.includes(p.category));
  }, [productOptions, selectedCategories]);
  const searchedProductOptions = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return filteredProductOptions;
    return filteredProductOptions.filter((p) =>
      `${p.name} ${p.category} ${p.stock}`.toLowerCase().includes(q),
    );
  }, [filteredProductOptions, productSearch]);
  const targetProductsValue = String(formData.targetProducts ?? '').trim();
  const isAllProductsSelected = targetProductsValue.toLowerCase() === 'all products';

  const syncTargetProducts = (categories: string[], products: string[]) => {
    setFormData({
      ...formData,
      targetProducts: formatTargetProducts(categories, products),
    });
  };

  const addCategory = (value: string) => {
    if (!value || selectedCategories.includes(value)) return;
    const nextCategories = [...selectedCategories, value];
    setSelectedCategories(nextCategories);
    // Reset product picks when category scope changes to avoid stale cross-category selections.
    setSelectedProducts([]);
    syncTargetProducts(nextCategories, []);
  };

  const removeCategory = (value: string) => {
    const nextCategories = selectedCategories.filter((c) => c !== value);
    setSelectedCategories(nextCategories);
    // Reset product picks when category scope changes to avoid stale cross-category selections.
    setSelectedProducts([]);
    syncTargetProducts(nextCategories, []);
  };

  const addProduct = (value: string) => {
    const normalizedValue = String(value ?? '').trim().toLowerCase();
    if (!normalizedValue) return;
    if (selectedProducts.some((p) => String(p).trim().toLowerCase() === normalizedValue)) {
      toast.info('Product is already selected.');
      return;
    }
    const nextProducts = [...selectedProducts, value];
    setSelectedProducts(nextProducts);
    syncTargetProducts(selectedCategories, nextProducts);
    setProductSearch('');
    setIsProductPickerOpen(false);
    toast.success(`Added ${value} to target products.`);
  };

  const removeProduct = (value: string) => {
    const nextProducts = selectedProducts.filter((p) => p !== value);
    setSelectedProducts(nextProducts);
    syncTargetProducts(selectedCategories, nextProducts);
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="promo_name" className="text-yellow-300">Promotion Name *</Label>
        <Input
          id="promo_name"
          value={formData.promo_name || ''}
          onChange={(e) => setFormData({ ...formData, promo_name: e.target.value })}
          className="bg-red-600 border-red-800 text-yellow-200"
          placeholder="e.g., Spring Sale 2026"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="discount_type" className="text-yellow-300">Promotion Type *</Label>
          <Select
            value={formData.discount_type || 'Percentage'}
            onValueChange={(value) =>
              setFormData({
                ...formData,
                discount_type: value as Promotion['discount_type'],
                discount_value: String(value).toLowerCase().includes('bogo') ? 0 : formData.discount_value,
              })
            }
          >
            <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
              <SelectItem value="Percentage">Percentage Discount</SelectItem>
              <SelectItem value="Fixed Amount">Fixed Amount Off</SelectItem>
              <SelectItem value="BOGO">Buy One Get One</SelectItem>
              <SelectItem value="Bundle">Bundle Deal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="discount_value" className="text-yellow-300">
            {isFixedAmountType ? 'Discount Value (PHP amount) *' : 'Discount Value *'}
          </Label>
          <Input
            id="discount_value"
            type="number"
            value={formData.discount_value || ''}
            onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) })}
            className="bg-red-600 border-red-800 text-yellow-200"
            placeholder={
              isBogoType
                ? 'Auto for BOGO (default 50)'
                : isFixedAmountType
                  ? 'e.g. 500 for ₱500 off'
                  : isPercentageType
                    ? 'e.g. 15 for 15% off'
                    : 'Enter discount'
            }
            disabled={isBogoType}
          />
          {isFixedAmountType ? (
            <p className="text-xs text-yellow-300/80">Example: enter <span className="text-yellow-300">500</span> to deduct <span className="text-yellow-300">₱500</span> from each qualifying item.</p>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetSalesGoal" className="text-yellow-300">Target Sales Goal (PHP) *</Label>
        <Input
          id="targetSalesGoal"
          type="number"
          min="1"
          value={formData.targetSalesGoal || 10000}
          onChange={(e) => setFormData({ ...formData, targetSalesGoal: Math.max(1, Number(e.target.value || 0)) })}
          className="bg-red-600 border-red-800 text-yellow-200"
          placeholder="e.g. 10000"
        />
        <p className="text-xs text-yellow-300/80">Promotion effectiveness is measured as sales generated during the promo period divided by this goal.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetProducts" className="text-yellow-300">Target Products *</Label>
        <div className="space-y-3 rounded-lg border border-red-800 p-3">
          <Input
            id="targetProducts"
            value={formData.targetProducts || 'All Products'}
            readOnly
            onClick={() => {
              if (isBogoType) return;
              setSelectedCategories([]);
              setSelectedProducts([]);
              setFormData({
                ...formData,
                targetProducts: 'All Products',
              });
            }}
            className="bg-red-600 border-red-800 text-yellow-200 cursor-pointer"
          />
          <p className="text-xs text-yellow-300/80">
            Tip: Click <span className="text-yellow-300">All Products</span> button or click the field above to target all products.
          </p>
          {isBogoType ? (
            <p className="text-xs text-amber-300/90">
              BOGO supports product-level, category-level, or all-products scope. POS applies one winning promo per item.
            </p>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-yellow-300 text-xs">Categories (choose one or more)</Label>
              <Select value={pendingCategory} onValueChange={(value) => {
                addCategory(value);
                setPendingCategory('');
              }}>
                <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                  {categoryOptions.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-2 min-h-6">
                {selectedCategories.map((category) => (
                  <Badge key={category} className="bg-yellow-400 text-red-900 gap-1 pr-1">
                    {category}
                    <button type="button" className="ml-1" onClick={() => removeCategory(category)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={`border transition-all duration-200 ${
                  isAllProductsSelected
                    ? 'border-yellow-400 bg-yellow-400 text-red-900 hover:bg-yellow-300'
                    : 'border-red-800 bg-red-600 text-yellow-200 hover:bg-red-500'
                }`}
              onClick={() => {
                setSelectedCategories([]);
                setSelectedProducts([]);
                setFormData({
                  ...formData,
                  targetProducts: 'All Products',
                  });
                }}
              >
                {isAllProductsSelected ? <Check className="w-4 h-4 mr-1" /> : null}
                {isAllProductsSelected ? 'All Products Selected' : 'All Products'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-yellow-300 text-xs">Products (filtered by category)</Label>
              <Dialog open={isProductPickerOpen} onOpenChange={setIsProductPickerOpen}>
                <DialogTrigger asChild>
                  <Button type="button" className="w-full justify-start bg-red-600 border border-red-800 text-yellow-200 hover:bg-red-500">
                    Select product
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#15161d] border-[#2a2c36] text-yellow-100 max-w-2xl max-h-[85vh] overflow-hidden p-0">
                  <DialogHeader className="border-b border-white/10 px-5 py-4">
                    <DialogTitle className="text-white">Select Sellable Products</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 p-5">
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="bg-red-600 border-red-800 text-yellow-200"
                      placeholder="Search by product or category..."
                    />
                    <div className="max-h-[48vh] overflow-y-auto rounded-lg border border-red-800">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                            <TableHead className="text-yellow-300 text-center">Product</TableHead>
                            <TableHead className="text-yellow-300 text-center">Category</TableHead>
                            <TableHead className="text-yellow-300 text-center">Stock</TableHead>
                            <TableHead className="text-yellow-300 text-center">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {searchedProductOptions.map((product) => (
                            <TableRow key={`${product.name}-${product.category}`} className="border-red-800">
                              <TableCell className="text-yellow-200 text-center">{product.name}</TableCell>
                              <TableCell className="text-yellow-200 text-center">{product.category || 'Uncategorized'}</TableCell>
                              <TableCell className="text-yellow-300 text-center">{product.stock}</TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-yellow-400 text-red-900 hover:bg-yellow-500"
                                  onClick={() => addProduct(product.name)}
                                >
                                  Add
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex flex-wrap gap-2 min-h-6">
                {selectedProducts.map((product) => (
                  <Badge key={product} className="bg-red-500 text-yellow-200 gap-1 pr-1">
                    {product}
                    <button type="button" className="ml-1" onClick={() => removeProduct(product)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date" className="text-yellow-300">Start Date *</Label>
          <Input
            id="start_date"
            type="date"
            min={minPromotionDate}
            value={formData.start_date || ''}
            onChange={(e) => {
              const nextStartDate = e.target.value;
              setFormData({
                ...formData,
                start_date: nextStartDate,
                end_date:
                  formData.end_date && formData.end_date < nextStartDate
                    ? nextStartDate
                    : formData.end_date,
              });
            }}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end_date" className="text-yellow-300">End Date *</Label>
          <Input
            id="end_date"
            type="date"
            min={formData.start_date || minPromotionDate}
            value={formData.end_date || ''}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="status" className="text-yellow-300">Status</Label>
        <Select value={formData.status || 'Scheduled'} onValueChange={(value) => setFormData({ ...formData, status: value as Promotion['status'] })}>
          <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Ended">Ended</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

