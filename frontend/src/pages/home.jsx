import React from "react";
import { useNavigate } from "react-router-dom";
import { PATHS } from "src/constants/paths";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-60px)] bg-gray-50">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Welcome to MyApp</h1>
      <div className="flex space-x-6">
        <button
          onClick={() => navigate(PATHS.LOGIN)}
          className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-all duration-200"
        >
          Login
        </button>
        <button
          onClick={() => navigate(PATHS.SIGNUP)}
          className="px-6 py-2 rounded-lg bg-gray-200 text-gray-800 font-semibold hover:bg-gray-300 transition-all duration-200"
        >
          Sign Up
        </button>
      </div>
    </div>
  );
}
