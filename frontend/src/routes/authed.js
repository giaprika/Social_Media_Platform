import { PATHS } from 'src/constants/paths'

import DefaultLayout from '../layouts/DefaultLayout'
import RequireAuth from '../layouts/RequireAuth'
import Feed from '../pages/feed'
import LiveStreams from '../pages/live'
import LiveStudio from '../pages/live-studio'
import Profile from '../pages/profile'
import Settings from '../pages/setting'
import Search from '../pages/search'
import PostDetail from '../pages/PostDetail'
import {
	CommunitiesExplore,
	CommunityPage,
	CommunityFeed,
	CommunityAbout,
	CommunityMembers,
	CommunityCreate,
	CommunitySettings,
} from '../pages/community'

const routes = {
	element: <DefaultLayout />,
	children: [
		{
			path: PATHS.DEFAULT,
			element: <RequireAuth />,
			children: [
				{
					path: PATHS.FEED,
					element: <Feed />,
				},
				{
					path: PATHS.LIVE,
					element: <LiveStreams />,
				},
				{
					path: '/app/live/studio',
					element: <LiveStudio />,
				},
				{
					path: PATHS.PROFILE,
					element: <Profile />,
				},
				{
					path: '/app/profile/:userId',
					element: <Profile />,
				},
				{
					path: '/app/u/:username',
					element: <Profile />,
				},
				{
					path: '/app/p/:postId',
					element: <PostDetail />,
				},
				{
					path: '/app/post/:postId',
					element: <PostDetail />,
				},
				{
					path: '/app/u/:username/post/:slug',
					element: <PostDetail />,
				},
				{
					path: PATHS.SETTINGS,
					element: <Settings />,
				},
				{
					path: PATHS.SEARCH,
					element: <Search />,
				},
				// Community routes
				{
					path: PATHS.COMMUNITIES,
					element: <CommunitiesExplore />,
				},
				{
					path: PATHS.COMMUNITY_CREATE,
					element: <CommunityCreate />,
				},
			],
		},
		// Community detail page (accessible without full auth for viewing)
		{
			path: '/c/:slug',
			element: <CommunityPage />,
			children: [
				{
					index: true,
					element: <CommunityFeed />,
				},
				{
					path: 'about',
					element: <CommunityAbout />,
				},
				{
					path: 'members',
					element: <CommunityMembers />,
				},
			],
		},
		// Community settings (requires auth)
		{
			path: '/c/:slug/settings',
			element: <CommunitySettings />,
		},
	],
}

export default routes
