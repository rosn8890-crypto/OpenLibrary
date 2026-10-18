/* login.js - log in and sign up with Supabase Auth (email + password) */

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authMsg = document.getElementById("authMsg");

// After login, go back to the page the visitor wanted (only our own .html pages are allowed)
function goNext() {
  const next = new URLSearchParams(location.search).get("next") || "";
  location.href = /^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(next) ? next : "index.html";
}

async function initLogin() {
  await startPage();
  if (await getUser()) { goNext(); return; }   // already logged in

  document.getElementById("tabLogin").addEventListener("click", () => switchTab("login"));
  document.getElementById("tabSignup").addEventListener("click", () => switchTab("signup"));
  loginForm.addEventListener("submit", handleLogin);
  signupForm.addEventListener("submit", handleSignup);
}

function switchTab(which) {
  loginForm.hidden = which !== "login";
  signupForm.hidden = which !== "signup";
  document.getElementById("tabLogin").classList.toggle("btn-outline", which !== "login");
  document.getElementById("tabSignup").classList.toggle("btn-outline", which !== "signup");
  authMsg.innerHTML = "";
}

async function handleLogin(event) {
  event.preventDefault();
  const { error } = await db.auth.signInWithPassword({
    email: document.getElementById("loginEmail").value.trim(),
    password: document.getElementById("loginPassword").value
  });
  if (error) { showMessage(authMsg, error.message, "err"); return; }
  goNext();
}

async function handleSignup(event) {
  event.preventDefault();
  const password = document.getElementById("signupPassword").value;
  if (password.length < 6) { showMessage(authMsg, "Password must have at least 6 characters.", "err"); return; }

  const { data, error } = await db.auth.signUp({
    email: document.getElementById("signupEmail").value.trim(),
    password: password
  });
  if (error) { showMessage(authMsg, error.message, "err"); return; }

  if (data.session) goNext();   // email confirmation is OFF: user is logged in already
  else showMessage(authMsg, "Account created. Check your email to confirm it, then log in.", "ok");
}

initLogin();
