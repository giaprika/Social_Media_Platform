import { useOutletContext } from 'react-router-dom'
import {
    UsersIcon,
    CalendarDaysIcon,
    GlobeAltIcon,
    LockClosedIcon,
} from '@heroicons/react/24/outline'

export default function CommunityAbout() {
    const { community } = useOutletContext()
    const rules = community?.rules || []
    const settings = community?.settings || {}

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A'
        return new Date(dateString).toLocaleDateString('vi-VN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
    }

    return (
        <div className="space-y-6">
            {/* Description */}
            <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                    Giới thiệu
                </h2>
                <p className="text-muted-foreground whitespace-pre-wrap">
                    {community?.description || 'Cộng đồng này chưa có mô tả.'}
                </p>
            </div>

            {/* Stats & Info */}
            <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                    Thông tin
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <UsersIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Thành viên</p>
                            <p className="font-semibold text-foreground">
                                {community?.member_count?.toLocaleString() || 0}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CalendarDaysIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Ngày tạo</p>
                            <p className="font-semibold text-foreground">
                                {formatDate(community?.created_at)}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            {community?.visibility === 'public' ? (
                                <GlobeAltIcon className="h-5 w-5 text-primary" />
                            ) : (
                                <LockClosedIcon className="h-5 w-5 text-primary" />
                            )}
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Loại</p>
                            <p className="font-semibold text-foreground capitalize">
                                {community?.visibility === 'public' ? 'Công khai' : 'Riêng tư'}
                            </p>
                        </div>
                    </div>

                    {community?.category && (
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                                #
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Danh mục</p>
                                <p className="font-semibold text-foreground">
                                    {community.category}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Rules */}
            {rules.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">
                        Quy định cộng đồng
                    </h2>
                    <ol className="space-y-4">
                        {rules.map((rule, index) => (
                            <li
                                key={index}
                                className="flex gap-3 p-3 rounded-xl bg-muted/30"
                            >
                                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                                    {index + 1}
                                </span>
                                <div>
                                    <h3 className="font-medium text-foreground">{rule.title}</h3>
                                    {rule.description && (
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {rule.description}
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Tags */}
            {community?.tags?.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Tags</h2>
                    <div className="flex flex-wrap gap-2">
                        {community.tags.map((tag, index) => (
                            <span
                                key={index}
                                className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm"
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
