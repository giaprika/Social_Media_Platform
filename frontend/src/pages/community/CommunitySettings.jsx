import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Cog6ToothIcon, PhotoIcon, UsersIcon, ShieldCheckIcon, ExclamationTriangleIcon, CheckIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import * as communityApi from 'src/api/community'

const TabButton = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
        {children}
    </button>
)

const GeneralSettings = ({ community, onSave, isSaving }) => {
    const [formData, setFormData] = useState({
        name: community?.name || '', description: community?.description || '', category: community?.category || '',
        avatar_url: community?.avatar_url || '', banner_url: community?.banner_url || '',
    })
    const handleChange = (e) => { const { name, value } = e.target; setFormData((prev) => ({ ...prev, [name]: value })) }
    const handleSubmit = (e) => { e.preventDefault(); onSave(formData) }
    const categories = ['Technology', 'Gaming', 'Art', 'Music', 'Sports', 'Education', 'Business', 'Entertainment', 'Lifestyle', 'Other']

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-foreground mb-2">Community Name</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="w-full px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <div>
                <label className="block text-sm font-medium text-foreground mb-2">Category</label>
                <select name="category" value={formData.category} onChange={handleChange} className="w-full px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select category</option>
                    {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-foreground mb-2"><PhotoIcon className="h-4 w-4 inline mr-1" />Avatar URL</label>
                <input type="url" name="avatar_url" value={formData.avatar_url} onChange={handleChange} placeholder="https://example.com/avatar.jpg" className="w-full px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
                <label className="block text-sm font-medium text-foreground mb-2"><PhotoIcon className="h-4 w-4 inline mr-1" />Banner URL</label>
                <input type="url" name="banner_url" value={formData.banner_url} onChange={handleChange} placeholder="https://example.com/banner.jpg" className="w-full px-4 py-3 rounded-xl border border-border bg-muted/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <button type="submit" disabled={isSaving} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
        </form>
    )
}

const PrivacySettings = ({ community, onSave, isSaving }) => {
    const [formData, setFormData] = useState({
        visibility: community?.visibility || 'public', join_type: community?.join_type || 'open', post_permissions: community?.post_permissions || 'all',
    })
    const handleChange = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }))
    const handleSubmit = (e) => { e.preventDefault(); onSave(formData) }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-foreground mb-3">Visibility</label>
                <div className="space-y-2">
                    {[{ value: 'public', label: 'Public', desc: 'Anyone can find and view' }, { value: 'private', label: 'Private', desc: 'Only members can view' }].map((opt) => (
                        <label key={opt.value} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer ${formData.visibility === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                            <input type="radio" name="visibility" value={opt.value} checked={formData.visibility === opt.value} onChange={() => handleChange('visibility', opt.value)} className="sr-only" />
                            <div className="flex-1"><p className="font-medium text-foreground">{opt.label}</p><p className="text-sm text-muted-foreground">{opt.desc}</p></div>
                            {formData.visibility === opt.value && <CheckIcon className="h-5 w-5 text-primary" />}
                        </label>
                    ))}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-foreground mb-3">Join Method</label>
                <div className="space-y-2">
                    {[{ value: 'open', label: 'Open', desc: 'Anyone can join instantly' }, { value: 'approval', label: 'Requires Approval', desc: 'Admins must approve requests' }, { value: 'invite_only', label: 'Invite Only', desc: 'Can only join via invitation' }].map((opt) => (
                        <label key={opt.value} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer ${formData.join_type === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                            <input type="radio" name="join_type" value={opt.value} checked={formData.join_type === opt.value} onChange={() => handleChange('join_type', opt.value)} className="sr-only" />
                            <div className="flex-1"><p className="font-medium text-foreground">{opt.label}</p><p className="text-sm text-muted-foreground">{opt.desc}</p></div>
                            {formData.join_type === opt.value && <CheckIcon className="h-5 w-5 text-primary" />}
                        </label>
                    ))}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-foreground mb-3">Post Permissions</label>
                <div className="space-y-2">
                    {[{ value: 'all', label: 'All Members', desc: 'All members can post' }, { value: 'approved_only', label: 'Approved Members', desc: 'Only approved members can post' }, { value: 'moderators_only', label: 'Moderators Only', desc: 'Only mods and admins can post' }].map((opt) => (
                        <label key={opt.value} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer ${formData.post_permissions === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                            <input type="radio" name="post_permissions" value={opt.value} checked={formData.post_permissions === opt.value} onChange={() => handleChange('post_permissions', opt.value)} className="sr-only" />
                            <div className="flex-1"><p className="font-medium text-foreground">{opt.label}</p><p className="text-sm text-muted-foreground">{opt.desc}</p></div>
                            {formData.post_permissions === opt.value && <CheckIcon className="h-5 w-5 text-primary" />}
                        </label>
                    ))}
                </div>
            </div>
            <button type="submit" disabled={isSaving} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
        </form>
    )
}

const RulesSettings = ({ community, onSave, isSaving }) => {
    const [rules, setRules] = useState(community?.rules || [])
    const [newRule, setNewRule] = useState({ title: '', description: '' })
    const addRule = () => { if (!newRule.title.trim()) return; setRules([...rules, { ...newRule }]); setNewRule({ title: '', description: '' }) }
    const removeRule = (index) => setRules(rules.filter((_, i) => i !== index))
    const handleSubmit = (e) => { e.preventDefault(); onSave({ rules }) }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                {rules.map((rule, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/30">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">{index + 1}</span>
                        <div className="flex-1">
                            <p className="font-medium text-foreground">{rule.title}</p>
                            {rule.description && <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>}
                        </div>
                        <button type="button" onClick={() => removeRule(index)} className="p-2 rounded-lg text-destructive hover:bg-destructive/10"><XMarkIcon className="h-4 w-4" /></button>
                    </div>
                ))}
            </div>
            <div className="p-4 rounded-xl border border-dashed border-border">
                <h4 className="font-medium text-foreground mb-3">Add New Rule</h4>
                <div className="space-y-3">
                    <input type="text" placeholder="Rule title" value={newRule.title} onChange={(e) => setNewRule((prev) => ({ ...prev, title: e.target.value }))} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-foreground" />
                    <textarea placeholder="Description (optional)" value={newRule.description} onChange={(e) => setNewRule((prev) => ({ ...prev, description: e.target.value }))} rows={2} className="w-full px-4 py-2 rounded-xl border border-border bg-muted/50 text-foreground resize-none" />
                    <button type="button" onClick={addRule} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-foreground hover:bg-muted/80"><PlusIcon className="h-4 w-4" />Add Rule</button>
                </div>
            </div>
            <button type="submit" disabled={isSaving} className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save Rules'}
            </button>
        </form>
    )
}

