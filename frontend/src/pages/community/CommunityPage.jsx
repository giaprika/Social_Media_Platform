import { useState, useEffect } from 'react'
import { useParams, Link, Outlet, useLocation } from 'react-router-dom'
import {
    UsersIcon,
    Cog6ToothIcon,
    ShareIcon,
    PlusIcon,
    ChatBubbleLeftIcon,
    InformationCircleIcon,
    UserGroupIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import * as communityApi from 'src/api/community'

// Category icons mapping
const CATEGORY_ICONS = {
    Technology: '💻',
    Gaming: '🎮',
    Art: '🎨',
    Music: '🎵',
    Sports: '⚽',
    Education: '📚',
    Business: '💼',
    Entertainment: '🎬',
    Lifestyle: '🌟',
    Science: '🔬',
    News: '📰',
    Food: '🍕',
    Travel: '✈️',
    Health: '💪',
    Finance: '💰',
    Photography: '📷',
    Movies: '🎥',
    Books: '📖',
    Anime: '🎌',
    Memes: '😂',
    Other: '🌐',
}

// Get icon for a community
const getCommunityIcon = (community) => {
    if (community.avatar_url) return null
    if (community.category && CATEGORY_ICONS[community.category]) {
        return CATEGORY_ICONS[community.category]
    }
    const name = community.name?.toLowerCase() || ''
    if (name.includes('tech') || name.includes('dev') || name.includes('code')) return '💻'
    if (name.includes('game') || name.includes('gaming')) return '🎮'
    if (name.includes('art') || name.includes('design')) return '🎨'
    if (name.includes('music')) return '🎵'
    return '🌐'
}

// Community Header Component
const CommunityHeader = ({
    community,
    membership,
    onJoin,
    onLeave,
    isLoading,
}) => {
    const [isJoining, setIsJoining] = useState(false)
    const isOwner = membership?.role === 'owner'
    const isAdmin = membership?.role === 'admin' || isOwner
    const isMember = membership?.status === 'approved'
    const icon = getCommunityIcon(community)

    const handleJoinClick = async () => {
        if (isMember) return
        setIsJoining(true)
        try {
            await onJoin()
        } finally {
            setIsJoining(false)
        }
    }

    return (
        <div className="relative">
            {/* Banner */}
            <div className="h-48 md:h-64 bg-gradient-to-r from-primary via-primary/80 to-primary/60 relative overflow-hidden">
                {community.banner_url && (
                    <img
                        src={community.banner_url}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>

            {/* Content */}
            <div className="max-w-5xl mx-auto px-4 relative">
                {/* Avatar */}
                <div className="absolute -top-12 left-4">
                    <div className="h-24 w-24 md:h-32 md:w-32 rounded-2xl bg-card border-4 border-background shadow-xl flex items-center justify-center overflow-hidden">
                        {community.avatar_url ? (
                            <img
                                src={community.avatar_url}
                                alt={community.name}
                                className="w-full h-full object-cover"
                            />
                        ) : icon ? (
                            <span className="text-5xl md:text-6xl">{icon}</span>
                        ) : (
                            <UsersIcon className="h-12 w-12 text-primary" />
                        )}
                    </div>
                </div>

                {/* Info and Actions */}
                <div className="pt-16 md:pt-6 md:pl-40 pb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                            {community.name}
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {community.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <UsersIcon className="h-4 w-4" />
                                {community.member_count?.toLocaleString() || 0} members
                            </span>
                            {community.category && (
                                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                                    {community.category}
                                </span>
                            )}
                            <span className="capitalize">{community.visibility}</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {isMember ? (
                            <div className="relative group">
                                <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary font-medium">
                                    <CheckIcon className="h-5 w-5" />
                                    Joined
                                </button>
                                {!isOwner && (
                                    <div className="absolute right-0 top-full mt-1 hidden group-hover:block">
                                        <button
                                            onClick={onLeave}
                                            className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm whitespace-nowrap"
                                        >
                                            Leave Community
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={handleJoinClick}
                                disabled={isJoining}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
                            >
                                <PlusIcon className="h-5 w-5" />
                                {isJoining ? 'Processing...' : 'Join'}
                            </button>
                        )}

                        <button className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted">
                            <ShareIcon className="h-5 w-5" />
                        </button>

                        {isAdmin && (
                            <Link
                                to={`/c/${community.slug}/settings`}
                                className="p-2 rounded-xl border border-border text-muted-foreground hover:bg-muted"
                            >
                                <Cog6ToothIcon className="h-5 w-5" />
                            </Link>
                        )}
                    </div>
                </div>

                {/* Navigation Tabs */}
                <nav className="flex gap-1 border-t border-border mt-2 pt-2">
                    <NavTab to={`/c/${community.slug}`} end>
                        <ChatBubbleLeftIcon className="h-4 w-4" />
                        Posts
                    </NavTab>
                    <NavTab to={`/c/${community.slug}/about`}>
                        <InformationCircleIcon className="h-4 w-4" />
                        About
                    </NavTab>
                    <NavTab to={`/c/${community.slug}/members`}>
                        <UserGroupIcon className="h-4 w-4" />
                        Members
                    </NavTab>
                </nav>
            </div>
        </div>
    )
}

// NavTab Component
const NavTab = ({ to, children, end }) => {
    const location = useLocation()
    const isActive = end
        ? location.pathname === to
        : location.pathname.startsWith(to)

    return (
        <Link
            to={to}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
                }`}
        >
            {children}
        </Link>
    )
}

// Sidebar Component
const CommunitySidebar = ({ community }) => {
    const rules = community.rules || []

    return (
        <div className="space-y-4">
            {/* About Card */}
            <div className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-semibold text-foreground mb-2">About</h3>
                <p className="text-sm text-muted-foreground">
                    {community.description || 'No description'}
                </p>
                <div className="mt-3 pt-3 border-t border-border text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <UsersIcon className="h-4 w-4" />
                        <span>{community.member_count || 0} members</span>
                    </div>
                </div>
            </div>

            {/* Rules Card */}
            {rules.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                    <h3 className="font-semibold text-foreground mb-3">Rules</h3>
                    <ol className="space-y-2">
                        {rules.map((rule, index) => (
                            <li key={index} className="text-sm">
                                <span className="font-medium text-foreground">
                                    {index + 1}. {rule.title}
                                </span>
                                {rule.description && (
                                    <p className="text-muted-foreground mt-0.5">
                                        {rule.description}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    )
}

// Main Page Component
export default function CommunityPage() {
    const { slug } = useParams()
    const [community, setCommunity] = useState(null)
    const [membership, setMembership] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    // Load community
    useEffect(() => {
        const loadCommunity = async () => {
            setIsLoading(true)
            setError(null)
            try {
                const data = await communityApi.getCommunityBySlug(slug)
                setCommunity(data)

                // Try to get membership (might fail if not logged in)
                try {
                    const membershipData = await communityApi.getMyMembership(data.id)
                    setMembership(membershipData)
                } catch {
                    setMembership(null)
                }
            } catch (err) {
                setError(err.message || 'Không thể tải thông tin cộng đồng')
                console.error('Failed to load community:', err)
            } finally {
                setIsLoading(false)
            }
        }

        if (slug) {
            loadCommunity()
        }
    }, [slug])

    // Handle join
    const handleJoin = async () => {
        try {
            const result = await communityApi.joinCommunity(
                community.id,
                community.join_type === 'open' ? 'approved' : 'pending'
            )
            setMembership(result)
            setCommunity((prev) => ({
                ...prev,
                member_count: (prev.member_count || 0) + 1,
            }))
        } catch (err) {
            console.error('Failed to join community:', err)
        }
    }

    // Handle leave
    const handleLeave = async () => {
        try {
            await communityApi.leaveCommunity(community.id)
            setMembership(null)
            setCommunity((prev) => ({
                ...prev,
                member_count: Math.max((prev.member_count || 1) - 1, 0),
            }))
        } catch (err) {
            console.error('Failed to leave community:', err)
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        )
    }

    if (error || !community) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <UsersIcon className="h-16 w-16 text-muted-foreground/50" />
                <p className="mt-4 text-destructive">{error || 'Community not found'}</p>
                <Link
                    to="/app/communities"
                    className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground"
                >
                    Go Back
                </Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <CommunityHeader
                community={community}
                membership={membership}
                onJoin={handleJoin}
                onLeave={handleLeave}
                isLoading={isLoading}
            />

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-4 py-6">
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Main Area */}
                    <div className="flex-1 min-w-0">
                        <Outlet context={{ community, membership }} />
                    </div>

                    {/* Sidebar */}
                    <div className="w-full lg:w-80 flex-shrink-0">
                        <CommunitySidebar community={community} />
                    </div>
                </div>
            </div>
        </div>
    )
}
