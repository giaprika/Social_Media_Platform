import { Outlet } from "react-router-dom";
import NavBar from "src/components/NavBar";

const DefaultLayout = () => {
  return (
    <div className="relative min-h-screen">
      <style>{`
                body, html {
                    min-height: 100dvh !important;
                }
            `}</style>
      <div className="fixed inset-0 -z-50" />

      <NavBar />
      <div className="min-h-[calc(100dvh-60px)]">
        <Outlet className="outlet" />
      </div>
    </div>
  );
};

export default DefaultLayout;
