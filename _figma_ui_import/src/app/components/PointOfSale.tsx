import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Coins, CreditCard, Package, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomers, useProducts } from "../../lib/hooks";
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

export function PointOfSale() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const productsQuery = useProducts();
  const customersQuery = useCustomers();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductKey, setSelectedProductKey] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [discount, setDiscount] = useState<number>(0);
  const [customerName, setCustomerName] = useState<string>("walk-in");
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
    const variants: ProductVariant[] = [];
    for (const row of rows) {
      const inventory = Array.isArray(row.inventory) ? row.inventory[0] : row.inventory;
      const stock = Number(inventory?.stock_quantity ?? 0);
      if (stock <= 0) continue;
      variants.push({
        product_id: row.product_id,
        product_name: row.product_name,
        brand: "N/A",
        color: row.color ?? "N/A",
        size: row.size ?? "N/A",
        price: Number(row.cost_price ?? 0),
        stock_quantity: stock,
      });
    }
    return variants;
  }, [productsQuery.data]);

  const productGroups: ProductGroup[] = useMemo(
    () =>
      productInventory.reduce((acc, variant) => {
        const key = `${variant.product_name}-${variant.color}`;
        const existing = acc.find((g) => g.key === key);
        if (existing) existing.variants.push(variant);
        else acc.push({ key, product_name: variant.product_name, color: variant.color, variants: [variant] });
        return acc;
      }, [] as ProductGroup[]),
    [productInventory],
  );

  const availableSizes = selectedProductKey
    ? productGroups.find((g) => g.key === selectedProductKey)?.variants || []
    : [];

  const addToCart = () => {
    if (!selectedProductKey) return toast.error("Please select a product");
    if (!selectedSize) return toast.error("Please select a size");

    const selectedVariant = productInventory.find(
      (v) => `${v.product_name}-${v.color}` === selectedProductKey && v.size === selectedSize,
    );
    if (!selectedVariant) return;
    if (quantity > selectedVariant.stock_quantity) {
      return toast.error(`Only ${selectedVariant.stock_quantity} units available in stock`);
    }

    const existingItem = cart.find((item) => item.id === selectedVariant.product_id);
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.id === selectedVariant.product_id ? { ...item, quantity: item.quantity + quantity } : item,
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
          quantity,
          discount,
        },
      ]);
    }

    setSelectedProductKey("");
    setSelectedSize("");
    setQuantity(1);
    setDiscount(0);
    toast.success("Product added to cart");
  };

  const removeFromCart = (id: string) => setCart(cart.filter((item) => item.id !== id));

  const updateQuantity = (id: string, newQuantity: number) =>
    newQuantity >= 1 && setCart(cart.map((item) => (item.id === id ? { ...item, quantity: newQuantity } : item)));

  const updateDiscount = (id: string, newDiscount: number) =>
    newDiscount >= 0 &&
    newDiscount <= 100 &&
    setCart(cart.map((item) => (item.id === id ? { ...item, discount: newDiscount } : item)));

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const calculateTotalDiscount = () =>
    cart.reduce((sum, item) => sum + item.price * item.quantity * (item.discount / 100), 0);
  const calculateTotal = () => calculateSubtotal() - calculateTotalDiscount();

  const processPayment = async () => {
    if (!user?.user_id) return toast.error("No logged in user");
    if (cart.length === 0) return toast.error("Cart is empty");

    const total = calculateTotal();
    const paid = paymentMethod === "Cash" ? Number(cashReceived || 0) : total;
    if (paid < total) return toast.error("Insufficient payment amount");

    const selectedCustomer = customerOptions.find((c) => c.value === customerName);
    const p_customer_id = selectedCustomer?.customer_id ?? null;

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
      customerName: selectedCustomer?.label ?? "Walk-in Customer",
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
    setPaymentMethod("Cash");
    setCashReceived("");
    await queryClient.invalidateQueries({ queryKey: ["products"] });
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-yellow-300">Select Product (Name & Color)</Label>
                <Select
                  value={selectedProductKey}
                  onValueChange={(value) => {
                    setSelectedProductKey(value);
                    setSelectedSize("");
                  }}
                >
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue placeholder="Choose product name and color" />
                  </SelectTrigger>
                  <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                    {productGroups.map((group) => (
                      <SelectItem key={group.key} value={group.key}>
                        {group.product_name} - {group.color}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-yellow-300">Select Size</Label>
                <Select value={selectedSize} onValueChange={setSelectedSize} disabled={!selectedProductKey}>
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue placeholder={selectedProductKey ? "Choose size" : "Select product first"} />
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
                            <div>{item.brand} {item.productName}</div>
                          </TableCell>
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
                <Select value={customerName} onValueChange={setCustomerName}>
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

              <div className="space-y-2">
                <Label className="text-yellow-300">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-red-700 border-red-800 text-yellow-200">
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Debit Card">Debit Card</SelectItem>
                    <SelectItem value="Mobile Payment">Mobile Payment</SelectItem>
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
                      <span>{item.brand} {item.productName}</span>
                      <span>₱{(item.price * item.quantity - (item.price * item.quantity * item.discount) / 100).toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-yellow-300/70 ml-2">
                      {item.quantity} x ₱{item.price} {item.discount > 0 && `(${item.discount}% off)`}
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
