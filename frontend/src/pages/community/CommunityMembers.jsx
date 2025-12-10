import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { UsersIcon, ShieldCheckIcon, StarIcon } from '@heroicons/react/24/outline'
import * as communityApi from 'src/api/community'

const RoleBadge = ({ role }) => {
    const badges = {
        owner: {
            label: 'Chủ sở hữu',
            className: 'bg-yellow-500/10 text-yellow-600',
            icon: StarIcon,
        },
        admin: {
            label: 'Quản trị viên',
            className: 'bg-purple-500/10 text-purple-600',
            icon: ShieldCheckIcon,
        },
        moderator: {
            label: 'Điều hành viên',
            className: 'bg-blue-500/10 text-blue-600',
            icon: ShieldCheckIcon,
        },
        member: null,
    }

    const badge = badges[role]
    if (!badge) return null

    const Icon = badge.icon

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
        >
            <Icon className="h-3 w-3" />
            {badge.label}
        </span>
    )
}

const MemberCard = ({ member }) => {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            {/* Avatar */}
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {member.avatar_url ? (
                    <img
                        src={member.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <UsersIcon className="h-5 w-5 text-primary" />
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">
                        {member.full_name || member.username || `User ${member.user_id.slice(0, 8)}`}
                    </span>
                    <RoleBadge role={member.role} />
                </div>
                {member.flair && (
                    <span className="text-sm text-muted-foreground">{member.flair}</span>
                )}
            </div>

            {/* Status */}
            {member.status === 'pending' && (
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-600">
                    Đang chờ duyệt
                </span>
            )}
        </div>
    )
}

export default function CommunityMembers() {
    const { community, membership } = useOutletContext()
    const [members, setMembers] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState('all') // all, owners, moderators

    useEffect(() => {
        const loadMembers = async () => {
            if (!community?.id) return

            setIsLoading(true)
            try {
                const data = await communityApi.getCommunityMembers(community.id)
                setMembers(data || [])
            } catch (err) {
                console.error('Failed to load members:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadMembers()
    }, [community?.id])

    // Filter members
    const filteredMembers = members.filter((m) => {
        if (filter === 'owners') return m.role === 'owner' || m.role === 'admin'
        if (filter === 'moderators') return m.role === 'moderator'
        return true
    })

    // Group by role
    const owners = members.filter((m) => m.role === 'owner')
    const admins = members.filter((m) => m.role === 'admin')
    const moderators = members.filter((m) => m.role === 'moderator')
    const regularMembers = members.filter((m) => m.role === 'member')

    if (isLoading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex gap-2">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'all'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                >
                    Tất cả ({members.length})
                </button>
                <button
                    onClick={() => setFilter('owners')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'owners'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                >
                    Quản trị ({owners.length + admins.length})
                </button>
                <button
                    onClick={() => setFilter('moderators')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'moderators'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                >
                    Điều hành viên ({moderators.length})
                </button>
            </div>

            {/* Members List */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {filter === 'all' ? (
                    <>
                        {/* Owners & Admins */}
                        {(owners.length > 0 || admins.length > 0) && (
                            <div className="p-4 border-b border-border">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    Quản trị viên
                                </h3>
                                <div className="space-y-1">
                                    {[...owners, ...admins].map((member) => (
                                        <MemberCard key={member.id} member={member} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Moderators */}
                        {moderators.length > 0 && (
                            <div className="p-4 border-b border-border">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    Điều hành viên
                                </h3>
                                <div className="space-y-1">
                                    {moderators.map((member) => (
                                        <MemberCard key={member.id} member={member} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Regular Members */}
                        <div className="p-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                Thành viên ({regularMembers.length})
                            </h3>
                            {regularMembers.length === 0 ? (
                                <p className="text-muted-foreground text-sm py-4 text-center">
                                    Chưa có thành viên nào
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {regularMembers.map((member) => (
                                        <MemberCard key={member.id} member={member} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="p-4">
                        {filteredMembers.length === 0 ? (
                            <p className="text-muted-foreground text-sm py-4 text-center">
                                Không có thành viên nào
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {filteredMembers.map((member) => (
                                    <MemberCard key={member.id} member={member} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
