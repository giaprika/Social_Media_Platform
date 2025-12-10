import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { UsersIcon, ShieldCheckIcon, StarIcon } from '@heroicons/react/24/outline'
import * as communityApi from 'src/api/community'
import * as userApi from 'src/api/user'

const RoleBadge = ({ role }) => {
    const badges = {
        owner: {
            label: 'Owner',
            className: 'bg-yellow-500/10 text-yellow-600',
            icon: StarIcon,
        },
        admin: {
            label: 'Admin',
            className: 'bg-purple-500/10 text-purple-600',
            icon: ShieldCheckIcon,
        },
        moderator: {
            label: 'Moderator',
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

const MemberCard = ({ member, userInfo }) => {
    const displayName = userInfo?.full_name || userInfo?.fullName || userInfo?.username || `User ${member.user_id.slice(0, 8)}...`
    const avatarUrl = userInfo?.avatar_url || userInfo?.avatarUrl || null

    return (
        <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-primary font-semibold text-sm">
                        {displayName.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{displayName}</span>
                    <RoleBadge role={member.role} />
                </div>
                {member.flair && <span className="text-sm text-muted-foreground">{member.flair}</span>}
                {userInfo?.username && <span className="text-xs text-muted-foreground">@{userInfo.username}</span>}
            </div>
            {member.status === 'pending' && (
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-600">Pending</span>
            )}
        </div>
    )
}

export default function CommunityMembers() {
    const { community } = useOutletContext()
    const [members, setMembers] = useState([])
    const [userInfoMap, setUserInfoMap] = useState({})
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState('all')

    useEffect(() => {
        const loadMembers = async () => {
            if (!community?.id) return
            setIsLoading(true)
            try {
                const data = await communityApi.getCommunityMembers(community.id)
                setMembers(data || [])

                const userInfoPromises = (data || []).map(async (member) => {
                    try {
                        const response = await userApi.getUserById(member.user_id)
                        return { userId: member.user_id, userInfo: response.data }
                    } catch {
                        return { userId: member.user_id, userInfo: null }
                    }
                })

                const userInfoResults = await Promise.all(userInfoPromises)
                const userMap = {}
                userInfoResults.forEach(({ userId, userInfo }) => {
                    userMap[userId] = userInfo
                })
                setUserInfoMap(userMap)
            } catch (err) {
                console.error('Failed to load members:', err)
            } finally {
                setIsLoading(false)
            }
        }
        loadMembers()
    }, [community?.id])

    const filteredMembers = members.filter((m) => {
        if (filter === 'owners') return m.role === 'owner' || m.role === 'admin'
        if (filter === 'moderators') return m.role === 'moderator'
        return true
    })

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
            <div className="flex gap-2">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                >
                    All ({members.length})
                </button>
                <button
                    onClick={() => setFilter('owners')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'owners' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                >
                    Admins ({owners.length + admins.length})
                </button>
                <button
                    onClick={() => setFilter('moderators')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === 'moderators' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                >
                    Moderators ({moderators.length})
                </button>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {filter === 'all' ? (
                    <>
                        {(owners.length > 0 || admins.length > 0) && (
                            <div className="p-4 border-b border-border">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Administrators</h3>
                                <div className="space-y-1">
                                    {[...owners, ...admins].map((member) => (
                                        <MemberCard key={member.id} member={member} userInfo={userInfoMap[member.user_id]} />
                                    ))}
                                </div>
                            </div>
                        )}
                        {moderators.length > 0 && (
                            <div className="p-4 border-b border-border">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Moderators</h3>
                                <div className="space-y-1">
                                    {moderators.map((member) => (
                                        <MemberCard key={member.id} member={member} userInfo={userInfoMap[member.user_id]} />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="p-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Members ({regularMembers.length})</h3>
                            {regularMembers.length === 0 ? (
                                <p className="text-muted-foreground text-sm py-4 text-center">No members yet</p>
                            ) : (
                                <div className="space-y-1">
                                    {regularMembers.map((member) => (
                                        <MemberCard key={member.id} member={member} userInfo={userInfoMap[member.user_id]} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="p-4">
                        {filteredMembers.length === 0 ? (
                            <p className="text-muted-foreground text-sm py-4 text-center">No members found</p>
                        ) : (
                            <div className="space-y-1">
                                {filteredMembers.map((member) => (
                                    <MemberCard key={member.id} member={member} userInfo={userInfoMap[member.user_id]} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