const MembersManagement = ({ community }) => {
    const [members, setMembers] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState('all')

    useEffect(() => {
        const loadMembers = async () => {
            try { const data = await communityApi.getCommunityMembers(community.id); setMembers(data || []) }
            catch (err) { console.error('Failed to load members:', err) }
            finally { setIsLoading(false) }
        }
        loadMembers()
    }, [community.id])

    const handleUpdateMembership = async (membershipId, updateData) => {
        try { await communityApi.updateMembership(membershipId, updateData); const data = await communityApi.getCommunityMembers(community.id); setMembers(data || []) }
        catch (err) { console.error('Failed to update membership:', err) }
    }

    const filteredMembers = members.filter((m) => { if (filter === 'pending') return m.status === 'pending'; if (filter === 'banned') return m.status === 'banned'; return true })
    const pendingCount = members.filter((m) => m.status === 'pending').length

    if (isLoading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-xl text-sm ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>All ({members.length})</button>
                <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-xl text-sm ${filter === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Pending ({pendingCount})</button>
                <button onClick={() => setFilter('banned')} className={`px-4 py-2 rounded-xl text-sm ${filter === 'banned' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>Banned</button>
            </div>
            <div className="space-y-2">
                {filteredMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-4 rounded-xl border border-border">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><UsersIcon className="h-5 w-5 text-primary" /></div>
                        <div className="flex-1">
                            <p className="font-medium text-foreground">User {member.user_id.slice(0, 8)}...</p>
                            <p className="text-sm text-muted-foreground">{member.role} • {member.status}</p>
                        </div>
                        <div className="flex gap-2">
                            {member.status === 'pending' && (
                                <>
                                    <button onClick={() => handleUpdateMembership(member.id, { status: 'approved' })} className="p-2 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20"><CheckIcon className="h-4 w-4" /></button>
                                    <button onClick={() => handleUpdateMembership(member.id, { status: 'rejected' })} className="p-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20"><XMarkIcon className="h-4 w-4" /></button>
                                </>
                            )}
                            {member.status === 'approved' && member.role === 'member' && (
                                <button onClick={() => handleUpdateMembership(member.id, { status: 'banned' })} className="px-3 py-1 rounded-lg text-sm bg-red-500/10 text-red-600 hover:bg-red-500/20">Ban</button>
                            )}
                            {member.status === 'banned' && (
                                <button onClick={() => handleUpdateMembership(member.id, { status: 'approved' })} className="px-3 py-1 rounded-lg text-sm bg-green-500/10 text-green-600 hover:bg-green-500/20">Unban</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

const DangerZone = ({ community, onDelete }) => {
    const [confirmDelete, setConfirmDelete] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)
    const handleDelete = async () => { if (confirmDelete !== community.name) return; setIsDeleting(true); try { await onDelete() } finally { setIsDeleting(false) } }

    return (
        <div className="space-y-6">
            <div className="p-6 rounded-xl border-2 border-destructive/50 bg-destructive/5">
                <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-destructive/10"><ExclamationTriangleIcon className="h-6 w-6 text-destructive" /></div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-destructive">Delete Community</h3>
                        <p className="text-sm text-muted-foreground mt-1">This action cannot be undone. All community data will be permanently deleted.</p>
                        <div className="mt-4">
                            <label className="block text-sm text-foreground mb-2">Type <strong>{community.name}</strong> to confirm</label>
                            <input type="text" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-destructive/50 bg-background text-foreground" />
                        </div>
                        <button onClick={handleDelete} disabled={confirmDelete !== community.name || isDeleting} className="mt-4 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-medium disabled:opacity-50">
                            {isDeleting ? 'Deleting...' : 'Delete Community'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function CommunitySettings() {
    const { slug } = useParams()
    const navigate = useNavigate()
    const [community, setCommunity] = useState(null)
    const [membership, setMembership] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [activeTab, setActiveTab] = useState('general')
    const [message, setMessage] = useState(null)

    useEffect(() => {
        const loadCommunity = async () => {
            try {
                const data = await communityApi.getCommunityBySlug(slug); setCommunity(data)
                const membershipData = await communityApi.getMyMembership(data.id); setMembership(membershipData)
            } catch (err) { console.error('Failed to load community:', err) }
            finally { setIsLoading(false) }
        }
        loadCommunity()
    }, [slug])

    const isOwner = membership?.role === 'owner'
    const isAdmin = membership?.role === 'admin' || isOwner

    const handleSave = async (updateData) => {
        setIsSaving(true); setMessage(null)
        try { const updated = await communityApi.updateCommunity(community.id, updateData); setCommunity(updated); setMessage({ type: 'success', text: 'Changes saved!' }) }
        catch (err) { setMessage({ type: 'error', text: err.message || 'Failed to save changes' }) }
        finally { setIsSaving(false) }
    }

    const handleDelete = async () => {
        try { await communityApi.deleteCommunity(community.id); navigate('/app/communities') }
        catch (err) { setMessage({ type: 'error', text: err.message || 'Failed to delete community' }) }
    }

    if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center">
                <ShieldCheckIcon className="h-16 w-16 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">You don't have permission to access this page</p>
                <Link to={`/c/${slug}`} className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground">Go Back</Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background py-8">
            <div className="max-w-3xl mx-auto px-4">
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-xl bg-primary/10"><Cog6ToothIcon className="h-6 w-6 text-primary" /></div>
                    <div><h1 className="text-2xl font-bold text-foreground">Community Settings</h1><p className="text-muted-foreground">{community?.name}</p></div>
                </div>

                {message && <div className={`mb-6 p-4 rounded-xl ${message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>{message.text}</div>}

                <div className="border-b border-border mb-6">
                    <div className="flex gap-4">
                        <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')}>General</TabButton>
                        <TabButton active={activeTab === 'privacy'} onClick={() => setActiveTab('privacy')}>Privacy</TabButton>
                        <TabButton active={activeTab === 'rules'} onClick={() => setActiveTab('rules')}>Rules</TabButton>
                        <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')}>Members</TabButton>
                        {isOwner && <TabButton active={activeTab === 'danger'} onClick={() => setActiveTab('danger')}><span className="text-destructive">Danger</span></TabButton>}
                    </div>
                </div>

                <div className="bg-card rounded-2xl border border-border p-6">
                    {activeTab === 'general' && <GeneralSettings community={community} onSave={handleSave} isSaving={isSaving} />}
                    {activeTab === 'privacy' && <PrivacySettings community={community} onSave={handleSave} isSaving={isSaving} />}
                    {activeTab === 'rules' && <RulesSettings community={community} onSave={handleSave} isSaving={isSaving} />}
                    {activeTab === 'members' && <MembersManagement community={community} />}
                    {activeTab === 'danger' && isOwner && <DangerZone community={community} onDelete={handleDelete} />}
                </div>

                <div className="mt-6"><Link to={`/c/${slug}`} className="text-muted-foreground hover:text-foreground">← Back to Community</Link></div>
            </div>
        </div>
    )
}
