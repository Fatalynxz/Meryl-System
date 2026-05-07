import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, Package, Coins, Users, AlertCircle, ArrowUpRight, ArrowDownRight, MoreHorizontal } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, CartesianGrid, BarChart, Bar, Cell } from 'recharts';

export function Dashboard() {
  const stats = [
    { title: 'Total Revenue', value: '₱24,580', change: '+12.5%', icon: Coins, trend: 'up', accent: 'red' },
    { title: 'Products in Stock', value: '1,234', change: '+8 new', icon: Package, trend: 'up', accent: 'yellow' },
    { title: 'Total Customers', value: '892', change: '+43 this month', icon: Users, trend: 'up', accent: 'red' },
    { title: 'Low Stock Items', value: '12', change: 'Needs attention', icon: AlertCircle, trend: 'warning', accent: 'yellow' }
  ];

  const recentSales = [
    { id: 'S001', customer: 'John Doe', product: 'Nike Air Max', amount: '₱120', date: '2026-03-05' },
    { id: 'S002', customer: 'Jane Smith', product: 'Adidas Ultraboost', amount: '₱180', date: '2026-03-05' },
    { id: 'S003', customer: 'Bob Johnson', product: 'Puma Suede', amount: '₱85', date: '2026-03-04' },
    { id: 'S004', customer: 'Alice Brown', product: 'Converse Chuck Taylor', amount: '₱65', date: '2026-03-04' },
    { id: 'S005', customer: 'Charlie Davis', product: 'New Balance 574', amount: '₱95', date: '2026-03-03' }
  ];

  const topProducts = [
    { name: 'Nike Air Max', sold: 45, revenue: '₱5,400' },
    { name: 'Adidas Ultraboost', sold: 38, revenue: '₱6,840' },
    { name: 'Puma Suede', sold: 32, revenue: '₱2,720' },
    { name: 'Vans Old Skool', sold: 28, revenue: '₱1,960' },
    { name: 'Converse Chuck Taylor', sold: 25, revenue: '₱1,625' }
  ];

  const revenueData = [
    { day: 'Mon', value: 1200 },
    { day: 'Tue', value: 2100 },
    { day: 'Wed', value: 1800 },
    { day: 'Thu', value: 2900 },
    { day: 'Fri', value: 3400 },
    { day: 'Sat', value: 4100 },
    { day: 'Sun', value: 3800 },
  ];

  const categoryData = [
    { name: 'Sneakers', value: 42 },
    { name: 'Boots', value: 28 },
    { name: 'Sandals', value: 18 },
    { name: 'Formal', value: 12 },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Card */}
      <div className="relative rounded-3xl overflow-hidden p-8 bg-[#16161C] border border-white/5">
        <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full bg-[#FFD60A]/15 blur-3xl" />
        <div className="absolute right-20 bottom-0 w-40 h-40 rounded-full bg-[#E5202A]/10 blur-2xl" />
        <div className="relative grid md:grid-cols-3 gap-6 items-center">
          <div className="md:col-span-2">
            <div className="text-[11px] uppercase tracking-widest text-[#FFD60A]">Total Balance</div>
            <div className="mt-2 text-white text-4xl tracking-tight">₱248,592.40</div>
            <div className="flex items-center gap-2 mt-3 text-sm text-white/60">
              <span className="inline-flex items-center gap-1 bg-[#FFD60A] text-[#1A1A22] px-2 py-0.5 rounded-full text-xs">
                <ArrowUpRight className="w-3 h-3" /> +18.4%
              </span>
              vs last month · all stores combined
            </div>
          </div>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop key="s0" offset="0%" stopColor="#FFD60A" stopOpacity={0.6} />
                    <stop key="s1" offset="100%" stopColor="#FFD60A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="#FFD60A" strokeWidth={2} fill="url(#heroFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const isYellow = stat.accent === 'yellow';
          return (
            <div
              key={index}
              className="group relative rounded-2xl p-5 bg-[#16161C] border border-white/5 hover:border-white/10 transition"
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isYellow ? 'bg-[#FFD60A]/15 text-[#FFD60A]' : 'bg-[#E5202A]/15 text-[#FF6B72]'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <button className="text-white/30 hover:text-white/70">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 text-xs text-white/50">{stat.title}</div>
              <div className="mt-1 text-white text-2xl tracking-tight">{stat.value}</div>
              <div className={`mt-2 inline-flex items-center gap-1 text-xs ${
                stat.trend === 'warning' ? 'text-[#FFD60A]' : 'text-emerald-400'
              }`}>
                {stat.trend === 'warning' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl p-6 bg-[#16161C] border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white">Revenue Overview</h3>
              <p className="text-xs text-white/40 mt-0.5">Last 7 days performance</p>
            </div>
            <div className="flex gap-1 bg-[#0E0E12] rounded-xl p-1 border border-white/5">
              {['Day', 'Week', 'Month'].map((p, i) => (
                <button
                  key={p}
                  className={`px-3 py-1 rounded-lg text-xs ${
                    i === 1 ? 'bg-[#E5202A] text-white' : 'text-white/50 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop key="r0" offset="0%" stopColor="#E5202A" stopOpacity={0.4} />
                    <stop key="r1" offset="100%" stopColor="#E5202A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="day" stroke="#ffffff40" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#0E0E12',
                    border: '1px solid #ffffff20',
                    borderRadius: 12,
                    color: '#fff'
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="#FFD60A" strokeWidth={2.5} fill="url(#revFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl p-6 bg-[#16161C] border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white">Categories</h3>
              <p className="text-xs text-white/40 mt-0.5">Sales mix</p>
            </div>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData}>
                <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {categoryData.map((entry, i) => (
                    <Cell key={entry.name} fill={i % 2 === 0 ? '#E5202A' : '#FFD60A'} />
                  ))}
                </Bar>
                <Tooltip
                  cursor={{ fill: '#ffffff05' }}
                  contentStyle={{ background: '#0E0E12', border: '1px solid #ffffff20', borderRadius: 12, color: '#fff' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {categoryData.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${i % 2 === 0 ? 'bg-[#E5202A]' : 'bg-[#FFD60A]'}`} />
                  <span className="text-white/70">{c.name}</span>
                </div>
                <span className="text-white">{c.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent + Top products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl p-6 bg-[#16161C] border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white">Recent Sales</h3>
            <button className="text-xs text-[#FFD60A] hover:underline">View all</button>
          </div>
          <div className="space-y-1">
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E5202A] to-[#FFD60A] flex items-center justify-center text-xs">
                    {sale.customer.charAt(0)}
                  </div>
                  <div>
                    <p className="text-white text-sm">{sale.customer}</p>
                    <p className="text-white/40 text-xs">{sale.product}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm">{sale.amount}</p>
                  <p className="text-white/40 text-xs">{sale.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-6 bg-[#16161C] border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#FFD60A]" />
              Top Selling Products
            </h3>
            <button className="text-xs text-[#FFD60A] hover:underline">Report</button>
          </div>
          <div className="space-y-1">
            {topProducts.map((product, index) => {
              const max = Math.max(...topProducts.map(p => p.sold));
              const pct = (product.sold / max) * 100;
              return (
                <div key={index} className="py-2.5 border-b border-white/5 last:border-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-white text-sm">{product.name}</p>
                    <p className="text-white text-sm">{product.revenue}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#E5202A] to-[#FFD60A]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-white/40 text-xs w-16 text-right">{product.sold} units</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
