'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Plus, Trash2, Package, Tag, Info, Image as ImageIcon, Layers, Upload, Eye, EyeOff } from 'lucide-react'
import api from '@/lib/api'
import { Card } from '@/components/ui/card'
import React from 'react'

// ────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────
export interface Variant {
  id?: number
  sku?: string
  size?: string
  selling_price: number
  cost_price?: number
  stock?: number          // Lecture seule depuis le backend
  initial_stock?: number  // Write-only pour la création
  is_active: boolean
}

// Image de la galerie — état local du composant
interface GalleryImage {
  id?: number
  tempId?: string             // ID temporaire pour suivre les uploads en cours
  image_url: string           // URL Cloudinary (ou blob:// avant upload)
  cloudinary_public_id: string
  order: number
  uploading?: boolean         // true pendant l'upload vers Cloudinary
  error?: string              // message d'erreur si l'upload échoue
}

export interface Product {
  id?: number
  name: string
  code_produit?: string
  description?: string
  image_url?: string
  image?: File | null
  category?: { id: number; name: string } | number
  total_stock?: number
  variants: Variant[]
  // Champs pour la vitrine web
  brand?: string
  badge?: string
  icon?: string
  fabric?: string
  is_published?: boolean
  colors?: string[]           // Tableau de codes hex ex: ["#FF0000", "#000000"]
  product_images?: Array<{ id: number; image_url: string; cloudinary_public_id: string; order: number }>
}

// Choix disponibles pour le badge (miroir du modèle Django)
const BADGE_CHOICES = [
  { value: '',           label: 'Aucun badge' },
  { value: 'NEW',        label: '✨ Nouveau' },
  { value: 'BESTSELLER', label: '🔥 Best-Seller' },
  { value: 'HOT',        label: '⚡ Tendance' },
  { value: 'SET',        label: '👗 Ensemble' },
  { value: 'CLASSIC',    label: '⭐ Classique' },
]

// Palette de couleurs rapides pour les vêtements
const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#F5F5DC', '#808080', '#C0C0C0',
  '#FF0000', '#FF69B4', '#FF1493', '#800080', '#4B0082',
  '#0000FF', '#1E90FF', '#00BFFF', '#008080', '#228B22',
  '#90EE90', '#8B4513', '#D2691E', '#FFA500', '#FFD700',
]

interface AddEditProductModalProps {
  isOpen: boolean
  onClose: () => void
  productToEdit?: Product | null
  onSuccess?: () => void
}

// ────────────────────────────────────────────────
// API Functions
// ────────────────────────────────────────────────
const fetchCategories = async () => {
  const res = await api.get('/categories/')
  return res.data.results || res.data
}

