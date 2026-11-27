import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "../hooks/useAuth";
import AuthHero from "../components/auth/AuthHero";
import CaptchaShield from "../components/auth/CaptchaShield";
import LogoImg from "../assets/connectx-logo.png";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [values, setValues] = useState({ username: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);

  const toastOptions = {
    position: "bottom-right",
    autoClose: 5000,
    pauseOnHover: true,
    draggable: true,
    theme: "dark",
  };

  const handleChange = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value });
  };

  const validateForm = () => {
    const { username, password } = values;
    if (username.trim() === "") {
      toast.error("Username is required.", toastOptions);
      return false;
    } else if (password === "") {
      toast.error("Password is required.", toastOptions);
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { username, password } = values;
      await login(username.trim(), password);
      navigate("/");
    } catch (err) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.msg ||
        err.message ||
        "Login failed. Please check your credentials.";
      toast.error(errorMessage, toastOptions);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div id="auth">
        <AuthHero />

        <div className="formside">
          <div className="form st">
            <div className="brand" style={{ marginBottom: "20px" }}>
              <img src={LogoImg} alt="ConnectX Logo" className="lg2" style={{ height: "32px", width: "auto" }} />
              <span className="wm">
                Connect<i>X</i>
              </span>
            </div>

            <h2 className="serif">Welcome back</h2>
            <p className="mut" style={{ marginTop: "4px" }}>
              Sign in to continue to your conversations.
            </p>

            <div className="seg">
              <button type="button" className="on">
                Sign In
              </button>
              <button type="button" onClick={() => navigate("/register")}>
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} data-testid="login-form">
              <div className="fld">
                <label>Username</label>
                <input
                  type="text"
                  className="in"
                  placeholder="Username"
                  name="username"
                  value={values.username}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoComplete="username"
                  data-testid="login-username"
                />
              </div>

              <div className="fld">
                <label>Password</label>
                <input
                  type="password"
                  className="in"
                  placeholder="Password"
                  name="password"
                  value={values.password}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                  data-testid="login-password"
                />
              </div>

              <CaptchaShield
                isVerified={isCaptchaVerified}
                onVerify={() => setIsCaptchaVerified(true)}
                disabled={isSubmitting}
              />

              <button
                type="submit"
                className="btn p w"
                disabled={isSubmitting}
                style={{ marginTop: "8px" }}
                data-testid="login-submit"
              >
                {isSubmitting ? (
                  <>
                    <span className="spin"></span> Signing in...
                  </>
                ) : (
                  "Log In"
                )}
              </button>

              <p className="sm mut" style={{ textAlign: "center", marginTop: "18px" }}>
                Don't have an account?{" "}
                <Link to="/register" className="lnk" style={{ color: "var(--acc)", textDecoration: "none" }}>
                  Sign up now
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
      <ToastContainer />
    </>
  );
}
