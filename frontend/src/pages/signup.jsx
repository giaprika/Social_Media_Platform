import React from "react";
import {
  Form,
  Input,
  Button,
  DatePicker,
  Select,
  Typography,
  Card,
  message,
} from "antd";
import { useNavigate } from "react-router-dom";
import { signup } from "src/api/auth";
import { validatePassword } from "src/utils/validate";
import { PATHS } from "src/constants/paths";

const { Title, Text } = Typography;

const SignUp = () => {
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    const { full_name, email, password, confirmPassword, birth_date, gender } =
      values;

    if (!validatePassword(password))
      return message.error("Password must be at least 8 characters");

    if (password !== confirmPassword)
      return message.error("Passwords do not match");

    try {
      await signup({
        full_name,
        email,
        password,
        birth_date: birth_date.format("YYYY-MM-DD"),
        gender,
      });
      message.success("Account created successfully!");
      navigate(PATHS.LOGIN);
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.error || "Signup failed");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 px-4">
      <Card className="shadow-xl w-full max-w-md rounded-2xl">
        <Title level={2} className="text-center mb-6 text-gray-800">
          Create Account
        </Title>

        <Form layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Full Name"
            name="full_name"
            rules={[{ required: true, message: "Please enter your full name" }]}
          >
            <Input size="large" placeholder="Your full name" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: "Please enter your email" }]}
          >
            <Input size="large" placeholder="you@example.com" />
          </Form.Item>

          <Form.Item
            label="Birth Date"
            name="birth_date"
            rules={[{ required: true }]}
          >
            <DatePicker size="large" className="w-full" />
          </Form.Item>

          <Form.Item label="Gender" name="gender" rules={[{ required: true }]}>
            <Select size="large" placeholder="Select">
              <Select.Option value="male">Male</Select.Option>
              <Select.Option value="female">Female</Select.Option>
              <Select.Option value="other">Other</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please enter a password" }]}
          >
            <Input.Password size="large" placeholder="••••••••" />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            name="confirmPassword"
            rules={[
              { required: true, message: "Please confirm your password" },
            ]}
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
            Sign Up
          </Button>
        </Form>

        <div className="text-center mt-4">
          <Text>Already have an account? </Text>
          <Button
            type="link"
            onClick={() => navigate(PATHS.LOGIN)}
            className="p-0"
          >
            Login
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SignUp;
