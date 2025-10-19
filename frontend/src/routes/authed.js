import { PATHS } from "src/constants/paths";

import DefaultLayout from "../layouts/DefaultLayout";
import RequireAuth from "../layouts/RequireAuth";
import Feed from "../pages/feed";
import Profile from "../pages/profile";
import Settings from "../pages/setting";

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
          path: PATHS.SETTINGS,
          element: <Settings />,
        },
      ],
    },
  ],
};

export default routes;