export default function AddEditProductModal({
  isOpen,
  onClose,
  productToEdit,
  onSuccess,
}: AddEditProductModalProps) {
  const queryClient = useQueryClient()
  const isEditMode = !!productToEdit
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ────────────────────────────────────────────────
  // Form State
  // ────────────────────────────────────────────────
  const [formData, setFormData] = useState<Product>({
    name: '',
    code_produit: '',
    description: '',
    image_url: '',
    image: null,
    category: undefined,
    variants: [],
    brand: '',
    badge: '',
    icon: '👕',
    fabric: '',
    is_published: true,
    colors: [],
  })

  // Galerie d'images du produit (multi-images)
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([])

  // Valeur courante du sélecteur de couleur hex
  const [colorInput, setColorInput] = useState('#000000')

  useEffect(() => {
    if (productToEdit) {
      setFormData({
        ...productToEdit,
        category:
          productToEdit.category && typeof productToEdit.category === 'object'
            ? productToEdit.category.id
            : productToEdit.category,
        variants: (productToEdit.variants || []).map((v) => ({
          ...v,
          initial_stock: (v.stock as number) || 0,
        })),
        brand:        productToEdit.brand        || '',
        badge:        productToEdit.badge        || '',
        icon:         productToEdit.icon         || '👕',
        fabric:       productToEdit.fabric       || '',
        is_published: productToEdit.is_published !== undefined ? productToEdit.is_published : true,
        colors:       productToEdit.colors       || [],
      })
      // Pré-remplir la galerie depuis les images existantes du produit
      setGalleryImages(
        (productToEdit.product_images || []).map((img, idx) => ({
          id:                   img.id,
          image_url:            img.image_url,
          cloudinary_public_id: img.cloudinary_public_id || '',
          order:                img.order ?? idx,
        }))
      )
    } else {
      setFormData({
        name:         '',
        code_produit: '',
        description:  '',
        image_url:    '',
        image:        null,
        category:     undefined,
        variants:     [{ selling_price: 0, is_active: true, initial_stock: 0 }],
        brand:        '',
        badge:        '',
        icon:         '👕',
        fabric:       '',
        is_published: true,
        colors:       [],
      })
      setGalleryImages([])
    }
  }, [productToEdit, isOpen])

  // ────────────────────────────────────────────────
  // Queries & Mutations
  // ────────────────────────────────────────────────
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    enabled: isOpen,
  })

  // Upload d'une image vers Cloudinary via le backend Django
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const payload = new FormData()
      payload.append('image', file)
      const res = await api.post('/products/upload-image/', payload)
      return res.data as { url: string; public_id: string }
    },
  })

  // Sauvegarde du produit (création ou mise à jour)
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const formPayload = new FormData()

      // Champs texte simples
      formPayload.append('name', data.name)
      if (data.code_produit)        formPayload.append('code_produit', data.code_produit)
      if (data.description)         formPayload.append('description', data.description)
      if (data.image_url)           formPayload.append('image_url', data.image_url)
      if (data.category)            formPayload.append('category_id', String(data.category))
      if (data.brand)               formPayload.append('brand', data.brand)
      if (data.badge !== undefined)  formPayload.append('badge', data.badge)
      if (data.icon)                formPayload.append('icon', data.icon)
      if (data.fabric)              formPayload.append('fabric', data.fabric)
      formPayload.append('is_published', String(data.is_published ?? true))

      // Champs JSON stringifiés (parsés par _build_multipart_data côté Django)
      formPayload.append('colors',   JSON.stringify(data.colors || []))
      formPayload.append('variants', JSON.stringify(data.variants || []))

      // Galerie d'images : uniquement les images complètement uploadées
      const imagesData = galleryImages
        .filter((img) => img.image_url && !img.uploading && !img.error)
        .map((img, idx) => ({
          image_url:            img.image_url,
          cloudinary_public_id: img.cloudinary_public_id,
          order:                idx,
        }))
      formPayload.append('product_images_data', JSON.stringify(imagesData))

      // Image legacy (si un fichier local est sélectionné)
      if (data.image instanceof File) {
        formPayload.append('image', data.image)
      }

      if (isEditMode && productToEdit?.id) {
        return api.patch(`/products/${productToEdit.id}/`, formPayload)
      }
      return api.post('/products/', formPayload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      if (onSuccess) onSuccess()
      onClose()
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.detail ||
        JSON.stringify(err.response?.data) ||
        "Erreur lors de l'enregistrement"
      alert('Erreur: ' + msg)
    },
  })

  // ────────────────────────────────────────────────
  // Handlers — Formulaire
  // ────────────────────────────────────────────────
  const handleProductChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as HTMLInputElement
    if (type === 'file') {
      const file = (e.target as HTMLInputElement).files?.[0] || null
      setFormData((prev) => ({ ...prev, image: file }))
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: name === 'category' ? (value ? Number(value) : undefined) : value,
      }))
    }
  }

  // ────────────────────────────────────────────────
  // Handlers — Galerie d'images
  // ────────────────────────────────────────────────

  // Sélection de fichiers → upload immédiat vers Cloudinary avec preview blob
  const handleGalleryFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Créer des placeholders avec une URL locale pour la preview immédiate
    const placeholders: GalleryImage[] = files.map((file, idx) => ({
      tempId:               `temp_${Date.now()}_${idx}`,
      image_url:            URL.createObjectURL(file),
      cloudinary_public_id: '',
      order:                0,
      uploading:            true,
    }))

    // Ajouter les placeholders à la galerie en recalculant les ordres
    setGalleryImages((prev) => {
      const combined = [...prev, ...placeholders]
      return combined.map((img, i) => ({ ...img, order: i }))
    })

    // Uploader chaque fichier vers Cloudinary séquentiellement
    for (let i = 0; i < files.length; i++) {
      const tempId = placeholders[i].tempId!
      try {
        const result = await uploadImageMutation.mutateAsync(files[i])
        // Libérer l'URL blob et remplacer par l'URL Cloudinary
        setGalleryImages((prev) => {
          const idx = prev.findIndex((img) => img.tempId === tempId)
          if (idx === -1) return prev
          URL.revokeObjectURL(prev[idx].image_url)
          const updated = [...prev]
          updated[idx] = {
            image_url:            result.url,
            cloudinary_public_id: result.public_id,
            order:                updated[idx].order,
            uploading:            false,
          }
          return updated
        })
      } catch {
        setGalleryImages((prev) => {
          const idx = prev.findIndex((img) => img.tempId === tempId)
          if (idx === -1) return prev
          const updated = [...prev]
          updated[idx] = { ...updated[idx], uploading: false, error: 'Échec upload' }
          return updated
        })
      }
    }

    // Réinitialiser l'input pour permettre de re-sélectionner les mêmes fichiers
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Supprimer une image de la galerie (et de Cloudinary si uploadée)
  const removeGalleryImage = async (index: number) => {
    const img = galleryImages[index]

    // Libérer la mémoire blob si l'image est encore locale
    if (img.uploading && img.image_url.startsWith('blob:')) {
      URL.revokeObjectURL(img.image_url)
    }

    // Supprimer de Cloudinary si l'image est bien uploadée
    if (!img.uploading && img.cloudinary_public_id) {
      try {
        await api.delete('/products/delete-image/', {
          data: { public_id: img.cloudinary_public_id },
        })
      } catch {
        // On retire de l'UI même si Cloudinary échoue (nettoyage différé possible)
      }
    }

    setGalleryImages((prev) =>
      prev.filter((_, i) => i !== index).map((img, i) => ({ ...img, order: i }))
    )
  }

  // Déplacer une image vers la gauche ou droite dans la galerie
  const moveGalleryImage = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= galleryImages.length) return
    const updated = [...galleryImages]
    ;[updated[index], updated[targetIdx]] = [updated[targetIdx], updated[index]]
    setGalleryImages(updated.map((img, i) => ({ ...img, order: i })))
  }

  // ────────────────────────────────────────────────
  // Handlers — Couleurs
  // ────────────────────────────────────────────────
  const addColor = (hex: string) => {
    const normalized = hex.toUpperCase()
    if (!normalized.match(/^#[0-9A-F]{6}$/)) return
    if ((formData.colors || []).includes(normalized)) return
    setFormData((prev) => ({ ...prev, colors: [...(prev.colors || []), normalized] }))
  }

  const removeColor = (hex: string) => {
    setFormData((prev) => ({
      ...prev,
      colors: (prev.colors || []).filter((c) => c !== hex),
    }))
  }

  // ────────────────────────────────────────────────
  // Handlers — Variantes
  // ────────────────────────────────────────────────
  const handleVariantChange = (index: number, field: keyof Variant, value: any) => {
    const newVariants = [...formData.variants]
    newVariants[index] = { ...newVariants[index], [field]: value }
    setFormData((prev) => ({ ...prev, variants: newVariants }))
  }

  const addVariant = () => {
    setFormData((prev) => ({
      ...prev,
      variants: [...prev.variants, { selling_price: 0, is_active: true, initial_stock: 0 }],
    }))
  }

  const removeVariant = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }))
  }

  // ────────────────────────────────────────────────
  // Soumission
  // ────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.category) {
      alert('Veuillez sélectionner une catégorie')
      return
    }
    if (galleryImages.some((img) => img.uploading)) {
      alert('Veuillez attendre la fin des uploads en cours.')
      return
    }
    mutation.mutate(formData)
  }

  if (!isOpen) return null

  const isUploading = galleryImages.some((img) => img.uploading)

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-4xl bg-card shadow-2xl border-border flex flex-col max-h-[95vh]">

        {/* ── En-tête ─────────────────────────────────────────────────────── */}
        <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {isEditMode ? 'Modifier le produit' : 'Nouveau produit'}
              </h2>
              <p className="text-xs text-muted-foreground">Remplissez les informations détaillées</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8">

            {/* ── Section 1 : Informations Générales ──────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-widest uppercase">
                <Info className="w-4 h-4" />
                Informations Générales
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Nom */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Nom du produit *</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleProductChange}
                    required
                    placeholder="ex: T-Shirt Essential"
                    className="h-11"
                  />
                </div>

                {/* Code produit */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Code produit (SKU Maître)</label>
                  <Input
                    name="code_produit"
                    value={formData.code_produit || ''}
                    onChange={handleProductChange}
                    placeholder="Auto-généré"
                    disabled
                    className="h-11 bg-muted/50 cursor-not-allowed"
                  />
                </div>

                {/* Catégorie */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Catégorie *</label>
                  <select
                    name="category"
                    value={(formData.category as number) || ''}
                    onChange={handleProductChange}
                    className="w-full h-11 px-3 py-2 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                    required
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {Array.isArray(categories) &&
                      categories.map((cat: any) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Marque */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Marque</label>
                  <Input
                    name="brand"
                    value={formData.brand || ''}
                    onChange={handleProductChange}
                    placeholder="ex: Nike, Adidas, SoftCosy..."
                    className="h-11"
                  />
                </div>

                {/* Badge */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Badge</label>
                  <select
                    name="badge"
                    value={formData.badge || ''}
                    onChange={handleProductChange}
                    className="w-full h-11 px-3 py-2 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                  >
                    {BADGE_CHOICES.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Icône */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Icône (emoji)</label>
                  <Input
                    name="icon"
                    value={formData.icon || '👕'}
                    onChange={handleProductChange}
                    placeholder="👕"
                    className="h-11 text-2xl"
                  />
                </div>

                {/* Stock (affiché seulement si variante unique) */}
                {formData.variants.length <= 1 && (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold flex items-center gap-2">
                      <Layers className="w-4 h-4 text-muted-foreground" />
                      Stock du produit
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.variants[0]?.initial_stock ?? 0}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value))
                        setFormData((prev) => ({
                          ...prev,
                          variants:
                            prev.variants.length > 0
                              ? prev.variants.map((v, i) =>
                                  i === 0 ? { ...v, initial_stock: val } : v
                                )
                              : [{ selling_price: 0, is_active: true, initial_stock: val }],
                        }))
                      }}
                      placeholder="0"
                      className="h-11"
                    />
                    {!isEditMode && (
                      <p className="text-xs text-muted-foreground">
                        Si vous ajoutez plusieurs variantes, définissez le stock dans la section Variantes.
                      </p>
                    )}
                  </div>
                )}

                {/* Visibilité sur le site */}
                <div className="space-y-2 flex flex-col justify-end">
                  <label className="text-sm font-semibold">Visibilité sur le site</label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, is_published: !prev.is_published }))
                    }
                    className={`flex items-center gap-3 h-11 px-4 rounded-md border transition-all ${
                      formData.is_published
                        ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                        : 'border-border bg-muted/30 text-muted-foreground'
                    }`}
                  >
                    {formData.is_published ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">
                      {formData.is_published
                        ? 'Publié — visible sur le site'
                        : 'Non publié — masqué du site'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Matière */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">Matière / Composition</label>
                <Input
                  name="fabric"
                  value={formData.fabric || ''}
                  onChange={handleProductChange}
                  placeholder="ex: 100% Coton bio, 80% Polyester 20% Élasthane..."
                  className="h-11"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">Description</label>
                <textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={handleProductChange}
                  className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm focus:ring-2 focus:ring-primary outline-none"
                  placeholder="Décrivez votre produit..."
                />
              </div>
            </div>

            {/* ── Section 2 : Couleurs ─────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-widest uppercase">
                <span>🎨</span>
                Couleurs disponibles
              </div>

              {/* Couleurs sélectionnées */}
              {(formData.colors || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(formData.colors || []).map((hex) => (
                    <div
                      key={hex}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background"
                    >
                      <div
                        className="w-4 h-4 rounded-full border border-border/50 flex-shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="text-xs font-mono">{hex}</span>
                      <button
                        type="button"
                        onClick={() => removeColor(hex)}
                        className="ml-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Palette rapide */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Couleurs rapides :</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => addColor(hex)}
                      title={hex}
                      className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        (formData.colors || []).includes(hex)
                          ? 'border-primary scale-110 shadow-md'
                          : 'border-border'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Sélecteur de couleur libre */}
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  className="w-11 h-11 rounded-md border border-input cursor-pointer p-0.5 bg-background"
                />
                <Input
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  placeholder="#FF0000"
                  className="h-11 font-mono w-32"
                  maxLength={7}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addColor(colorInput)}
                  className="h-11"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter
                </Button>
              </div>
            </div>

            {/* ── Section 3 : Galerie d'images ─────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-widest uppercase">
                  <ImageIcon className="w-4 h-4" />
                  Galerie d&apos;images ({galleryImages.filter((img) => !img.uploading).length})
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-primary text-primary hover:bg-primary/10"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Upload className="w-4 h-4" />
                  {isUploading ? 'Upload en cours...' : 'Ajouter des images'}
                </Button>
                {/* Input file caché — multiple */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleGalleryFilesChange}
                />
              </div>

              {/* Zone vide */}
              {galleryImages.length === 0 ? (
                <div
                  className="p-10 border border-dashed rounded-xl text-center text-muted-foreground bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">Cliquez pour ajouter des images</p>
                  <p className="text-xs mt-1">La première image sera l&apos;image principale du produit</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {galleryImages.map((img, index) => (
                    <div
                      key={img.tempId || img.id || index}
                      className="relative group rounded-xl overflow-hidden border border-border bg-muted/20 aspect-square"
                    >
                      {/* Miniature */}
                      <img
                        src={img.image_url}
                        alt={`Image ${index + 1}`}
                        className={`w-full h-full object-cover transition-opacity ${
                          img.uploading ? 'opacity-40' : 'opacity-100'
                        }`}
                      />

                      {/* Spinner pendant l'upload */}
                      {img.uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                          <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}

                      {/* Indicateur d'erreur */}
                      {img.error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-destructive/30">
                          <span className="text-[10px] text-white font-bold text-center px-2 bg-destructive/80 rounded py-1">
                            {img.error}
                          </span>
                        </div>
                      )}

                      {/* Badge "Principal" sur la première image */}
                      {index === 0 && !img.uploading && (
                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
                          Principal
                        </div>
                      )}

                      {/* Contrôles (hover) */}
                      {!img.uploading && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => moveGalleryImage(index, 'left')}
                            disabled={index === 0}
                            title="Déplacer à gauche"
                            className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            title="Supprimer"
                            className="w-7 h-7 rounded-full bg-destructive/80 hover:bg-destructive flex items-center justify-center text-white"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveGalleryImage(index, 'right')}
                            disabled={index === galleryImages.length - 1}
                            title="Déplacer à droite"
                            className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            →
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Survolez une image pour la déplacer ou la supprimer. La première image est l&apos;image principale affichée sur le site.
              </p>
            </div>

            {/* ── Section 4 : Variantes ────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-widest uppercase">
                  <Tag className="w-4 h-4" />
                  Variantes de Produit
                </div>
                <Button
                  type="button"
                  onClick={addVariant}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-primary text-primary hover:bg-primary/10"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une variante
                </Button>
              </div>

              <div className="space-y-3">
                {formData.variants.length === 0 && (
                  <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground bg-muted/20">
                    Aucune variante définie. Un produit doit avoir au moins une variante pour être vendu.
                  </div>
                )}

                {formData.variants.map((variant, index) => (
                  <div
                    key={index}
                    className="group relative p-4 rounded-xl border border-border bg-background hover:border-primary/30 transition-all shadow-sm"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">SKU</label>
                        <Input
                          value={variant.sku || ''}
                          onChange={(e) => handleVariantChange(index, 'sku', e.target.value)}
                          placeholder="Auto-généré"
                          disabled
                          className="h-9 text-xs bg-muted/50 cursor-not-allowed"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">
                          Taille / Couleur
                        </label>
                        <Input
                          value={variant.size || ''}
                          onChange={(e) => handleVariantChange(index, 'size', e.target.value)}
                          placeholder="M / 42 / Rouge"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">
                          Prix Vente (FCFA) *
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          value={variant.selling_price}
                          onChange={(e) =>
                            handleVariantChange(index, 'selling_price', Number(e.target.value))
                          }
                          required
                          className="h-9 text-xs font-bold"
                        />
                      </div>
                      {/* Stock par variante (affiché seulement si plusieurs variantes) */}
                      {formData.variants.length > 1 && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase">
                            Stock
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={variant.initial_stock ?? 0}
                            onChange={(e) =>
                              handleVariantChange(
                                index,
                                'initial_stock',
                                Math.max(0, Number(e.target.value))
                              )
                            }
                            className="h-9 text-xs font-bold"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeVariant(index)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Pied de page sticky ──────────────────────────────────────────── */}
          <div className="p-6 border-t border-border flex gap-3 sticky bottom-0 bg-card z-10">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1 h-12 text-base"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || isUploading}
              className="flex-1 h-12 text-base font-bold shadow-lg shadow-primary/20"
            >
              {isUploading
                ? 'Upload en cours...'
                : mutation.isPending
                ? 'Enregistrement...'
                : isEditMode
                ? 'Mettre à jour'
                : 'Créer le produit'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
