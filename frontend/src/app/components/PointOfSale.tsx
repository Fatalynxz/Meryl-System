import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Coins, CreditCard, Minus, Package, Plus, Receipt, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useCustomers, useInventory, useProducts, usePromotions } from "../../lib/hooks";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";

type CartItem = {
  id: string;
  product_id: string;
  productName: string;
  brand: string;
  color: string;
  size: string;
  price: number;
  quantity: number;
  quantityInput?: string;
  discount: number;
  discountInput?: string;
  promotionType?: string;
  promo_id?: string | null;
};

type ProductVariant = {
  product_id: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  gender: string;
  size: string;
  price: number;
  stock_quantity: number;
  on_hand_stock: number;
  reserved_quantity: number;
  expiration_date: string;
  status: string;
};

type ProductGroup = {
  key: string;
  product_name: string;
  color: string;
  variants: ProductVariant[];
};

type ActivePromotionRule = {
  promoKey: string;
  discountType: string;
  discountValue: number;
  appliesToAll: boolean;
  categories: string[];
  products: string[];
  startDate: string;
  endDate: string;
};

function productVariantLabel(product: Pick<ProductVariant, "color" | "gender" | "size">) {
  return [product.color, product.gender, product.size ? `Size ${product.size}` : ""]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value && value.toLowerCase() !== "n/a" && value.toLowerCase() !== "default")
    .join(" / ") || "Default";
}

function isExpiredInventoryDate(value?: string | null) {
  const date = String(value ?? "").slice(0, 10);
  if (!date) return false;
  return date < new Date().toISOString().slice(0, 10);
}

function isSellableProduct(product: ProductVariant) {
  return (
    product.status.toLowerCase() === "active" &&
    Number(product.stock_quantity || 0) > 0 &&
    !isExpiredInventoryDate(product.expiration_date)
  );
}

const PROMO_TYPE_MARKERS = {
  bundle: "__TYPE_BUNDLE__",
  bogo: "__TYPE_BOGO__",
} as const;

const BOGO_MAX_PAIRS_PER_TRANSACTION = 4;

function parsePromotionTarget(rawValue: string | null | undefined) {
  const raw = String(rawValue ?? "").trim();
  if (!raw || raw.toLowerCase() === "all products") {
    return { appliesToAll: true, categories: [] as string[], products: [] as string[] };
  }

  const categories: string[] = [];
  const products: string[] = [];
  raw.split("|").forEach((segment) => {
    const value = segment.trim();
    if (!value) return;
    if (value.toLowerCase().startsWith("categories:")) {
      value
        .slice("categories:".length)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => categories.push(v.toLowerCase()));
      return;
    }
    if (value.toLowerCase().startsWith("products:")) {
      value
        .slice("products:".length)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => products.push(v.toLowerCase()));
      return;
    }
    products.push(value.toLowerCase());
  });

  return {
    appliesToAll: false,
    categories: Array.from(new Set(categories)),
    products: Array.from(new Set(products)),
  };
}

function derivePromotionTargetFromLinks(row: any) {
  const links = Array.isArray(row?.promo_product) ? row.promo_product : [];
  if (!links.length) return "";

  const categories = new Set<string>();
  const products = new Set<string>();
  links.forEach((link: any) => {
    const product = Array.isArray(link?.product) ? link.product[0] : link?.product;
    const productName = String(product?.product_name ?? "").trim();
    const categoryName = String(product?.category?.[0]?.category_name ?? product?.category?.category_name ?? "").trim();
    if (productName) products.add(productName);
    if (categoryName) categories.add(categoryName);
  });

  if (!categories.size && !products.size) return "";
  if (!categories.size) return `Products: ${Array.from(products).join(", ")}`;
  if (!products.size) return `Categories: ${Array.from(categories).join(", ")}`;
  return `Categories: ${Array.from(categories).join(", ")} | Products: ${Array.from(products).join(", ")}`;
}

function resolveEffectiveDiscountType(discountType: string, promoName: string | undefined) {
  const loweredType = String(discountType ?? "").toLowerCase();
  const loweredName = String(promoName ?? "").toLowerCase();
  if (loweredName.includes(PROMO_TYPE_MARKERS.bogo.toLowerCase())) return "bogo";
  if (loweredName.includes(PROMO_TYPE_MARKERS.bundle.toLowerCase())) return "bundle";
  if (loweredType.includes("buy one get one") || loweredType.includes("bogo")) return "bogo";
  if (loweredType.includes("bundle")) return "bundle";
  if (loweredType.includes("fixed")) return "fixed";
  if (loweredType.includes("percent")) return "percentage";
  return loweredType;
}

function promoToPercent(discountType: string, discountValue: number, unitPrice: number) {
  const type = discountType.toLowerCase();
  if (type.includes("percentage")) return Math.max(0, Math.min(100, discountValue));
  if (type.includes("fixed")) {
    if (unitPrice <= 0) return 0;
    return Math.max(0, Math.min(100, (discountValue / unitPrice) * 100));
  }
  if (type.includes("bogo")) return 50;
  // Bundle defaults to a meaningful discount if source value is too small (e.g. analytics seed = 1).
  if (type.includes("bundle")) return Math.max(0, Math.min(100, discountValue >= 5 ? discountValue : 10));
  return 0;
}

function getPromotionTypePriority(discountType: string) {
  const type = String(discountType ?? "").toLowerCase();
  if (type.includes("bogo")) return 4;
  if (type.includes("bundle")) return 3;
  if (type.includes("fixed")) return 2;
  if (type.includes("percentage")) return 1;
  return 0;
}

function getPromoBadgeLabel(type?: string) {
  const value = String(type ?? "").toLowerCase();
  if (value.includes("bogo")) return "BOGO";
  if (value.includes("bundle")) return "BUNDLE";
  if (value.includes("fixed")) return "FIXED";
  if (value.includes("percent")) return "PERCENT";
  return "AUTO";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Number(value || 0))
    .replace(/^₱/, "PHP ");
}

function isBogoCartItem(item: Pick<CartItem, "promotionType">) {
  return String(item.promotionType ?? "").toLowerCase().includes("bogo");
}

function getBogoFreeUnits(quantity: number) {
  return Math.floor(Math.max(0, Number(quantity) || 0) / 2);
}

function getLineDiscountAmount(item: CartItem) {
  const baseSubtotal = item.price * item.quantity;
  if (isBogoCartItem(item)) {
    return Math.min(baseSubtotal, getBogoFreeUnits(item.quantity) * item.price);
  }
  return baseSubtotal * (Math.max(0, Math.min(100, Number(item.discount) || 0)) / 100);
}

function getLineTotal(item: CartItem) {
  return Math.max(0, item.price * item.quantity - getLineDiscountAmount(item));
}

