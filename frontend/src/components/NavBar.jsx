import { Layout, Menu } from "antd";
import { HomeOutlined, UserOutlined, SettingOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { PATHS } from "../constants/paths";
import logo from "src/assets/images/logo.svg";

const { Header } = Layout;

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Header
      style={{
        position: "fixed",
        top: 0,
        zIndex: 1000,
        width: "100%",
        display: "flex",
        alignItems: "center",
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
      }}
    >
      <div
        className="logo flex items-center cursor-pointer"
        onClick={() => navigate(PATHS.FEED)}
        style={{ marginRight: "24px" }}
      >
        <img src={logo} alt="logo" style={{ width: 32, height: 32 }} />
        <span style={{ marginLeft: 8, fontWeight: 600 }}>SocialApp</span>
      </div>

      <Menu
        theme="light"
        mode="horizontal"
        selectedKeys={[location.pathname]}
        onClick={({ key }) => navigate(key)}
        items={[
          { key: PATHS.FEED, icon: <HomeOutlined />, label: "Home" },
          { key: PATHS.PROFILE, icon: <UserOutlined />, label: "Profile" },
          { key: PATHS.SETTINGS, icon: <SettingOutlined />, label: "Settings" },
        ]}
        style={{ flex: 1, minWidth: 0 }}
      />
    </Header>
  );
};

export default NavBar;
