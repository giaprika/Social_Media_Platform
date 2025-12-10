import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    UsersIcon,
    PhotoIcon,
    GlobeAltIcon,
    LockClosedIcon,
    CheckIcon,
} from '@heroicons/react/24/outline'
import * as communityApi from 'src/api/community'

const CATEGORIES = [
    'Technology',
    'Gaming',
    'Art',
    'Music',
    'Sports',
    'Education',
    'Business',
    'Entertainment',
    'Lifestyle',
    'Other',
]

const VISIBILITY_OPTIONS = [
    {
        value: 'public',
        label: 'Công khai',
        description: 'Ai cũng có thể tìm và xem nội dung',
        icon: GlobeAltIcon,
    },
    {
        value: 'private',
        label: 'Riêng tư',
        description: 'Chỉ thành viên mới xem được nội dung',
        icon: LockClosedIcon,
    },
]

const JOIN_TYPE_OPTIONS = [
    {
        value: 'open',
        label: 'Mở',
        description: 'Ai cũng có thể tham gia ngay',
    },
    {
        value: 'approval',
        label: 'Cần duyệt',
        description: 'Quản trị viên cần phê duyệt',
    },
    {
        value: 'invite_only',
        label: 'Chỉ mời',
        description: 'Chỉ có thể tham gia qua lời mời',
    },
]

export default function CommunityCreate() {
    const navigate = useNavigate()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState(null)

    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        description: '',
        category: '',
        visibility: 'public',
        join_type: 'open',
        avatar_url: '',
        banner_url: '',
    })

    // Auto-generate slug from name
    const handleNameChange = (e) => {
        const name = e.target.value
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim()

        setFormData((prev) => ({
            ...prev,
            name,
            slug,
        }))
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        try {
            // Validate
            if (!formData.name.trim()) {
                throw new Error('Vui lòng nhập tên cộng đồng')
            }
            if (!formData.slug.trim()) {
                throw new Error('Vui lòng nhập slug')
            }

            const result = await communityApi.createCommunity({
                ...formData,
                name: formData.name.trim(),
                slug: formData.slug.trim(),
                description: formData.description.trim(),
            })

            // Navigate to the new community
            navigate(`/c/${result.slug}`)
        } catch (err) {
            setError(err.message || 'Không thể tạo cộng đồng')
            console.error('Failed to create community:', err)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-background py-8">
            <div className="max-w-2xl mx-auto px-4">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <UsersIcon className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">
                        Tạo cộng đồng mới
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Xây dựng không gian cho cộng đồng của bạn
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Error */}
                    {error && (
                        <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm">
                            {error}
                        </div>
                    )}

                    {/* Name */}
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Tên cộng đồng *
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleNameChange}
                            placeholder="VD: Programming Vietnam"
                            className="w-full px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            maxLength={100}
                        />

                        <label className="block text-sm font-medium text-foreground mb-2 mt-4">
                            Slug (URL) *
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">/c/</span>
                            <input
                                type="text"
                                name="slug"
                                value={formData.slug}
                                onChange={handleChange}
                                placeholder="programming-vn"
                                className="flex-1 px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                maxLength={50}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Chỉ chứa chữ thường, số và dấu gạch ngang
                        </p>
                    </div>

                    {/* Description */}
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Mô tả
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Giới thiệu về cộng đồng của bạn..."
                            rows={4}
                            className="w-full px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                            maxLength={500}
                        />
                        <p className="text-xs text-muted-foreground mt-1 text-right">
                            {formData.description.length}/500
                        </p>
                    </div>

                    {/* Category */}
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <label className="block text-sm font-medium text-foreground mb-3">
                            Danh mục
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() =>
                                        setFormData((prev) => ({ ...prev, category: cat }))
                                    }
                                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${formData.category === cat
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Visibility */}
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <label className="block text-sm font-medium text-foreground mb-3">
                            Hiển thị
                        </label>
                        <div className="space-y-3">
                            {VISIBILITY_OPTIONS.map((option) => {
                                const Icon = option.icon
                                return (
                                    <label
                                        key={option.value}
                                        className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${formData.visibility === option.value
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:bg-muted/50'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="visibility"
                                            value={option.value}
                                            checked={formData.visibility === option.value}
                                            onChange={handleChange}
                                            className="sr-only"
                                        />
                                        <div
                                            className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${formData.visibility === option.value
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'bg-muted text-muted-foreground'
                                                }`}
                                        >
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium text-foreground">
                                                {option.label}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {option.description}
                                            </p>
                                        </div>
                                        {formData.visibility === option.value && (
                                            <CheckIcon className="h-5 w-5 text-primary flex-shrink-0" />
                                        )}
                                    </label>
                                )
                            })}
                        </div>
                    </div>

                    {/* Join Type */}
                    <div className="rounded-2xl border border-border bg-card p-6">
                        <label className="block text-sm font-medium text-foreground mb-3">
                            Cách tham gia
                        </label>
                        <div className="space-y-3">
                            {JOIN_TYPE_OPTIONS.map((option) => (
                                <label
                                    key={option.value}
                                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${formData.join_type === option.value
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:bg-muted/50'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="join_type"
                                        value={option.value}
                                        checked={formData.join_type === option.value}
                                        onChange={handleChange}
                                        className="sr-only"
                                    />
                                    <div className="flex-1">
                                        <p className="font-medium text-foreground">{option.label}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {option.description}
                                        </p>
                                    </div>
                                    {formData.join_type === option.value && (
                                        <CheckIcon className="h-5 w-5 text-primary flex-shrink-0" />
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Submit */}
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => navigate('/app/communities')}
                            className="flex-1 px-4 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !formData.name || !formData.slug}
                            className="flex-1 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                            {isSubmitting ? 'Đang tạo...' : 'Tạo cộng đồng'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
