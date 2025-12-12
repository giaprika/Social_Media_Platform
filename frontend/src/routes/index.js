import authed from "./authed";
import nonAuthed from "./nonAuthed";
import { createElement } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

export const router = createBrowserRouter([authed, nonAuthed]);

export function Router() {
  return createElement(RouterProvider, { router });
}
