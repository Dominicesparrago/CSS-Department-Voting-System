import { loginStudent, registerStudent } from "./authService.js";
import { friendlyAuthError } from "./errors.js";
import { hasErrors, validateLogin, validateRegistration } from "./validation.js";
import { watchSession } from "./session.js";
import { hasAdminClaim } from "./guards-core.js";

const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const tabButtons = document.querySelectorAll("[data-auth-tab]");
const loginMessage = document.querySelector("#login-message");
const registerMessage = document.querySelector("#register-message");

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.authTab === tabName);
  });
  loginForm.classList.toggle("is-hidden", tabName !== "login");
  registerForm.classList.toggle("is-hidden", tabName !== "register");
}

function setErrors(formName, errors) {
  document.querySelectorAll(`[data-error-for^="${formName}-"]`).forEach((element) => {
    element.textContent = "";
  });

  Object.entries(errors).forEach(([field, message]) => {
    const element = document.querySelector(`[data-error-for="${formName}-${field}"]`);
    if (element) {
      element.textContent = message;
    }
  });
}

function formValues(form) {
  const data = new FormData(form);
  return {
    email: String(data.get("email") || "").trim().toLowerCase(),
    password: String(data.get("password") || ""),
    studentNo: String(data.get("studentNo") || "").trim(),
    fullName: String(data.get("fullName") || "").trim(),
    yearLevel: Number(data.get("yearLevel")),
    section: String(data.get("section") || "").trim()
  };
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.authTab));
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  const values = formValues(loginForm);
  const errors = validateLogin(values);
  setErrors("login", errors);

  if (hasErrors(errors)) {
    return;
  }

  loginForm.querySelector("button[type='submit']").disabled = true;
  try {
    await loginStudent(values.email, values.password);
    loginMessage.textContent = "Signed in. Redirecting...";
  } catch (error) {
    loginMessage.textContent = friendlyAuthError(error);
  } finally {
    loginForm.querySelector("button[type='submit']").disabled = false;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  registerMessage.textContent = "";
  const values = formValues(registerForm);
  const errors = validateRegistration(values);
  setErrors("register", errors);

  if (hasErrors(errors)) {
    return;
  }

  registerForm.querySelector("button[type='submit']").disabled = true;
  try {
    await registerStudent(values);
    registerMessage.textContent = "Account created. Redirecting...";
  } catch (error) {
    registerMessage.textContent = friendlyAuthError(error);
  } finally {
    registerForm.querySelector("button[type='submit']").disabled = false;
  }
});

watchSession((session) => {
  if (!session.user) {
    return;
  }

  if (hasAdminClaim(session.claims)) {
    window.location.assign("/admin/");
    return;
  }

  if (session.voterProfile) {
    window.location.assign("/vote.html");
    return;
  }

  loginMessage.textContent = "No voter profile was found for this account.";
});