function getLineEffectiveDiscountPercent(item: CartItem) {
  const baseSubtotal = item.price * item.quantity;
  if (baseSubtotal <= 0) return 0;
  return (getLineDiscountAmount(item) / baseSubtotal) * 100;
}

function formatPercentValue(value: number) {
  const clean = Math.max(0, Math.min(100, Number(value) || 0));
  return Number.isInteger(clean) ? String(clean) : clean.toFixed(2).replace(/\.?0+$/, "");
}

export function PointOfSale() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const productsQuery = useProducts();
  const inventoryQuery = useInventory();
  const customersQuery = useCustomers();
  const promotionsQuery = usePromotions();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductKey, setSelectedProductKey] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [customerName, setCustomerName] = useState<string>("walk-in");
  const [saveWalkInDetails, setSaveWalkInDetails] = useState(false);
  const [walkInCustomerName, setWalkInCustomerName] = useState("");
  const [walkInCustomerPhone, setWalkInCustomerPhone] = useState("");
  const [walkInGender, setWalkInGender] = useState("");
  const [walkInAge, setWalkInAge] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [receiptData, setReceiptData] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [isProductGridOpen, setIsProductGridOpen] = useState(false);
  const [isCustomerGridOpen, setIsCustomerGridOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const customers = (customersQuery.data as any[]) ?? [];
  const customerOptions = useMemo(
    () => [
      { label: "Walk-in Customer", value: "walk-in", customer_id: null, email: "", contact_number: "", date_registered: "" },
      ...customers.map((c) => ({
        label: c.name,
        value: c.name,
        customer_id: c.customer_id,
        email: c.email,
        contact_number: c.contact_number,
        date_registered: c.date_registered,
        gender: c.gender ?? null,
        age: c.age ?? null,
        birth_date: c.birth_date ?? null,
      })),
    ],
    [customers],
  );

  const productInventory = useMemo<ProductVariant[]>(() => {
    const rows = (productsQuery.data as any[]) ?? [];
    const inventoryRows = (inventoryQuery.data as any[]) ?? [];
    const inventoryByProductId: Record<string, any> = {};
    for (const inv of inventoryRows) {
      const key = String(inv.product_id ?? "");
      if (!key) continue;
      inventoryByProductId[key] = inv;
    }
    const variants: ProductVariant[] = [];
    for (const row of rows) {
      const inventory = inventoryByProductId[String(row.product_id)] ?? null;
      if (!inventory) continue;
      const onHandStock = Number(inventory?.stock_quantity ?? 0);
      const reservedQuantity = Math.min(
        Math.max(Number(inventory?.reserved_quantity ?? 0), 0),
        Math.max(onHandStock, 0),
      );
      const availableStock = Math.max(onHandStock - reservedQuantity, 0);
      const status = String(inventory?.inventory_status ?? row.status ?? "inactive").trim().toLowerCase();
      const expirationDate = String(inventory?.expiration_date ?? "");
      const expired = isExpiredInventoryDate(expirationDate);
      variants.push({
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand ?? "Meryl",
        category: row.category?.[0]?.category_name ?? row.category?.category_name ?? "N/A",
        color: row.color ?? "N/A",
        gender: row.gender ?? "N/A",
        size: row.size ?? "N/A",
        price: Number(inventory?.srp ?? row.cost_price ?? 0),
        stock_quantity: availableStock,
        on_hand_stock: onHandStock,
        reserved_quantity: reservedQuantity,
        expiration_date: expirationDate,
        status: expired ? "Expired" : status === "active" || status === "available" ? "Active" : "Inactive",
      });
    }
    return variants;
  }, [productsQuery.data, inventoryQuery.data]);

  const sellableProductInventory = useMemo(
    () => productInventory.filter(isSellableProduct),
    [productInventory],
  );

  const filteredProductInventory = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const sourceProducts = sellableProductInventory;
    if (!term) return [];
    return sourceProducts.filter((product) =>
      [
        product.product_id,
        product.product_name,
        product.brand,
        product.category,
        product.color,
        product.gender,
        product.size,
        productVariantLabel(product),
        String(product.price),
        String(product.stock_quantity),
        String(product.on_hand_stock),
        String(product.reserved_quantity),
        product.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [sellableProductInventory, productSearch]);

  const filteredCustomerOptions = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customerOptions;
    return customerOptions.filter((customer: any) =>
      [
        customer.customer_id ?? "walk-in",
        customer.label,
        customer.email ?? "",
        customer.contact_number ?? "",
        customer.date_registered ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [customerOptions, customerSearch]);

  const selectCustomer = (customer: any) => {
    setCustomerName(customer.value);
    if (customer.value !== "walk-in") {
      setSaveWalkInDetails(false);
    }
    setIsCustomerGridOpen(false);
    toast.success(`${customer.label} selected`);
  };

  const productMetaById = useMemo(() => {
    const rows = (productsQuery.data as any[]) ?? [];
    const map = new Map<string, { productName: string; categoryName: string }>();
    rows.forEach((row) => {
      map.set(String(row.product_id), {
        productName: String(row.product_name ?? "").trim(),
        categoryName: String(row.category?.[0]?.category_name ?? row.category?.category_name ?? "").trim(),
      });
    });
    return map;
  }, [productsQuery.data]);

  const activePromotionRules = useMemo<ActivePromotionRule[]>(() => {
    const rows = (promotionsQuery.data as any[]) ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return rows
      .map((row) => {
        const status = String(row.status ?? "").toLowerCase();
        const startDate = String(row.start_date ?? "").slice(0, 10);
        const endDate = String(row.end_date ?? "").slice(0, 10);
        const withinWindow = (!startDate || startDate <= today) && (!endDate || endDate >= today);
        // Match Promotions page behavior: a promo is effectively active when:
        // 1) status is explicitly active, or
        // 2) current date is inside start/end window.
        const isEffectivelyActive = status.includes("active") || withinWindow;
        const isExpired = status.includes("expired") || (Boolean(endDate) && endDate < today);
        if (!isEffectivelyActive || isExpired) return null;

        const parsedTarget = parsePromotionTarget(
          row.target_products ??
            row.targetProducts ??
            derivePromotionTargetFromLinks(row),
        );
        return {
          promoKey: String(row.promo_id ?? row.id ?? row.promo_name ?? `${startDate}-${endDate}-${Math.random()}`),
          discountType: resolveEffectiveDiscountType(
            String(row.discount_type ?? "percentage"),
            String(row.promo_name ?? ""),
          ),
          discountValue: Number(row.discount_value ?? 0),
          appliesToAll: parsedTarget.appliesToAll,
          categories: parsedTarget.categories,
          products: parsedTarget.products,
          startDate,
          endDate,
        } as ActivePromotionRule;
      })
      .filter(Boolean) as ActivePromotionRule[];
  }, [promotionsQuery.data]);

  const productGroups: ProductGroup[] = useMemo(
    () =>
      sellableProductInventory.reduce((acc, variant) => {
        const key = variant.product_name;
        const existing = acc.find((g) => g.key === key);
        if (existing) existing.variants.push(variant);
        else acc.push({ key, product_name: variant.product_name, color: variant.color, variants: [variant] });
        return acc;
      }, [] as ProductGroup[]),
    [sellableProductInventory],
  );

  const availableColors = selectedProductKey
    ? Array.from(new Set(
        sellableProductInventory
          .filter((v) => v.product_name === selectedProductKey)
          .map((v) => v.color)
      ))
    : [];

  const availableSizes = (selectedProductKey && selectedColor)
    ? sellableProductInventory
        .filter((v) => v.product_name === selectedProductKey && v.color === selectedColor)
        .map((v) => ({ ...v }))
    : [];

  const productMatchesPromotion = (promo: ActivePromotionRule, productNameLower: string, categoryLower: string) => {
    const matchesProduct = promo.products.includes(productNameLower);
    const matchesCategory = categoryLower ? promo.categories.includes(categoryLower) : false;
    return promo.appliesToAll || matchesProduct || matchesCategory;
  };

  const recalculatePromotions = (items: CartItem[]) => {
    const withPromo = items.map((item) => {
      const metaRow = productMetaById.get(String(item.product_id ?? ""));
      const itemNameLc = String(metaRow?.productName ?? item.productName ?? "").toLowerCase();
      const itemCategoryLc = String(metaRow?.categoryName ?? "").toLowerCase();

      const matched = activePromotionRules
        .map((promo) => {
          const matchesProduct = promo.products.includes(itemNameLc);
          const matchesCategory = itemCategoryLc ? promo.categories.includes(itemCategoryLc) : false;
          const applies = productMatchesPromotion(promo, itemNameLc, itemCategoryLc);
          if (!applies) return null;
          const specificityScore = matchesProduct ? 3 : matchesCategory ? 2 : promo.appliesToAll ? 1 : 0;
          return {
            promo,
            specificityScore,
            typePriority: getPromotionTypePriority(promo.discountType),
            effectivePercent: promoToPercent(promo.discountType, promo.discountValue, item.price),
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          if (b.specificityScore !== a.specificityScore) return b.specificityScore - a.specificityScore;
          if (b.typePriority !== a.typePriority) return b.typePriority - a.typePriority;
          return b.effectivePercent - a.effectivePercent;
        })?.[0] as any;

      if (!matched?.promo) {
        return { ...item, discount: 0, promotionType: undefined, promo_id: null, _promo: null };
      }

      const type = String(matched.promo.discountType).toLowerCase();
      const isBogo = type.includes("bogo");
      const isBundle = type.includes("bundle");
      const percent = promoToPercent(type, matched.promo.discountValue, item.price);

      return {
        ...item,
        discount: isBundle ? 0 : isBogo ? getLineEffectiveDiscountPercent({ ...item, promotionType: "bogo" }) : percent,
        discountInput: isBundle
          ? "0"
          : isBogo
            ? formatPercentValue(getLineEffectiveDiscountPercent({ ...item, promotionType: "bogo" }))
            : item.discountInput,
        promotionType: isBogo ? "bogo" : isBundle ? "bundle" : (type.includes("fixed") ? "fixed" : type.includes("percentage") ? "percentage" : undefined),
        promo_id: matched.promo.promoKey,
        _promo: matched.promo as ActivePromotionRule,
      };
    });

    const bundlePromoMap = new Map<string, ActivePromotionRule>();
    withPromo.forEach((item: any) => {
      const promo = item._promo as ActivePromotionRule | null;
      if (!promo) return;
      if (String(promo.discountType).toLowerCase().includes("bundle")) {
        bundlePromoMap.set(promo.promoKey, promo);
      }
    });

    bundlePromoMap.forEach((promo) => {
      const matching = withPromo.filter((item: any) => item._promo?.promoKey === promo.promoKey);
      const qualifyingQty = matching.reduce((sum: number, item: CartItem) => sum + Number(item.quantity ?? 0), 0);
      const distinctProducts = new Set(matching.map((item: CartItem) => item.product_id)).size;
      const qualifies = qualifyingQty >= 2 && distinctProducts >= 2;
      if (!qualifies) return;
      const bundlePercent = promoToPercent(promo.discountType, promo.discountValue, 100);
      matching.forEach((target: any) => {
        target.discount = bundlePercent;
        target.discountInput = formatPercentValue(bundlePercent);
        target.promotionType = "bundle";
      });
    });

    return withPromo.map(({ _promo, ...clean }: any) => clean as CartItem);
  };

  const addVariantToCart = (selectedVariant: ProductVariant, requestedQuantity: number) => {
    if (!isSellableProduct(selectedVariant)) {
      toast.error("This product is not sellable. Set it to Active and make sure it has stock first.");
      return false;
    }
    const meta = productMetaById.get(selectedVariant.product_id);
    const productNameLc = String(meta?.productName ?? selectedVariant.product_name).toLowerCase();
    const categoryLc = String(meta?.categoryName ?? "").toLowerCase();
    const matchedPromotion = activePromotionRules
      .map((promo) => {
        const matchesProduct = promo.products.includes(productNameLc);
        const matchesCategory = categoryLc ? promo.categories.includes(categoryLc) : false;
        const applies = productMatchesPromotion(promo, productNameLc, categoryLc);
        if (!applies) return null;

        const specificityScore = matchesProduct ? 3 : matchesCategory ? 2 : promo.appliesToAll ? 1 : 0;
        return {
          promo,
          specificityScore,
          typePriority: getPromotionTypePriority(promo.discountType),
          effectivePercent: promoToPercent(promo.discountType, promo.discountValue, selectedVariant.price),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (b.specificityScore !== a.specificityScore) return b.specificityScore - a.specificityScore;
        if (b.typePriority !== a.typePriority) return b.typePriority - a.typePriority;
        return b.effectivePercent - a.effectivePercent;
      })?.[0]?.promo;
    const promoDiscount = matchedPromotion
      ? promoToPercent(matchedPromotion.discountType, matchedPromotion.discountValue, selectedVariant.price)
      : 0;

    const isBogoApplied = Boolean(matchedPromotion?.discountType.toLowerCase().includes("bogo"));
    const isBundleApplied = Boolean(matchedPromotion?.discountType.toLowerCase().includes("bundle"));
    const quantityToAdd = isBogoApplied ? 2 : requestedQuantity;
    const existingProductQuantity = cart
      .filter((item) => item.product_id === selectedVariant.product_id)
      .reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    const existingBogoPairs = cart.filter((item) => item.product_id === selectedVariant.product_id && isBogoCartItem(item)).length;
    const nextProductQuantity = existingProductQuantity + quantityToAdd;
    if (isBogoApplied && existingBogoPairs + 1 > BOGO_MAX_PAIRS_PER_TRANSACTION) {
      toast.error(`BOGO limit is ${BOGO_MAX_PAIRS_PER_TRANSACTION} pairs per product per transaction.`);
      return false;
    }
    if (nextProductQuantity > selectedVariant.stock_quantity) {
      const promoHint = isBogoApplied ? " BOGO consumes 2 units for every paid pair." : "";
      toast.error(`Only ${selectedVariant.stock_quantity} units available in stock.${promoHint}`);
      return false;
    }
    const shouldApplyBundleNow = (() => {
      if (!isBundleApplied || !matchedPromotion) return false;
      let qualifyingQty = requestedQuantity;
      cart.forEach((item) => {
        const metaRow = productMetaById.get(String(item.product_id ?? ""));
        const itemNameLc = String(metaRow?.productName ?? item.productName ?? "").toLowerCase();
        const itemCategoryLc = String(metaRow?.categoryName ?? "").toLowerCase();
        if (productMatchesPromotion(matchedPromotion, itemNameLc, itemCategoryLc)) {
          qualifyingQty += Number(item.quantity ?? 0);
        }
      });
      return qualifyingQty >= 2;
    })();

    const finalDiscount = isBogoApplied
      ? getLineEffectiveDiscountPercent({
          id: selectedVariant.product_id,
          product_id: selectedVariant.product_id,
          productName: selectedVariant.product_name,
          brand: selectedVariant.brand,
          color: selectedVariant.color,
          size: selectedVariant.size,
          price: selectedVariant.price,
          quantity: quantityToAdd,
          discount: 0,
          promotionType: "bogo",
        })
      : isBundleApplied
        ? (shouldApplyBundleNow ? promoDiscount : 0)
        : promoDiscount;

    setCart((prev) => {
      const existingItem = isBogoApplied ? undefined : prev.find((item) => item.id === selectedVariant.product_id);
      const next = existingItem
        ? prev.map((item) =>
            item.id === selectedVariant.product_id
              ? {
                  ...item,
                  quantity: item.quantity + quantityToAdd,
                  discount: isBogoApplied
                    ? getLineEffectiveDiscountPercent({ ...item, quantity: item.quantity + quantityToAdd, promotionType: "bogo" })
                    : finalDiscount,
                  discountInput: isBogoApplied
                    ? formatPercentValue(getLineEffectiveDiscountPercent({ ...item, quantity: item.quantity + quantityToAdd, promotionType: "bogo" }))
                    : item.discountInput,
                  promotionType: isBogoApplied ? "bogo" : isBundleApplied ? "bundle" : item.promotionType,
                  promo_id: matchedPromotion?.promoKey ?? item.promo_id ?? null,
                }
              : item,
          )
        : [
            ...prev,
            {
              id: isBogoApplied
                ? `${selectedVariant.product_id}:bogo:${matchedPromotion?.promoKey ?? "promo"}:${Date.now()}`
                : selectedVariant.product_id,
              product_id: selectedVariant.product_id,
              productName: selectedVariant.product_name,
              brand: selectedVariant.brand,
              color: selectedVariant.color,
              size: selectedVariant.size,
              price: selectedVariant.price,
              quantity: quantityToAdd,
              discount: finalDiscount,
              discountInput: isBogoApplied ? formatPercentValue(finalDiscount) : undefined,
              promotionType: isBogoApplied ? "bogo" : isBundleApplied ? "bundle" : undefined,
              promo_id: matchedPromotion?.promoKey ?? null,
            },
          ];
      return recalculatePromotions(next);
    });

    setSelectedProductKey("");
    setSelectedColor("");
    setSelectedSize("");
    setQuantity("1");
    if (isBogoApplied) {
      toast.success("BOGO applied: 2 pairs locked as buy-1-get-1");
    } else if (isBundleApplied && !shouldApplyBundleNow) {
      toast.success("Bundle selected. Add at least 2 qualifying items to activate discount.");
    } else if (isBundleApplied && shouldApplyBundleNow) {
      toast.success("Bundle discount applied.");
    } else if (matchedPromotion) {
      toast.success("Product added with active promotion applied");
    } else {
      toast.success("Product added to cart");
    }
    return true;
  };

  const addToCart = () => {
    if (!selectedProductKey) return toast.error("Please select a product");
    if (!selectedColor) return toast.error("Please select a color");
    if (!selectedSize) return toast.error("Please select a size");

    const selectedVariant = sellableProductInventory.find(
      (v) => v.product_name === selectedProductKey && v.color === selectedColor && v.size === selectedSize,
    );
    if (!selectedVariant) return;

    const requestedQuantity = Math.floor(Number(quantity));
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    const added = addVariantToCart(selectedVariant, requestedQuantity);
    if (!added) return;

    setSelectedProductKey("");
    setSelectedColor("");
    setSelectedSize("");
    setQuantity("1");
  };

  const selectProductVariant = (variant: ProductVariant) => {
    const added = addVariantToCart(variant, 1);
    if (!added) return;
    setIsProductGridOpen(false);
    setProductSearch("");
  };

  const removeFromCart = (id: string) =>
    setCart((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return recalculatePromotions(next);
    });

  const updateQuantity = (id: string, newQuantity: number) => {
    const currentItem = cart.find((item) => item.id === id);
    if (currentItem && isBogoCartItem(currentItem)) {
      toast.error("BOGO quantity is locked to 2 pairs. Add another BOGO line for another pair.");
      return;
    }
    const variant = sellableProductInventory.find((row) => row.product_id === currentItem?.product_id);
    const stockMax = Math.max(1, Number(variant?.stock_quantity ?? Number.MAX_SAFE_INTEGER));
    const maxQuantity = stockMax;
    const cleanQuantity = Math.min(maxQuantity, Math.max(1, Math.floor(Number(newQuantity) || 1)));
    if (Math.floor(Number(newQuantity) || 1) > maxQuantity) {
      toast.error(`Only ${maxQuantity} units available in stock`);
    }
    setCart((prev) =>
      recalculatePromotions(
        prev.map((item) => (item.id === id ? { ...item, quantity: cleanQuantity, quantityInput: String(cleanQuantity) } : item)),
      ),
    );
  };

  const updateQuantityInput = (id: string, value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    const currentItem = cart.find((item) => item.id === id);
    if (currentItem && isBogoCartItem(currentItem)) return;
    const variant = sellableProductInventory.find((row) => row.product_id === currentItem?.product_id);
    const stockMax = Math.max(1, Number(variant?.stock_quantity ?? Number.MAX_SAFE_INTEGER));
    const maxQuantity = stockMax;
    setCart((prev) =>
      recalculatePromotions(
        prev.map((item) => {
          if (item.id !== id) return item;
          if (cleanValue === "") return { ...item, quantityInput: "" };
          const cleanQuantity = Math.min(maxQuantity, Math.max(1, Number(cleanValue) || 1));
          return { ...item, quantity: cleanQuantity, quantityInput: String(cleanQuantity) };
        }),
      ),
    );
  };

  const commitQuantityInput = (id: string) => {
    const currentItem = cart.find((item) => item.id === id);
    if (currentItem && isBogoCartItem(currentItem)) return;
    const variant = sellableProductInventory.find((row) => row.product_id === currentItem?.product_id);
    const stockMax = Math.max(1, Number(variant?.stock_quantity ?? Number.MAX_SAFE_INTEGER));
    const maxQuantity = stockMax;
    setCart((prev) =>
      recalculatePromotions(
        prev.map((item) => {
          if (item.id !== id) return item;
          const cleanQuantity = Math.min(maxQuantity, Math.max(1, Math.floor(Number(item.quantityInput ?? item.quantity) || 1)));
          return { ...item, quantity: cleanQuantity, quantityInput: String(cleanQuantity) };
        }),
      ),
    );
  };

  const updateDiscount = (id: string, newDiscount: number) => {
    const cleanDiscount = Math.min(100, Math.max(0, Number.isFinite(newDiscount) ? newDiscount : 0));
    setCart((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              discount: isBogoCartItem(item) ? getLineEffectiveDiscountPercent(item) : cleanDiscount,
              discountInput: isBogoCartItem(item) ? formatPercentValue(getLineEffectiveDiscountPercent(item)) : String(cleanDiscount),
            }
          : item,
      ),
    );
  };

  const updateDiscountInput = (id: string, value: string) => {
    const cleanValue = value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id || isBogoCartItem(item)) return item;
        if (cleanValue === "") return { ...item, discountInput: "", discount: 0 };
        const cleanDiscount = Math.min(100, Math.max(0, Number(cleanValue) || 0));
        return { ...item, discountInput: cleanValue, discount: cleanDiscount };
      }),
    );
  };

  const commitDiscountInput = (id: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id || isBogoCartItem(item)) return item;
        const cleanDiscount = Math.min(100, Math.max(0, Number(item.discountInput ?? item.discount) || 0));
        return { ...item, discount: cleanDiscount, discountInput: String(cleanDiscount) };
      }),
    );
  };

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const calculateTotalDiscount = () => cart.reduce((sum, item) => sum + getLineDiscountAmount(item), 0);
  const calculateTotal = () => calculateSubtotal() - calculateTotalDiscount();

  const normalizePhone = (value: string) => value.replace(/\D/g, "").slice(0, 11);

  const getOrCreateWalkInCustomer = async () => {
    const name = walkInCustomerName.trim();
    const phone = normalizePhone(walkInCustomerPhone);
    if (!name || !phone) {
      throw new Error("Please provide walk-in customer name and mobile number");
    }
    if (phone.length !== 11) {
      throw new Error("Mobile number must be exactly 11 digits");
    }

    const { data: existing, error: selectError } = await supabase
      .from("customer")
      .select("customer_id,name,gender,age,birth_date")
      .eq("contact_number", phone)
      .limit(1);
    if (selectError) throw selectError;

    if (existing && existing.length > 0) {
      const existingGender = String((existing[0] as any).gender ?? "").trim();
      const existingAgeRaw = Number((existing[0] as any).age ?? NaN);
      const existingAge = Number.isFinite(existingAgeRaw) ? existingAgeRaw : null;
      const existingBirthDate = String((existing[0] as any).birth_date ?? "").trim();
      if (!existingGender || (!existingBirthDate && existingAge === null)) {
        throw new Error("This customer exists but is missing gender/age. Please update profile in Customers first.");
      }
      return { customer_id: existing[0].customer_id as string, label: (existing[0].name as string) || name };
    }

    if (!walkInGender) {
      throw new Error("Please provide gender for walk-in customer");
    }
    const parsedAge = Number(walkInAge);
    if (!Number.isFinite(parsedAge) || parsedAge < 0 || parsedAge > 120) {
      throw new Error("Please provide a valid age (0-120) for walk-in customer");
    }

    const fallbackEmail = `${phone.replace(/[^\d]/g, "") || Date.now()}@walkin.local`;
    const { data: created, error: insertError } = await supabase
      .from("customer")
      .insert({
        name,
        contact_number: phone,
        email: fallbackEmail,
        gender: walkInGender,
        age: parsedAge,
        status: "active",
        date_registered: new Date().toISOString().slice(0, 10),
      })
      .select("customer_id,name")
      .single();
    if (insertError) throw insertError;

    return { customer_id: created.customer_id as string, label: (created.name as string) || name };
  };

  const processPayment = async () => {
    if (!user?.user_id) return toast.error("No logged in user");
    if (cart.length === 0) return toast.error("Cart is empty");

    const total = calculateTotal();
    const paid = paymentMethod === "Cash" ? Number(cashReceived || 0) : total;
    if (paid < total) return toast.error("Insufficient payment amount");

    // Map UI payment method to database value
    const dbPaymentMethod = paymentMethod === "Cash" ? "cash" : "gcash";

    const selectedCustomer = customerOptions.find((c) => c.value === customerName);
    let p_customer_id = selectedCustomer?.customer_id ?? null;
    let receiptCustomerName = selectedCustomer?.label ?? "Walk-in Customer";

    if (customerName !== "walk-in") {
      const selectedGender = String((selectedCustomer as any)?.gender ?? "").trim();
      const selectedAgeRaw = Number((selectedCustomer as any)?.age ?? NaN);
      const selectedAge = Number.isFinite(selectedAgeRaw) ? selectedAgeRaw : null;
      const selectedBirthDate = String((selectedCustomer as any)?.birth_date ?? "").trim();
      if (!selectedGender || (!selectedBirthDate && selectedAge === null)) {
        return toast.error("Selected customer is missing gender/age. Update profile in Customers first.");
      }
    }

    if (customerName === "walk-in" && saveWalkInDetails) {
      try {
        const walkInCustomer = await getOrCreateWalkInCustomer();
        p_customer_id = walkInCustomer.customer_id;
        receiptCustomerName = walkInCustomer.label;
      } catch (error: any) {
        return toast.error(error?.message ?? "Failed to save walk-in customer");
      }
    }

    const items = cart.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price,
      discount_applied: Number(getLineEffectiveDiscountPercent(item).toFixed(2)),
      subtotal: Number(getLineTotal(item).toFixed(2)),
    }));

    const { data, error } = await supabase.rpc("complete_sale", {
      p_user_id: user.user_id,
      p_customer_id,
      p_payment_method: dbPaymentMethod,
      p_amount_paid: paid,
      p_items: items,
    });

    if (error) return toast.error(error.message);

    const completedSalesId = String(data?.sales_id ?? "").trim();
    if (completedSalesId) {
      await Promise.all(
        cart
          .filter((item) => item.promo_id)
          .map(async (item) => {
            const updateResult = await supabase
              .from("sales_details")
              .update({ promo_id: item.promo_id })
              .eq("sales_id", completedSalesId)
              .eq("product_id", item.product_id);
            if (updateResult.error) {
              const message = String(updateResult.error.message || "").toLowerCase();
              if (!message.includes("promo_id") && !message.includes("column")) {
                console.warn("Unable to tag sale detail with promotion:", updateResult.error);
              }
            }
          }),
      );
    }

    const receipt = {
      receiptNumber: data?.sales_id ?? `RCP-${Date.now()}`,
      date: new Date().toLocaleString(),
      customerName: receiptCustomerName,
      items: cart,
      subtotal: calculateSubtotal(),
      discount: calculateTotalDiscount(),
      total: Number(data?.total_amount ?? total),
      change_amount: Number(data?.change_amount ?? Math.max(0, paid - total)),
      paymentMethod,
      cashier: user.name,
    };
    setReceiptData(receipt);
    setShowReceipt(true);
    setCart([]);
    setCustomerName("walk-in");
    setSaveWalkInDetails(false);
    setWalkInCustomerName("");
    setWalkInCustomerPhone("");
    setWalkInGender("");
    setWalkInAge("");
    setPaymentMethod("Cash");
    setCashReceived("");
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    await queryClient.invalidateQueries({ queryKey: ["inventoryLog"] });
    await queryClient.invalidateQueries({ queryKey: ["sales"] });
    toast.success("Payment processed successfully!");
  };

  const printReceipt = () => {
    window.print();
    toast.success("Receipt sent to printer");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-yellow-300 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Product Selection
              </CardTitle>
              <Button
                type="button"
                onClick={() => setIsProductGridOpen(true)}
                className="bg-yellow-400 text-red-900 hover:bg-yellow-500"
              >
                <Search className="w-4 h-4 mr-2" />
                Browse Products
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Dialog
              open={isProductGridOpen}
              onOpenChange={(open) => {
                setIsProductGridOpen(open);
                setProductSearch("");
              }}
            >
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200 !w-[92vw] !max-w-[1040px] max-h-[84vh] overflow-hidden p-0 shadow-2xl">
                <div className="border-b border-red-800 p-5">
                  <DialogHeader>
                    <DialogTitle className="text-yellow-300 flex items-center gap-2">
                      <Package className="w-5 h-5" />
                      Select Product
                    </DialogTitle>
                  </DialogHeader>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                    <Input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="Search by SKU, product, brand, category, variant, size, or price..."
                      className="mt-4 h-11 rounded-xl bg-red-600 border-red-800 pl-10 text-yellow-200 placeholder:text-yellow-300/50 focus-visible:ring-yellow-400"
                    />
                  </div>
                </div>
                <div className="p-5">
                  <div className="overflow-hidden rounded-xl border border-red-800">
                    <div className="grid grid-cols-[1.25fr_0.8fr_1.05fr_1.05fr_0.75fr_0.8fr_0.75fr] bg-red-800 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-yellow-300">
                      <div>Product</div>
                      <div>Brand</div>
                      <div>Category</div>
                      <div>Variant</div>
                      <div>Price</div>
                      <div>Stock</div>
                      <div>Action</div>
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto overflow-x-hidden">
                      {filteredProductInventory.length > 0 ? filteredProductInventory.map((product) => {
                        const sellable = isSellableProduct(product);
                        return (
                          <div
                            key={product.product_id}
                            className="grid grid-cols-[1.25fr_0.8fr_1.05fr_1.05fr_0.75fr_0.8fr_0.75fr] items-center border-t border-red-800 px-4 py-4 text-center text-sm transition-colors hover:bg-red-800/60"
                          >
                            <div className="truncate font-medium text-yellow-100" title={product.product_name}>{product.product_name}</div>
                            <div className="truncate text-yellow-200" title={product.brand}>{product.brand}</div>
                            <div className="truncate text-yellow-200" title={product.category}>{product.category}</div>
                            <div className="truncate text-yellow-200" title={productVariantLabel(product)}>
                              {productVariantLabel(product)}
                            </div>
                            <div className="truncate font-medium text-yellow-300" title={`PHP ${product.price}`}>PHP {product.price}</div>
                            <div className="min-w-0">
                              <Badge className="max-w-full truncate rounded-full bg-yellow-400 px-3 py-1 text-red-900">{product.stock_quantity} units</Badge>
                            </div>
                            <div className="flex justify-center">
                              <Button
                                size="sm"
                                disabled={!sellable}
                                onClick={() => selectProductVariant(product)}
                                className="h-8 rounded-full bg-yellow-400 px-4 font-semibold text-red-900 hover:bg-yellow-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-300"
                              >
                                {sellable ? "Add" : "Locked"}
                              </Button>
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="border-t border-red-800 px-4 py-10 text-center text-sm text-yellow-200/70">
                          Search for an active product with available stock.
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-center text-xs text-yellow-200/70">
                    Only active, non-expired products with POS-available stock are shown. Held stock is excluded from cashier availability.
                  </p>
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-yellow-300">Select Product</Label>
                <Select
                  value={selectedProductKey}
                  onValueChange={(value) => {
                    setSelectedProductKey(value);
                    setSelectedColor("");
                    setSelectedSize("");
                  }}
                >
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue placeholder="Choose product name" />
                  </SelectTrigger>
                  <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                    {productGroups.map((group) => (
                      <SelectItem key={group.key} value={group.key}>
                        {group.product_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-yellow-300">Select Color</Label>
                <Select
                  value={selectedColor}
                  onValueChange={(value) => {
                    setSelectedColor(value);
                    setSelectedSize("");
                  }}
                  disabled={!selectedProductKey}
                >
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue placeholder={selectedProductKey ? "Choose color" : "Select product first"} />
                  </SelectTrigger>
                  <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                    {availableColors.map((color) => (
                      <SelectItem key={color} value={color}>
                        {color}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-yellow-300">Select Size</Label>
                <Select value={selectedSize} onValueChange={setSelectedSize} disabled={!selectedColor}>
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue placeholder={selectedColor ? "Choose size" : "Select color first"} />
                  </SelectTrigger>
                  <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                    {availableSizes.map((variant) => (
                      <SelectItem key={variant.product_id} value={variant.size}>
                        Size {variant.size} (Stock: {variant.stock_quantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-yellow-300">Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => {
                    const cleanValue = e.target.value.replace(/[^\d]/g, "");
                    setQuantity(cleanValue);
                  }}
                  onBlur={() => {
                    if (!quantity || Number(quantity) <= 0) setQuantity("1");
                  }}
                  className="bg-red-600 border-red-800 text-yellow-200"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={addToCart} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                <Plus className="w-4 h-4 mr-2" />
                Add to Cart
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Shopping Cart
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <div className="text-center py-8 text-yellow-200">Cart is empty. Add products to begin transaction.</div>
            ) : (
              <div className="border border-red-800 rounded-lg overflow-x-hidden">
                <Table className="w-full">
                  <TableHeader>
                  <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                      <TableHead className="text-yellow-300 whitespace-nowrap text-left px-3">Product</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-left px-3">Brand</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-2">Color</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-2">Size</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-3">Price</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-2">Qty</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-2">Discount</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-2">Promo</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-3">Subtotal</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap text-center px-2">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item) => {
                      const itemTotal = getLineTotal(item);
                      const itemIsBogo = isBogoCartItem(item);
                      return (
                        <TableRow key={item.id} className="border-red-800">
                          <TableCell className="text-yellow-200 whitespace-nowrap align-middle px-3 py-2 truncate">
                            {item.productName}
                          </TableCell>
                          <TableCell className="text-yellow-200 whitespace-nowrap align-middle px-3 py-2 truncate">{item.brand}</TableCell>
                          <TableCell className="text-yellow-200 whitespace-nowrap text-center align-middle px-2 py-2">{item.color}</TableCell>
                          <TableCell className="text-yellow-200 whitespace-nowrap text-center align-middle px-2 py-2">{item.size}</TableCell>
                          <TableCell className="text-yellow-300 whitespace-nowrap text-center align-middle px-3 py-2">
                            <span className="inline-block tabular-nums">
                              {formatCurrency(item.price)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center align-middle px-2 py-2">
                            <div className="mx-auto flex w-[104px] items-center justify-center rounded-xl border border-yellow-400/25 bg-[#1D1D25] p-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                disabled={itemIsBogo || item.quantity <= 1}
                                className="h-7 w-7 rounded-lg text-yellow-300 hover:bg-yellow-400 hover:text-[#171219] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={item.quantityInput ?? String(item.quantity)}
                                onChange={(e) => updateQuantityInput(item.id, e.target.value)}
                                onBlur={() => commitQuantityInput(item.id)}
                                className="h-7 w-10 border-0 bg-transparent p-0 text-center text-yellow-100 shadow-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                disabled={itemIsBogo}
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                disabled={itemIsBogo}
                                className="h-7 w-7 rounded-lg text-yellow-300 hover:bg-yellow-400 hover:text-[#171219]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-middle px-2 py-2">
                            <div className="mx-auto flex w-[122px] items-center justify-center rounded-xl border border-yellow-400/25 bg-[#1D1D25] p-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => updateDiscount(item.id, item.discount - 1)}
                                disabled={itemIsBogo || item.discount <= 0}
                                className="h-7 w-7 rounded-lg text-yellow-300 hover:bg-yellow-400 hover:text-[#171219] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={item.discountInput ?? String(item.discount)}
                                onChange={(e) => updateDiscountInput(item.id, e.target.value)}
                                onBlur={() => commitDiscountInput(item.id)}
                                className="h-7 w-14 border-0 bg-transparent p-0 text-center text-yellow-100 shadow-none focus-visible:ring-0"
                                disabled={itemIsBogo}
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => updateDiscount(item.id, item.discount + 1)}
                                disabled={itemIsBogo || item.discount >= 100}
                                className="h-7 w-7 rounded-lg text-yellow-300 hover:bg-yellow-400 hover:text-[#171219] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-middle px-2 py-2">
                            {item.promotionType ? (
                              <div className="flex flex-col items-center gap-1">
                                <Badge className="bg-yellow-400 text-red-900">
                                  {getPromoBadgeLabel(item.promotionType)}
                                </Badge>
                                {isBogoCartItem(item) && (
                                  <span className="text-[10px] text-yellow-200/70">
                                    {getBogoFreeUnits(item.quantity)} free
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-yellow-200/60 text-xs">None</span>
                            )}
                          </TableCell>
                          <TableCell className="text-yellow-300 text-center align-middle px-3 py-2">
                            <span className="inline-block tabular-nums">
                              {formatCurrency(itemTotal)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center align-middle px-2 py-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromCart(item.id)}
                              className="text-yellow-400 hover:text-yellow-300 hover:bg-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <Coins className="w-5 h-5" />
              Transaction Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between text-yellow-200"><span>Subtotal:</span><span className="text-yellow-300">₱{calculateSubtotal().toFixed(2)}</span></div>
              <div className="flex justify-between text-yellow-200"><span>Total Discount:</span><span className="text-yellow-300">-₱{calculateTotalDiscount().toFixed(2)}</span></div>
              <div className="border-t border-red-600 pt-3">
                <div className="flex justify-between"><span className="text-yellow-300 text-lg">Total:</span><span className="text-yellow-300 text-2xl">₱{calculateTotal().toFixed(2)}</span></div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-red-600">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-yellow-300">Select Existing Customer</Label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsCustomerGridOpen(true)}
                    className="bg-yellow-400 text-red-900 hover:bg-yellow-500"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Browse
                  </Button>
                </div>
                <Dialog open={isCustomerGridOpen} onOpenChange={setIsCustomerGridOpen}>
                  <DialogContent className="bg-red-700 border-red-800 text-yellow-200 !w-[92vw] !max-w-[820px] max-h-[82vh] overflow-hidden p-0">
                    <div className="border-b border-red-800 p-5">
                      <DialogHeader>
                        <DialogTitle className="text-yellow-300 flex items-center gap-2">
                          <Users className="w-5 h-5" />
                          Select Customer
                        </DialogTitle>
                      </DialogHeader>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                        <Input
                          value={customerSearch}
                          onChange={(event) => setCustomerSearch(event.target.value)}
                          placeholder="Search by name, email, or contact number..."
                          className="mt-4 pl-10 bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
                        />
                      </div>
                    </div>
                    <div className="p-5 pt-4">
                      <div className="border border-red-800 rounded-xl overflow-hidden">
                        <div className="max-h-[52vh] overflow-y-auto overflow-x-hidden">
                        <Table className="w-full table-fixed text-sm">
                          <TableHeader className="sticky top-0 z-10">
                            <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                              <TableHead className="w-[24%] px-3 text-center text-yellow-300">Name</TableHead>
                              <TableHead className="w-[36%] px-3 text-center text-yellow-300">Email</TableHead>
                              <TableHead className="w-[24%] px-3 text-center text-yellow-300">Contact</TableHead>
                              <TableHead className="w-[16%] px-3 text-center text-yellow-300">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredCustomerOptions.map((customer: any) => (
                              <TableRow
                                key={customer.value}
                                onClick={() => selectCustomer(customer)}
                                className="cursor-pointer border-red-800 transition-colors hover:bg-red-800/60"
                              >
                                <TableCell className="truncate px-3 text-center text-yellow-200" title={customer.label}>
                                  {customer.label}
                                </TableCell>
                                <TableCell className="truncate px-3 text-center text-yellow-200" title={customer.email || "N/A"}>
                                  {customer.email || "N/A"}
                                </TableCell>
                                <TableCell className="truncate px-3 text-center text-yellow-200" title={customer.contact_number || "N/A"}>
                                  {customer.contact_number || "N/A"}
                                </TableCell>
                                <TableCell className="px-3 text-center">
                                  <Button
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      selectCustomer(customer);
                                    }}
                                    className="h-8 bg-yellow-400 px-3 text-red-900 hover:bg-yellow-500"
                                  >
                                    Select
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-yellow-200/70">
                        Click a row or the Select button to use an existing customer. Use Walk-in Customer for quick sales.
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
                <Select
                  value={customerName}
                  onValueChange={(value) => {
                    setCustomerName(value);
                    if (value !== "walk-in") {
                      setSaveWalkInDetails(false);
                    }
                  }}
                >
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                    {customerOptions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {customerName === "walk-in" && (
                <div className="space-y-3 rounded-md border border-red-800 p-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="save-walkin-details"
                      checked={saveWalkInDetails}
                      onCheckedChange={(checked) => setSaveWalkInDetails(Boolean(checked))}
                    />
                    <Label htmlFor="save-walkin-details" className="text-yellow-300 cursor-pointer">
                      Save walk-in customer details
                    </Label>
                  </div>
                  {saveWalkInDetails && (
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-2">
                        <Label className="text-yellow-300">Customer Name</Label>
                        <Input
                          value={walkInCustomerName}
                          onChange={(e) => setWalkInCustomerName(e.target.value)}
                          placeholder="e.g. Juan Dela Cruz"
                          className="bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-yellow-300">Mobile Number</Label>
                        <Input
                          value={walkInCustomerPhone}
                          onChange={(e) => setWalkInCustomerPhone(normalizePhone(e.target.value))}
                          placeholder="e.g. 09171234567"
                          inputMode="numeric"
                          maxLength={11}
                          className="bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-yellow-300">Gender</Label>
                        <Select value={walkInGender} onValueChange={setWalkInGender}>
                          <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Kids (Boy)">Kids (Boy)</SelectItem>
                            <SelectItem value="Kids (Girl)">Kids (Girl)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-yellow-300">Age</Label>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          value={walkInAge}
                          onChange={(e) => setWalkInAge(e.target.value)}
                          className="bg-red-600 border-red-800 text-yellow-200"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-yellow-300">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="GCash">GCash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "Cash" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-yellow-300">Cash Received</Label>
                    <Input
                      type="number"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0.00"
                      className="bg-red-600 border-red-800 text-yellow-200 placeholder:text-yellow-300/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-yellow-300">Change Amount</Label>
                    <div className="bg-red-600 border border-red-800 rounded-md px-3 py-2 text-yellow-300">
                      ₱{Math.max(0, (parseFloat(cashReceived) || 0) - calculateTotal()).toFixed(2)}
                    </div>
                  </div>
                </>
              )}

              <Button onClick={processPayment} disabled={cart.length === 0} className="w-full bg-yellow-400 text-red-900 hover:bg-yellow-500 disabled:opacity-50">
                <Receipt className="w-4 h-4 mr-2" />
                Complete Payment
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-700 border-red-800">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-yellow-200 text-sm">
                <span>Items in Cart:</span>
                <Badge className="bg-yellow-400 text-red-900">{cart.length}</Badge>
              </div>
              <div className="flex justify-between text-yellow-200 text-sm">
                <span>Total Units:</span>
                <Badge className="bg-yellow-400 text-red-900">{cart.reduce((sum, item) => sum + item.quantity, 0)}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-yellow-300 text-center">Transaction Receipt</DialogTitle>
          </DialogHeader>
          {receiptData && (
            <div className="space-y-4 py-4">
              <div className="text-center border-b border-red-600 pb-4">
                <h3 className="text-yellow-300 text-xl">Meryl Shoes</h3>
                <p className="text-yellow-200 text-sm">{receiptData.date}</p>
                <p className="text-yellow-200 text-sm">Receipt: {receiptData.receiptNumber}</p>
              </div>
              <div className="space-y-2">
                <div className="text-yellow-200 text-sm"><span>Customer: {receiptData.customerName}</span></div>
                <div className="text-yellow-200 text-sm"><span>Cashier: {receiptData.cashier}</span></div>
              </div>
              <div className="border-y border-red-600 py-3">
                {receiptData.items.map((item: CartItem, index: number) => (
                  <div key={index} className="text-yellow-200 text-sm mb-2">
                    <div className="flex justify-between">
                      <span>{item.productName} ({item.color} - Size {item.size})</span>
                      <span>{formatCurrency(getLineTotal(item))}</span>
                    </div>
                    <div className="text-xs text-yellow-300/70 ml-2">
                      Brand: {item.brand} | {item.quantity} x {formatCurrency(item.price)}{" "}
                      {isBogoCartItem(item)
                        ? `(BOGO: ${getBogoFreeUnits(item.quantity)} free)`
                        : item.discount > 0
                          ? `(${formatPercentValue(item.discount)}% off)`
                          : ""}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-yellow-200"><span>Subtotal:</span><span>₱{receiptData.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-yellow-200"><span>Discount:</span><span>-₱{receiptData.discount.toFixed(2)}</span></div>
                <div className="flex justify-between text-yellow-300 text-lg border-t border-red-600 pt-2"><span>Total:</span><span>₱{receiptData.total.toFixed(2)}</span></div>
                <div className="flex justify-between text-yellow-200 text-sm"><span>Change:</span><span>₱{receiptData.change_amount.toFixed(2)}</span></div>
                <div className="flex justify-between text-yellow-200 text-sm"><span>Payment Method:</span><span>{receiptData.paymentMethod}</span></div>
              </div>
              <div className="text-center text-yellow-200 text-sm pt-4"><p>Thank you for your purchase!</p></div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={printReceipt} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
              <Receipt className="w-4 h-4 mr-2" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
