import React from "react";
import { Form, Input, Button, Typography, message, Card } from "antd";
import { useNavigate } from "react-router-dom";
import * as auth from "src/api/auth";
import useAuth from "src/hooks/useAuth";
import { PATHS } from "src/constants/paths";
import { validateEmail, validatePassword } from "src/utils/validate";

const { Title, Text } = Typography;

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (values) => {
    const { email, password } = values;

    if (!validateEmail(email)) return message.error("Invalid email");
    if (!validatePassword(password))
      return message.error("Password must be at least 8 characters");

    try {
      const { data } = await auth.login({ email, password });
      await login({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        userId: data.user.id,
        user: data.user,
      });
      message.success("Login successful!");
      navigate(PATHS.ROOT);
    } catch (err) {
      console.error(err);
      message.error("Login failed. Please try again.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 px-4">
      <Card className="shadow-xl w-full max-w-md rounded-2xl">
        <Title level={2} className="text-center mb-6 text-gray-800">
          Welcome Back
        </Title>

        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: "Please enter your email" }]}
          >
            <Input size="large" placeholder="you@example.com" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please enter your password" }]}
          >
            <Input.Password size="large" placeholder="••••••••" />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            className="mt-2 rounded-lg"
          >
            Login
          </Button>
        </Form>

        <div className="text-center mt-4">
          <Text>Don’t have an account? </Text>
          <Button
            type="link"
            onClick={() => navigate(PATHS.SIGNUP)}
            className="p-0"
          >
            Sign up
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Login;
