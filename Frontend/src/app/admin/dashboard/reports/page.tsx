'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2, BarChart3, TrendingUp, PieChart as PieChartIcon, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { fetchAllPages } from '@/lib/api'
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts'

export default function ReportsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState('reports')
  const [period, setPeriod] = useState('week')
  const [activeTab, setActiveTab] = useState('revenues')
  const router = useRouter()

  // 1. Récupération des données réelles depuis le Backend Django
  // fetchAllPages : indispensable au-delà de 20 ventes (taille de page par
  // défaut) sinon les périodes larges (trimestre, année) sous-comptent
  // silencieusement en ne regardant que les 20 ventes les plus récentes.
  const { data: rawSales, isLoading: isLoadingSales, isError: isErrorSales } = useQuery({
    queryKey: ['sales-all'],
    queryFn: () => fetchAllPages('/sales/'),
  })

  const { data: saleLines, isLoading: isLoadingLines, isError: isErrorLines } = useQuery({
    queryKey: ['sale-lines-all'],
    queryFn: () => fetchAllPages('/sale-lines/'),
  })

  // 2. Logique d'agrégation et de filtrage dynamique
  const stats = useMemo(() => {
    if (!rawSales || !saleLines) return null

    const now = new Date()
    let startDate = new Date()

    if (period === 'week') startDate.setDate(now.getDate() - 7)
    else if (period === 'month') startDate.setMonth(now.getMonth() - 1)
    else if (period === 'quarter') startDate.setMonth(now.getMonth() - 3)
    else if (period === 'year') startDate.setFullYear(now.getFullYear() - 1)

    // Filtrer les ventes selon la période sélectionnée
    const filteredSales = rawSales.filter((s: any) => new Date(s.sold_at || s.created_at) >= startDate)
    
    // Calcul des indicateurs clés (KPIs)
    const totalRevenue = filteredSales.reduce((sum: number, s: any) => sum + (parseFloat(s.total) || 0), 0)
    const totalOrders = filteredSales.length
    const averageBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0

    // Construction des données du graphique d'évolution du CA
    const revenueByDate: Record<string, number> = {}
    filteredSales.forEach((s: any) => {
      const dateKey = new Date(s.sold_at || s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + (parseFloat(s.total) || 0)
    })
    const chartData = Object.entries(revenueByDate).map(([date, value]) => ({ date, value }))

    // Analyse du Top 5 Produits (via les lignes de vente)
    const productCounts: Record<string, { name: string, sales: number }> = {}
    saleLines.forEach((line: any) => {
      const sale = rawSales.find((s: any) => s.id === line.sale)
      if (sale && new Date(sale.sold_at || sale.created_at) >= startDate) {
        const prodName = line.product_detail?.name || `Produit #${line.product}`
        if (!productCounts[prodName]) productCounts[prodName] = { name: prodName, sales: 0 }
        productCounts[prodName].sales += line.quantity
      }
    })
    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)

    // Analyse de la répartition par catégorie
    const categoryCounts: Record<string, number> = {}
    saleLines.forEach((line: any) => {
      const sale = rawSales.find((s: any) => s.id === line.sale)
      if (sale && new Date(sale.sold_at || sale.created_at) >= startDate) {
        const catName = line.product_detail?.category?.name || 'Inconnu'
        categoryCounts[catName] = (categoryCounts[catName] || 0) + (parseFloat(line.line_total) || 0)
      }
    })
    const totalCatRevenue = Object.values(categoryCounts).reduce((a, b) => a + b, 0)
    const categoryData = Object.entries(categoryCounts).map(([name, value]) => ({
      name,
      value: Math.round((value / (totalCatRevenue || 1)) * 100),
      abs: value
    }))

    return { totalRevenue, totalOrders, averageBasket, chartData, topProducts, categoryData }
  }, [rawSales, saleLines, period])

  const colors = ['#4f46e5', '#f97316', '#06b6d4', '#8b5cf6', '#ec4899']

  // Fonction d'exportation PDF simple basée sur l'impression navigateur
  const handleExportPDF = () => {
    if (!stats) return
    const printWindow = window.open('', '', 'width=800,height=600')
    if (!printWindow) return

    const content = `
      <html>
        <head>
          <title>Rapport SoftCosy - ${period}</title>
          <style>
            body { font-family: sans-serif; margin: 40px; color: #1f2937; }
            h1 { color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 30px; }
            .grid { display: grid; grid-template-cols: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
            .card { padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px; background: #f9fafb; }
            .label { font-size: 14px; text-transform: uppercase; color: #6b7280; font-weight: 600; margin-bottom: 8px; }
            .value { font-size: 28px; font-weight: 800; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: left; background: #4f46e5; color: white; padding: 12px 16px; font-size: 14px; }
            td { border-bottom: 1px solid #f3f4f6; padding: 12px 16px; font-size: 14px; }
            .footer { margin-top: 60px; font-size: 12px; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Rapport d'Activité SoftCosy</h1>
          <p>Période : ${period === 'week' ? 'Derniers 7 jours' : period === 'month' ? 'Dernier mois' : period === 'quarter' ? 'Dernier trimestre' : 'Dernière année'}</p>
          
          <div class="grid">
            <div class="card">
              <div class="label">Chiffre d'Affaires</div>
              <div class="value">${stats.totalRevenue.toLocaleString()} FCFA</div>
            </div>
            <div class="card">
              <div class="label">Commandes</div>
              <div class="value">${stats.totalOrders}</div>
            </div>
            <div class="card">
              <div class="label">Panier Moyen</div>
              <div class="value">${Math.round(stats.averageBasket).toLocaleString()} FCFA</div>
            </div>
          </div>

          <h3>Top 5 Produits Vendus</h3>
          <table>
            <thead><tr><th>Produit</th><th>Quantité</th></tr></thead>
            <tbody>
              ${stats.topProducts.map(p => `<tr><td>${p.name}</td><td>${p.sales}</td></tr>`).join('')}
            </tbody>
          </table>

          <div class="footer">
            Généré le ${new Date().toLocaleString('fr-FR')} • SoftCosy Management System
          </div>
        </body>
      </html>
    `
    printWindow.document.write(content)
    printWindow.document.close()
    printWindow.print()
  }

  // On ne bloque plus l'affichage complet
  return (
    <div className="flex flex-col h-full text-foreground">
      <main className="flex-1 overflow-auto p-4 md:p-8" id="reports-content">
          <div className="max-w-7xl mx-auto space-y-8 pb-12">

            {(isErrorSales || isErrorLines) && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm font-semibold px-4 py-3">
                Erreur de chargement des données de ventes. Réessaie de rafraîchir la page.
              </div>
            )}

            {/* Barre de Titre et Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
                  <BarChart3 className="w-8 h-8 text-primary" />
                  Rapports
                </h1>
                <p className="text-muted-foreground font-medium mt-1">Analyse détaillée des performances commerciales</p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="h-11 px-4 rounded-xl border-border bg-card text-foreground text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                >
                  <option value="week">7 derniers jours</option>
                  <option value="month">30 derniers jours</option>
                  <option value="quarter">Trimestre</option>
                  <option value="year">Année complète</option>
                </select>
                <Button onClick={handleExportPDF} className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                  <Download className="w-4 h-4 mr-2" />
                  Exporter PDF
                </Button>
              </div>
            </div>

            {/* Cartes KPIs Prioritaires */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(isLoadingSales || isLoadingLines) ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="p-6 h-32 bg-card animate-pulse shadow-sm" />
                ))
              ) : (
                <>
                  <Card className="p-6 border-0 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 relative overflow-hidden group hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-primary/10 transition-colors" />
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <TrendingUp className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Chiffre d'Affaires</p>
                    </div>
                    <p className="text-3xl font-black text-foreground">{(stats?.totalRevenue || 0).toLocaleString()} FCFA</p>
                  </Card>

                  <Card className="p-6 border-0 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 relative overflow-hidden group hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-orange-500/10 transition-colors" />
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-orange-500" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Commandes</p>
                    </div>
                    <p className="text-3xl font-black text-foreground">{stats?.totalOrders || 0}</p>
                  </Card>

                  <Card className="p-6 border-0 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 relative overflow-hidden group hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-bl-full -mr-8 -mt-8 group-hover:bg-cyan-500/10 transition-colors" />
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                        <BarChart3 className="w-6 h-6 text-cyan-500" />
                      </div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Panier Moyen</p>
                    </div>
                    <p className="text-3xl font-black text-foreground">{Math.round(stats?.averageBasket || 0).toLocaleString()} FCFA</p>
                  </Card>
                </>
              )}
            </div>

            {/* Navigation par Onglets */}
            <div className="flex gap-1 p-1 bg-white dark:bg-zinc-900 rounded-2xl border border-border/50 max-w-fit shadow-sm">
              <button
                onClick={() => setActiveTab('revenues')}
                className={`py-2.5 px-8 rounded-xl text-sm font-bold transition-all duration-300 ${
                  activeTab === 'revenues'
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Vue Revenues
              </button>
              <button
                onClick={() => setActiveTab('products')}
                className={`py-2.5 px-8 rounded-xl text-sm font-bold transition-all duration-300 ${
                  activeTab === 'products'
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Analyse Produits
              </button>
            </div>

            {/* Graphiques et Visualisations Dynamiques */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {activeTab === 'revenues' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="p-8 border-0 shadow-2xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 rounded-3xl">
                    <div className="mb-8">
                      <h3 className="text-xl font-black flex items-center gap-2 tracking-tight">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        Évolution du Chiffre d'Affaires
                      </h3>
                      <p className="text-sm text-muted-foreground font-medium">Revenus quotidiens cumulés (FCFA)</p>
                    </div>
                    <div className="w-full h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats?.chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} 
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} 
                            tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', fontWeight: 'bold' }}
                            formatter={(value: number | undefined) => [`${(value ?? 0).toLocaleString()} FCFA`, 'Ventes']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#4f46e5" 
                            strokeWidth={5} 
                            dot={{ fill: '#4f46e5', strokeWidth: 3, r: 4, stroke: '#fff' }} 
                            activeDot={{ r: 8, strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-8 border-0 shadow-2xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 rounded-3xl">
                    <div className="mb-8">
                      <h3 className="text-xl font-black flex items-center gap-2 tracking-tight">
                        <PieChartIcon className="w-5 h-5 text-orange-500" />
                        Répartition par Catégorie
                      </h3>
                      <p className="text-sm text-muted-foreground font-medium">Distribution du CA par famille d'articles</p>
                    </div>
                    <div className="w-full h-[350px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats?.categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={120}
                            paddingAngle={8}
                            dataKey="value"
                            label={({ name, value }) => `${name} (${value}%)`}
                          >
                            {stats?.categoryData?.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="transparent" />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number | undefined) => `${value ?? 0}%`} contentStyle={{ borderRadius: '15px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="p-8 border-0 shadow-2xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 rounded-3xl">
                    <div className="mb-8">
                      <h3 className="text-xl font-black flex items-center gap-2 tracking-tight">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        Top 5 Produits (Volume)
                      </h3>
                      <p className="text-sm text-muted-foreground font-medium">Volumes de ventes par article</p>
                    </div>
                    <div className="w-full h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats?.topProducts} layout="vertical" margin={{ left: 20 }}>
                          <XAxis type="number" hide />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            axisLine={false} 
                            tickLine={false} 
                            width={120} 
                            tick={{ fontSize: 11, fontWeight: 800, fill: '#64748b' }} 
                          />
                          <Tooltip cursor={{ fill: '#f8fafc', opacity: 0.5 }} contentStyle={{ borderRadius: '15px' }} />
                          <Bar dataKey="sales" fill="#4f46e5" radius={[0, 10, 10, 0]} barSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-8 border-0 shadow-2xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 rounded-3xl">
                    <div className="mb-6">
                      <h3 className="text-xl font-black tracking-tight">Détails des Meilleures Ventes</h3>
                      <p className="text-sm text-muted-foreground font-medium">Classement précis par quantité vendue</p>
                    </div>
                    <div className="space-y-4">
                      {stats?.topProducts?.map((product: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-4 bg-muted/30 dark:bg-zinc-800/20 rounded-2xl border border-transparent hover:border-primary/20 hover:bg-white dark:hover:bg-zinc-900 transition-all duration-300">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-900 shadow-lg shadow-black/5 flex items-center justify-center font-black text-primary text-lg">
                              #{index + 1}
                            </div>
                            <div>
                                <p className="font-extrabold text-foreground">{product.name}</p>
                                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter">Performance Produit</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-primary">{product.sales}</p>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Unités</p>
                          </div>
                        </div>
                      ))}
                      {(stats?.topProducts?.length ?? 0) === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
                            <p className="font-bold">Aucune vente enregistrée.</p>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>
      </main>
    </div>
  )
}
