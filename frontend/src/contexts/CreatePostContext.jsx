import { createContext, useContext, useState } from "react";

const CreatePostContext = createContext();

export const useCreatePost = () => {
  const context = useContext(CreatePostContext);
  if (!context) {
    throw new Error("useCreatePost must be used within CreatePostProvider");
  }
  return context;
};

export const CreatePostProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <CreatePostContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </CreatePostContext.Provider>
  );
};

