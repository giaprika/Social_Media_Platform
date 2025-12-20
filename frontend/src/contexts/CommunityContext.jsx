import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import useAuth from 'src/hooks/useAuth'
import * as communityApi from 'src/api/community'

const CommunityContext = createContext(null)

export function CommunityProvider({ children }) {
    const { user } = useAuth()

    // Current community state
    const [currentCommunity, setCurrentCommunity] = useState(null)
    const [currentMembership, setCurrentMembership] = useState(null)
    const [members, setMembers] = useState([])
    const [isLoadingCommunity, setIsLoadingCommunity] = useState(false)
    const [communityError, setCommunityError] = useState(null)

    // User's communities
    const [myCommunities, setMyCommunities] = useState([])
    const [isLoadingMyCommunities, setIsLoadingMyCommunities] = useState(false)

    // Discovery state
    const [discoveredCommunities, setDiscoveredCommunities] = useState([])
    const [categories, setCategories] = useState([])
    const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(false)

    // Load my communities
    const loadMyCommunities = useCallback(async () => {
        if (!user) {
            setMyCommunities([])
            return
        }

        setIsLoadingMyCommunities(true)
        try {
            const data = await communityApi.getMyCommunities()
            setMyCommunities(data || [])
        } catch (err) {
            console.error('Failed to load my communities:', err)
        } finally {
            setIsLoadingMyCommunities(false)
        }
    }, [user])

    // Load categories
    const loadCategories = useCallback(async () => {
        try {
            const data = await communityApi.getCategories()
            setCategories(data.categories || [])
        } catch (err) {
            console.error('Failed to load categories:', err)
        }
    }, [])

    // Load communities for discovery
    const loadCommunities = useCallback(async (options = {}) => {
        setIsLoadingDiscovery(true)
        try {
            const data = await communityApi.getCommunities(options)
            setDiscoveredCommunities(data.communities || [])
            return data
        } catch (err) {
            console.error('Failed to load communities:', err)
            throw err
        } finally {
            setIsLoadingDiscovery(false)
        }
    }, [])

    // Search communities
    const searchCommunities = useCallback(async (query, options = {}) => {
        setIsLoadingDiscovery(true)
        try {
            const data = await communityApi.searchCommunities(query, options)
            setDiscoveredCommunities(data.communities || [])
            return data
        } catch (err) {
            console.error('Failed to search communities:', err)
            throw err
        } finally {
            setIsLoadingDiscovery(false)
        }
    }, [])

    // Load a specific community by slug
    const loadCommunity = useCallback(async (slug) => {
        setIsLoadingCommunity(true)
        setCommunityError(null)
        try {
            const community = await communityApi.getCommunityBySlug(slug)
            setCurrentCommunity(community)

            // Try to load membership if logged in
            if (user) {
                try {
                    const membership = await communityApi.getMyMembership(community.id)
                    setCurrentMembership(membership)
                } catch {
                    setCurrentMembership(null)
                }
            }

            return community
        } catch (err) {
            setCommunityError(err.message || 'Failed to load community')
            setCurrentCommunity(null)
            setCurrentMembership(null)
            throw err
        } finally {
            setIsLoadingCommunity(false)
        }
    }, [user])

    // Load members of current community
    const loadMembers = useCallback(async (communityId) => {
        try {
            const data = await communityApi.getCommunityMembers(communityId || currentCommunity?.id)
            setMembers(data || [])
            return data
        } catch (err) {
            console.error('Failed to load members:', err)
            throw err
        }
    }, [currentCommunity?.id])

    // Join community
    const joinCommunity = useCallback(async (communityId, status = 'pending') => {
        try {
            const membership = await communityApi.joinCommunity(communityId || currentCommunity?.id, status)
            setCurrentMembership(membership)

            // Update member count
            if (currentCommunity) {
                setCurrentCommunity(prev => ({
                    ...prev,
                    member_count: (prev.member_count || 0) + 1
                }))
            }

            // Add to my communities
            if (currentCommunity && status === 'approved') {
                setMyCommunities(prev => [...prev, currentCommunity])
            }

            return membership
        } catch (err) {
            console.error('Failed to join community:', err)
            throw err
        }
    }, [currentCommunity])

    // Leave community
    const leaveCommunity = useCallback(async (communityId) => {
        try {
            await communityApi.leaveCommunity(communityId || currentCommunity?.id)
            setCurrentMembership(null)

            // Update member count
            if (currentCommunity) {
                setCurrentCommunity(prev => ({
                    ...prev,
                    member_count: Math.max((prev.member_count || 1) - 1, 0)
                }))
            }

            // Remove from my communities
            setMyCommunities(prev => prev.filter(c => c.id !== (communityId || currentCommunity?.id)))
        } catch (err) {
            console.error('Failed to leave community:', err)
            throw err
        }
    }, [currentCommunity])

    // Update community (for owners/admins)
    const updateCommunity = useCallback(async (communityId, updateData) => {
        try {
            const updated = await communityApi.updateCommunity(communityId || currentCommunity?.id, updateData)
            setCurrentCommunity(updated)
            return updated
        } catch (err) {
            console.error('Failed to update community:', err)
            throw err
        }
    }, [currentCommunity?.id])

    // Create community
    const createCommunity = useCallback(async (data) => {
        try {
            const community = await communityApi.createCommunity(data)
            await loadMyCommunities() // Refresh my communities
            return community
        } catch (err) {
            console.error('Failed to create community:', err)
            throw err
        }
    }, [loadMyCommunities])

    // Delete community
    const deleteCommunity = useCallback(async (communityId) => {
        try {
            await communityApi.deleteCommunity(communityId || currentCommunity?.id)
            setCurrentCommunity(null)
            setCurrentMembership(null)
            setMyCommunities(prev => prev.filter(c => c.id !== (communityId || currentCommunity?.id)))
        } catch (err) {
            console.error('Failed to delete community:', err)
            throw err
        }
    }, [currentCommunity?.id])

    // Clear current community
    const clearCurrentCommunity = useCallback(() => {
        setCurrentCommunity(null)
        setCurrentMembership(null)
        setMembers([])
        setCommunityError(null)
    }, [])

    // Check if current user is owner/admin/moderator
    const isOwner = currentMembership?.role === 'owner'
    const isAdmin = currentMembership?.role === 'admin' || isOwner
    const isModerator = currentMembership?.role === 'moderator' || isAdmin
    const isMember = currentMembership?.status === 'approved'

    // Load initial data
    useEffect(() => {
        loadCategories()
    }, [loadCategories])

    useEffect(() => {
        loadMyCommunities()
    }, [loadMyCommunities])

    const value = {
        // Current community
        currentCommunity,
        currentMembership,
        members,
        isLoadingCommunity,
        communityError,

        // User's communities
        myCommunities,
        isLoadingMyCommunities,

        // Discovery
        discoveredCommunities,
        categories,
        isLoadingDiscovery,

        // Role checks
        isOwner,
        isAdmin,
        isModerator,
        isMember,

        // Actions
        loadCommunity,
        loadMembers,
        loadMyCommunities,
        loadCommunities,
        loadCategories,
        searchCommunities,
        joinCommunity,
        leaveCommunity,
        updateCommunity,
        createCommunity,
        deleteCommunity,
        clearCurrentCommunity,
        setCurrentCommunity,
        setCurrentMembership,
    }

    return (
        <CommunityContext.Provider value={value}>
            {children}
        </CommunityContext.Provider>
    )
}

export function useCommunity() {
    const context = useContext(CommunityContext)
    if (!context) {
        throw new Error('useCommunity must be used within a CommunityProvider')
    }
    return context
}

export default CommunityContext
