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
import { Coins, CreditCard, Package, Plus, Receipt, Trash2 } from "lucide-react";
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
  discount: number;
  promotionType?: string;
};

type ProductVariant = {
  product_id: string;
  product_name: string;
  brand: string;
  color: string;
  size: string;
  price: number;
  stock_quantity: number;
};

type ProductGroup = {
  key: string;
  product_name: string;
  color: string;
  variants: ProductVariant[];
};

type ActivePromotionRule = {
  discountType: string;
  discountValue: number;
  appliesToAll: boolean;
  categories: string[];
  products: string[];
  startDate: string;
  endDate: string;
};

const PROMO_TYPE_MARKERS = {
  bundle: "__TYPE_BUNDLE__",
  bogo: "__TYPE_BOGO__",
} as const;

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

function resolveEffectiveDiscountType(discountType: string, promoName: string | undefined) {
  const loweredName = String(promoName ?? "").toLowerCase();
  if (loweredName.includes(PROMO_TYPE_MARKERS.bogo.toLowerCase())) return "bogo";
  if (loweredName.includes(PROMO_TYPE_MARKERS.bundle.toLowerCase())) return "bundle";
  return String(discountType ?? "").toLowerCase();
}

function promoToPercent(discountType: string, discountValue: number, unitPrice: number) {
  const type = discountType.toLowerCase();
  if (type.includes("percentage")) return Math.max(0, Math.min(100, discountValue));
  if (type.includes("fixed")) {
    if (unitPrice <= 0) return 0;
    return Math.max(0, Math.min(100, (discountValue / unitPrice) * 100));
  }
  if (type.includes("bogo")) return 50;
  if (type.includes("bundle")) return Math.max(0, Math.min(100, discountValue || 10));
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
  const [quantity, setQuantity] = useState<number>(1);
  const [discount, setDiscount] = useState<number>(0);
  const [customerName, setCustomerName] = useState<string>("walk-in");
  const [saveWalkInDetails, setSaveWalkInDetails] = useState(false);
  const [walkInCustomerName, setWalkInCustomerName] = useState("");
  const [walkInCustomerPhone, setWalkInCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [receiptData, setReceiptData] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const customers = (customersQuery.data as any[]) ?? [];
  const customerOptions = useMemo(
    () => [{ label: "Walk-in Customer", value: "walk-in", customer_id: null }, ...customers.map((c) => ({ label: c.name, value: c.name, customer_id: c.customer_id }))],
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
      const stock = Number(inventory?.stock_quantity ?? 0);
      if (stock <= 0) continue;
      variants.push({
        product_id: row.product_id,
        product_name: row.product_name,
        brand: row.brand ?? "Meryl",
        color: row.color ?? "N/A",
        size: row.size ?? "N/A",
        price: Number(row.cost_price ?? 0),
        stock_quantity: stock,
      });
    }
    return variants;
  }, [productsQuery.data, inventoryQuery.data]);

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
        if (!(status === "active" && withinWindow)) return null;

        const parsedTarget = parsePromotionTarget(row.target_products ?? row.targetProducts);
        return {
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
      productInventory.reduce((acc, variant) => {
        const key = variant.product_name;
        const existing = acc.find((g) => g.key === key);
        if (existing) existing.variants.push(variant);
        else acc.push({ key, product_name: variant.product_name, color: variant.color, variants: [variant] });
        return acc;
      }, [] as ProductGroup[]),
    [productInventory],
  );

  const availableColors = selectedProductKey
    ? Array.from(new Set(
        productInventory
          .filter((v) => v.product_name === selectedProductKey)
          .map((v) => v.color)
      ))
    : [];

  const availableSizes = (selectedProductKey && selectedColor)
    ? productInventory
        .filter((v) => v.product_name === selectedProductKey && v.color === selectedColor)
        .map((v) => ({ ...v }))
    : [];

  const addToCart = () => {
    if (!selectedProductKey) return toast.error("Please select a product");
    if (!selectedColor) return toast.error("Please select a color");
    if (!selectedSize) return toast.error("Please select a size");

    const selectedVariant = productInventory.find(
      (v) => v.product_name === selectedProductKey && v.color === selectedColor && v.size === selectedSize,
    );
    if (!selectedVariant) return;
    if (quantity > selectedVariant.stock_quantity) {
      return toast.error(`Only ${selectedVariant.stock_quantity} units available in stock`);
    }

    const meta = productMetaById.get(selectedVariant.product_id);
    const productNameLc = String(meta?.productName ?? selectedVariant.product_name).toLowerCase();
    const categoryLc = String(meta?.categoryName ?? "").toLowerCase();
    const matchedPromotion = activePromotionRules
      .map((promo) => {
        const matchesProduct = promo.products.includes(productNameLc);
        const matchesCategory = categoryLc ? promo.categories.includes(categoryLc) : false;
        const applies = promo.appliesToAll || matchesProduct || matchesCategory;
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
      : discount;

    const isBogoApplied = Boolean(matchedPromotion?.discountType.toLowerCase().includes("bogo"));
    const quantityToAdd = isBogoApplied ? quantity * 2 : quantity;
    const finalDiscount = isBogoApplied ? 50 : promoDiscount;

    const existingItem = cart.find((item) => item.id === selectedVariant.product_id);
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.id === selectedVariant.product_id
            ? {
                ...item,
                quantity: item.quantity + quantityToAdd,
                discount: isBogoApplied ? 50 : item.discount,
                promotionType: isBogoApplied ? "bogo" : item.promotionType,
              }
            : item,
        ),
      );
    } else {
      setCart([
        ...cart,
        {
          id: selectedVariant.product_id,
          product_id: selectedVariant.product_id,
          productName: selectedVariant.product_name,
          brand: selectedVariant.brand,
          color: selectedVariant.color,
          size: selectedVariant.size,
          price: selectedVariant.price,
          quantity: quantityToAdd,
          discount: finalDiscount,
          promotionType: isBogoApplied ? "bogo" : undefined,
        },
      ]);
    }

    setSelectedProductKey("");
    setSelectedColor("");
    setSelectedSize("");
    setQuantity(1);
    setDiscount(0);
    if (isBogoApplied) {
      toast.success("BOGO applied: quantity doubled and charged as buy-1-get-1");
    } else if (matchedPromotion) {
      toast.success("Product added with active promotion applied");
    } else {
      toast.success("Product added to cart");
    }
  };

  const removeFromCart = (id: string) => setCart(cart.filter((item) => item.id !== id));

  const updateQuantity = (id: string, newQuantity: number) =>
    newQuantity >= 1 && setCart(cart.map((item) => (item.id === id ? { ...item, quantity: newQuantity } : item)));

  const updateDiscount = (id: string, newDiscount: number) =>
    newDiscount >= 0 &&
    newDiscount <= 100 &&
    setCart(
      cart.map((item) =>
        item.id === id
          ? { ...item, discount: item.promotionType === "bogo" ? 50 : newDiscount }
          : item,
      ),
    );

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const calculateTotalDiscount = () =>
    cart.reduce((sum, item) => sum + item.price * item.quantity * (item.discount / 100), 0);
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
      .select("customer_id,name")
      .eq("contact_number", phone)
      .limit(1);
    if (selectError) throw selectError;

    if (existing && existing.length > 0) {
      return { customer_id: existing[0].customer_id as string, label: (existing[0].name as string) || name };
    }

    const fallbackEmail = `${phone.replace(/[^\d]/g, "") || Date.now()}@walkin.local`;
    const { data: created, error: insertError } = await supabase
      .from("customer")
      .insert({
        name,
        contact_number: phone,
        email: fallbackEmail,
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

    const selectedCustomer = customerOptions.find((c) => c.value === customerName);
    let p_customer_id = selectedCustomer?.customer_id ?? null;
    let receiptCustomerName = selectedCustomer?.label ?? "Walk-in Customer";

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
      discount_applied: item.discount,
      subtotal: Number((item.price * item.quantity - item.price * item.quantity * (item.discount / 100)).toFixed(2)),
    }));

    const { data, error } = await supabase.rpc("complete_sale", {
      p_user_id: user.user_id,
      p_customer_id,
      p_payment_method: paymentMethod,
      p_amount_paid: paid,
      p_items: items,
    });

    if (error) return toast.error(error.message);

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
    setPaymentMethod("Cash");
    setCashReceived("");
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    await queryClient.invalidateQueries({ queryKey: ["inventory"] });
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
            <CardTitle className="text-yellow-300 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Product Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-yellow-300">Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="bg-red-600 border-red-800 text-yellow-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-yellow-300">Discount (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
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
              <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
                <Table className="w-full">
                  <TableHeader>
                  <TableRow className="bg-red-800 hover:bg-red-800 border-red-900">
                      <TableHead className="text-yellow-300 whitespace-nowrap">Product</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Brand</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Color</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Size</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Price</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Qty</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Discount</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Subtotal</TableHead>
                      <TableHead className="text-yellow-300 whitespace-nowrap">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item) => {
                      const itemSubtotal = item.price * item.quantity;
                      const itemDiscount = itemSubtotal * (item.discount / 100);
                      const itemTotal = itemSubtotal - itemDiscount;
                      return (
                        <TableRow key={item.id} className="border-red-800">
                          <TableCell className="text-yellow-200 whitespace-nowrap">
                            {item.productName}
                          </TableCell>
                          <TableCell className="text-yellow-200 whitespace-nowrap">{item.brand}</TableCell>
                          <TableCell className="text-yellow-200 whitespace-nowrap">{item.color}</TableCell>
                          <TableCell className="text-yellow-200 whitespace-nowrap">{item.size}</TableCell>
                          <TableCell className="text-yellow-300 whitespace-nowrap">₱{item.price}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-20 bg-red-600 border-red-800 text-yellow-200"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount}
                              onChange={(e) => updateDiscount(item.id, parseFloat(e.target.value) || 0)}
                              className="w-20 bg-red-600 border-red-800 text-yellow-200"
                              disabled={item.promotionType === "bogo"}
                            />
                          </TableCell>
                          <TableCell className="text-yellow-300">₱{itemTotal.toFixed(2)}</TableCell>
                          <TableCell>
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
                <Label className="text-yellow-300">Select Existing Customer</Label>
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
                      <span>₱{(item.price * item.quantity - (item.price * item.quantity * item.discount) / 100).toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-yellow-300/70 ml-2">
                      Brand: {item.brand} | {item.quantity} x ₱{item.price} {item.discount > 0 && `(${item.discount}% off)`}
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
