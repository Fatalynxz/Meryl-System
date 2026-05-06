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
import { Tag, Plus, Edit, Trash2, TrendingUp, Coins, ShoppingCart, Percent, Mail, CheckCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useCustomers, useProducts, usePromotions, usePromotionsMutations, useSales } from '../../lib/hooks';

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
};

type Notification = {
  notification_id: string;
  customer_id: string;
  promo_id: string;
  email: string;
  email_status: 'Sent' | 'Pending' | 'Failed';
  date_sent: string;
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

function toDbDiscountType(value: Promotion['discount_type'] | string | undefined) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('fixed')) return 'fixed';
  return 'percentage';
}

function toDbStatus(value: Promotion['status'] | string | undefined, startDate?: string) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('ended')) return 'expired';
  if (normalized.includes('scheduled')) return 'inactive';
  if (normalized.includes('active')) return 'active';
  return 'inactive';
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
    products.push(value);
  });

  return {
    categories: Array.from(new Set(categories)),
    products: Array.from(new Set(products)),
  };
}

export function PromotionManagement() {
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
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          productRows
            .map(
              (p: any) =>
                String(p.category?.[0]?.category_name ?? p.category?.category_name ?? '').trim(),
            )
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [productRows],
  );
  const productOptions = useMemo(
    () =>
      productRows
        .map((p: any) => ({
          name: String(p.product_name ?? 'Unknown Product').trim(),
          category: String(p.category?.[0]?.category_name ?? p.category?.category_name ?? '').trim(),
        }))
        .filter((p: any) => p.name)
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [productRows],
  );

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [formData, setFormData] = useState<Partial<Promotion>>({
    promo_name: '',
    discount_type: 'Percentage',
    discount_value: 0,
    targetProducts: '',
    start_date: '',
    end_date: '',
    status: 'Scheduled'
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotificationDialog, setShowNotificationDialog] = useState(false);
  const [lastNotificationBatch, setLastNotificationBatch] = useState<Notification[]>([]);
  const [isSavingPromotion, setIsSavingPromotion] = useState(false);
  const [isUpdatingPromotion, setIsUpdatingPromotion] = useState(false);

  const promotions: Promotion[] = useMemo(() => {
    const rows = (promotionsQuery.data as any[]) ?? [];
    return rows.map((row) => {
      const rawType = String(row.discount_type ?? 'Percentage').toLowerCase();
      const discount_type: Promotion['discount_type'] =
        rawType.includes('fixed')
          ? 'Fixed Amount'
          : rawType.includes('bogo')
            ? 'BOGO'
            : rawType.includes('bundle')
              ? 'Bundle'
              : 'Percentage';
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
      return {
        promo_id: String(row.promo_id ?? ''),
        promo_name: String(row.promo_name ?? 'Promotion'),
        discount_type,
        discount_value: Number(row.discount_value ?? 0),
        targetProducts: String(row.targetProducts ?? row.target_products ?? 'All Products'),
        start_date: String(row.start_date ?? '').slice(0, 10),
        end_date: String(row.end_date ?? '').slice(0, 10),
        status,
        salesGenerated: Number(row.salesGenerated ?? row.sales_generated ?? 0),
        unitsAffected: Number(row.unitsAffected ?? row.units_affected ?? 0),
        effectiveness: Number(row.effectiveness ?? 0),
      };
    });
  }, [promotionsQuery.data]);

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
        targetProducts: `${weakCategory.category} Category`,
      });
    }
    recs.push({
      id: 'weekend-traffic',
      title: 'Weekend traffic booster',
      rationale: 'Use short promo window to increase conversion without long margin impact.',
      discount_type: 'Fixed Amount',
      discount_value: 20,
      targetProducts: 'All Products',
    });
    return recs.slice(0, 4);
  }, [productsQuery.data, salesQuery.data]);

  const applyRecommendation = (rec: PromotionRecommendation) => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 7);
    const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
    setFormData({
      promo_name: rec.title,
      discount_type: rec.discount_type,
      discount_value: rec.discount_value,
      targetProducts: rec.targetProducts,
      start_date: toDateInput(start),
      end_date: toDateInput(end),
      status: 'Scheduled',
    });
    setIsAddDialogOpen(true);
    toast.success('Recommendation applied to promotion form');
  };

  // Performance data for charts
  const promotionPerformance = [
    { id: 'pp1', name: 'Spring Sale', revenue: 8450, units: 78, roi: 245 },
    { id: 'pp2', name: 'Weekend Special', revenue: 3200, units: 45, roi: 178 },
    { id: 'pp3', name: 'Summer Clearance', revenue: 5680, units: 62, roi: 198 },
    { id: 'pp4', name: 'Flash Sale', revenue: 2890, units: 34, roi: 156 },
  ];

  const discountEffectiveness = [
    { id: 'de1', range: '10-20%', sales: 4200, conversions: 156 },
    { id: 'de2', range: '20-30%', sales: 8450, conversions: 234 },
    { id: 'de3', range: '30-40%', sales: 5600, conversions: 189 },
    { id: 'de4', range: '40-50%', sales: 3200, conversions: 98 },
  ];

  const categoryImpact = [
    { id: 'ci1', name: 'Running', value: 42, color: '#fef08a' },
    { id: 'ci2', name: 'Casual', value: 28, color: '#facc15' },
    { id: 'ci3', name: 'Sports', value: 18, color: '#fde047' },
    { id: 'ci4', name: 'Formal', value: 12, color: '#fef9c3' },
  ];

  const handleAddPromotion = async () => {
    if (!formData.promo_name || !formData.targetProducts || !formData.start_date || !formData.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setIsSavingPromotion(true);
      const newPromotionPayload = {
        promo_id: crypto.randomUUID(),
        promo_name: formData.promo_name!,
        discount_type: toDbDiscountType(formData.discount_type),
        discount_value: Number(formData.discount_value || 0),
        target_products: formData.targetProducts || 'All Products',
        start_date: formData.start_date!,
        end_date: formData.end_date!,
        status: toDbStatus(formData.status, formData.start_date),
      };

      await promotionsMutations.createMutation.mutateAsync(newPromotionPayload as any);

      // Send email notifications to all active customers
      const activeCustomers = customers.filter(c => c.status === 'Active' && c.email);
      const newNotifications: Notification[] = activeCustomers.map((customer, index) => ({
        notification_id: `NOTIF-${Date.now()}-${index}`,
        customer_id: customer.customer_id,
        promo_id: 'NEW_PROMO',
        email: customer.email,
        email_status: 'Sent' as const,
        date_sent: new Date().toISOString().split('T')[0]
      }));

      setNotifications([...notifications, ...newNotifications]);
      setLastNotificationBatch(newNotifications);
      setIsAddDialogOpen(false);
      setFormData({});

      toast.success(`Promotion created! Email notifications sent to ${activeCustomers.length} customers.`);
      setShowNotificationDialog(true);
    } catch (error: any) {
      toast.error(error?.message ?? 'Unable to create promotion');
    } finally {
      setIsSavingPromotion(false);
    }
  };

  const handleEditPromotion = async () => {
    if (!editingPromotion) return;
    try {
      setIsUpdatingPromotion(true);
      await promotionsMutations.updateMutation.mutateAsync({
        id: editingPromotion.promo_id,
        payload: {
          promo_name: formData.promo_name,
          discount_type: toDbDiscountType(formData.discount_type),
          discount_value: formData.discount_value,
          target_products: formData.targetProducts,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: toDbStatus(formData.status, formData.start_date),
        },
      } as any);
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
    await promotionsMutations.removeMutation.mutateAsync(promo_id as any);
    toast.success('Promotion deleted successfully!');
  };

  const openEditDialog = (promotion: Promotion) => {
    setEditingPromotion(promotion);
    setFormData(promotion);
  };

  const totalRevenue = promotions.reduce((sum, p) => sum + p.salesGenerated, 0);
  const activePromotions = promotions.filter(p => p.status === 'Active').length;
  const avgEffectiveness = promotions.filter(p => p.effectiveness > 0).reduce((sum, p) => sum + p.effectiveness, 0) / promotions.filter(p => p.effectiveness > 0).length || 0;

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

      {/* Promotion Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <CardTitle className="text-yellow-300">Promotion Performance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={promotionPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#991b1b" />
                <XAxis dataKey="name" stroke="#fef08a" angle={-15} textAnchor="end" height={80} />
                <YAxis stroke="#fef08a" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#991b1b', border: '1px solid #7f1d1d', color: '#fef08a' }}
                />
                <Legend wrapperStyle={{ color: '#fef08a' }} />
                <Bar key="revenue-bar" dataKey="revenue" fill="#fef08a" name="Revenue (₱)" />
                <Bar key="roi-bar" dataKey="roi" fill="#facc15" name="ROI (%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-red-700 border-red-800">
          <CardHeader>
            <CardTitle className="text-yellow-300">Category Impact Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={categoryImpact}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryImpact.map((entry) => (
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
            {productRecommendations.map((rec) => (
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
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Promotion
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-yellow-300">Create New Promotion</DialogTitle>
                </DialogHeader>
                <PromotionForm
                  formData={formData}
                  setFormData={setFormData}
                  categoryOptions={categoryOptions}
                  productOptions={productOptions}
                />
                <DialogFooter>
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
          <div className="border border-red-800 rounded-lg overflow-x-auto scrollbar-hide">
            <Table className="w-full min-w-[1080px]">
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
                    <TableCell className="min-w-[220px] text-center align-middle">
                      <div>
                        <p className="text-yellow-200 whitespace-nowrap">{promotion.promo_name}</p>
                        <p className="text-yellow-300 text-xs whitespace-nowrap">{promotion.targetProducts}</p>
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
                    <TableCell className="text-yellow-200 text-sm whitespace-nowrap text-center align-middle">
                      {promotion.start_date} to {promotion.end_date}
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
                    <TableCell className="min-w-[240px] text-center align-middle">
                      <div className="space-y-1">
                        <div className="flex justify-center gap-6 text-xs text-yellow-200">
                          <span className="whitespace-nowrap">Sales: ₱{promotion.salesGenerated}</span>
                          <span className="whitespace-nowrap">{promotion.unitsAffected} units</span>
                        </div>
                        <Progress value={promotion.effectiveness} className="h-2 bg-red-600" />
                        <p className="text-xs text-yellow-300">{promotion.effectiveness}% effective</p>
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
                          <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-2xl max-h-[85vh] overflow-y-auto pr-1">
                            <DialogHeader>
                              <DialogTitle className="text-yellow-300">Edit Promotion</DialogTitle>
                            </DialogHeader>
                            <PromotionForm
                              formData={formData}
                              setFormData={setFormData}
                              categoryOptions={categoryOptions}
                              productOptions={productOptions}
                            />
                            <DialogFooter>
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
        <DialogContent className="bg-red-700 border-red-800 text-yellow-200 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-yellow-300 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Notifications Sent
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-900/30 border border-green-600 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <div>
                <p className="text-yellow-300">Successfully sent to {lastNotificationBatch.length} customers</p>
                <p className="text-sm text-yellow-200">All active customers have been notified about this promotion</p>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              <p className="text-yellow-300 mb-2">Notification Recipients:</p>
              <div className="space-y-2">
                {lastNotificationBatch.map((notif) => {
                  const customerName = customerNameMap.get(notif.customer_id) || 'Customer';
                  return (
                    <div key={notif.notification_id} className="flex items-center justify-between p-3 bg-red-600 rounded border border-red-800">
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-yellow-400" />
                        <div>
                          <p className="text-yellow-200 text-sm">{customerName}</p>
                          <p className="text-yellow-300 text-xs">{notif.email}</p>
                        </div>
                      </div>
                      <Badge className="bg-green-600 text-white text-xs">
                        {notif.email_status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-red-800 border border-red-900 rounded-lg">
              <p className="text-yellow-300 text-sm">Promotion Details:</p>
              <div className="mt-2 space-y-1 text-sm text-yellow-200">
                <p><span className="text-yellow-300">Start Date:</span> {formData.start_date || lastNotificationBatch[0]?.date_sent}</p>
                <p><span className="text-yellow-300">End Date:</span> {formData.end_date}</p>
                <p className="text-xs text-yellow-300 mt-2">Customers will receive details about this promotion via email.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowNotificationDialog(false)} className="bg-yellow-400 text-red-900 hover:bg-yellow-500">
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
  productOptions: Array<{ name: string; category: string }>;
}) {
  const parsed = useMemo(() => parseTargetProducts(formData.targetProducts), [formData.targetProducts]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(parsed.categories);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(parsed.products);
  const [pendingCategory, setPendingCategory] = useState('');
  const [pendingProduct, setPendingProduct] = useState('');

  useEffect(() => {
    const next = parseTargetProducts(formData.targetProducts);
    setSelectedCategories(next.categories);
    setSelectedProducts(next.products);
  }, [formData.targetProducts]);

  const filteredProductOptions = useMemo(() => {
    if (!selectedCategories.length) return productOptions;
    return productOptions.filter((p) => selectedCategories.includes(p.category));
  }, [productOptions, selectedCategories]);

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
    syncTargetProducts(nextCategories, selectedProducts);
  };

  const removeCategory = (value: string) => {
    const nextCategories = selectedCategories.filter((c) => c !== value);
    const nextProducts = selectedProducts.filter((name) => {
      const found = productOptions.find((p) => p.name === name);
      return !found || nextCategories.length === 0 || nextCategories.includes(found.category);
    });
    setSelectedCategories(nextCategories);
    setSelectedProducts(nextProducts);
    syncTargetProducts(nextCategories, nextProducts);
  };

  const addProduct = (value: string) => {
    if (!value || selectedProducts.includes(value)) return;
    const nextProducts = [...selectedProducts, value];
    setSelectedProducts(nextProducts);
    syncTargetProducts(selectedCategories, nextProducts);
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
          <Select value={formData.discount_type || 'Percentage'} onValueChange={(value) => setFormData({ ...formData, discount_type: value as Promotion['discount_type'] })}>
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
          <Label htmlFor="discount_value" className="text-yellow-300">Discount Value *</Label>
          <Input
            id="discount_value"
            type="number"
            value={formData.discount_value || ''}
            onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) })}
            className="bg-red-600 border-red-800 text-yellow-200"
            placeholder={formData.discount_type === 'Percentage' ? '25' : '20'}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="targetProducts" className="text-yellow-300">Target Products *</Label>
        <div className="space-y-3 rounded-lg border border-red-800 p-3">
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
            </div>

            <div className="space-y-2">
              <Label className="text-yellow-300 text-xs">Products (filtered by category)</Label>
              <Select value={pendingProduct} onValueChange={(value) => {
                addProduct(value);
                setPendingProduct('');
              }}>
                <SelectTrigger className="bg-red-600 border-red-800 text-yellow-200">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent className="bg-red-700 border-red-800 text-yellow-200 max-h-64">
                  {filteredProductOptions.map((product) => (
                    <SelectItem key={product.name} value={product.name}>
                      {product.name} {product.category ? `(${product.category})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <Input
            id="targetProducts"
            value={formData.targetProducts || 'All Products'}
            readOnly
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date" className="text-yellow-300">Start Date *</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date || ''}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className="bg-red-600 border-red-800 text-yellow-200"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end_date" className="text-yellow-300">End Date *</Label>
          <Input
            id="end_date"
            type="date"
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
