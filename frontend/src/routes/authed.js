import { PATHS } from "src/constants/paths";

import DefaultLayout from "../layouts/DefaultLayout";
import RequireAuth from "../layouts/RequireAuth";
import Feed from "../pages/feed";
import Profile from "../pages/profile";
import Settings from "../pages/setting";
import Search from "../pages/search";

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
          path: PATHS.PROFILE,
          element: <Profile />,
        },
        {
          path: "/app/profile/:userId",
          element: <Profile />,
        },
        {
          path: "/app/u/:username",
          element: <Profile />,
        },
        {
          path: PATHS.SETTINGS,
          element: <Settings />,
        },
        {
          path: PATHS.SEARCH,
          element: <Search />,
        },
      ],
    },
  ],
};

export default routes;
