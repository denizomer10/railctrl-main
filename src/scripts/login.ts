// Giriş formu istemcisi. login.astro tarafından bundled <script> ile çağrılır.
function initLoginForm() {
		const form = document.getElementById('loginForm') as HTMLFormElement | null;
		const errorDiv = document.getElementById('errorMessage') as HTMLDivElement | null;
		const usernameInput = document.getElementById('username') as HTMLInputElement | null;
		const passwordInput = document.getElementById('password') as HTMLInputElement | null;
		const toggleBtn = document.getElementById('password-toggle') as HTMLButtonElement | null;

		if (!form || !errorDiv || !usernameInput || !passwordInput) {
			return;
		}
		if (form.dataset.bound === '1') {
			return;
		}
		form.dataset.bound = '1';

		const loginButton = form.querySelector('.login-button') as HTMLButtonElement;
		const buttonText = form.querySelector('.button-text') as HTMLSpanElement;
		const buttonLoading = form.querySelector('.button-loading') as HTMLSpanElement;

		if (!loginButton || !buttonText || !buttonLoading) {
			return;
		}

		function setButtonIdle() {
			loginButton.disabled = false;
			loginButton.classList.remove('success');
			buttonText.style.display = 'inline';
			buttonText.textContent = document.documentElement.lang === 'en' ? 'Log in' : 'Giriş Yap';
			buttonLoading.style.display = 'none';
		}

		function setLoading(isLoading: boolean) {
			loginButton.disabled = isLoading;
			buttonText.style.display = isLoading ? 'none' : 'inline';
			buttonLoading.style.display = isLoading ? 'inline-flex' : 'none';
			if (isLoading) {
				buttonLoading.textContent = document.documentElement.lang === 'en' ? 'Signing in...' : 'Giriş yapılıyor...';
			}
		}

		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const username = usernameInput.value.trim();
			const password = passwordInput.value;

			if (!username || !password) {
				errorDiv.textContent = document.documentElement.lang === 'en' ? 'Please fill in all fields.' : 'Lütfen tüm alanları doldurun';
				errorDiv.classList.add('show');
				loginButton.classList.remove('success');
				loginButton.classList.add('error');
				return;
			}

			errorDiv.classList.remove('show');
			loginButton.classList.remove('error', 'success');
			setLoading(true);

			try {
				const response = await fetch('/api/auth/login', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Accept': 'application/json',
					},
					body: JSON.stringify({ username, password }),
				});

				const data = await response.json().catch(() => ({}));

				if (!response.ok) {
					const englishErrors: Record<string, string> = {
						missing_fields: 'Username and password are required.',
						invalid_credentials: 'Incorrect username or password.',
						rate_limit: 'Too many failed attempts. Please try again later.',
					};
					const errorMessage = document.documentElement.lang === 'en'
						? (englishErrors[data?.code] || 'Sign-in failed. Please try again.')
						: (typeof data?.error === 'string' ? data.error : 'Şifre hatalı veya giriş başarısız.');
					errorDiv.textContent = errorMessage;
					errorDiv.classList.add('show');
					loginButton.classList.add('error');
					setButtonIdle();
					return;
				}

				const fullName = typeof data?.user?.fullName === 'string' && data.user.fullName.trim()
					? data.user.fullName.trim()
					: username;

				loginButton.disabled = true;
				buttonLoading.style.display = 'none';
				buttonText.style.display = 'inline';
				buttonText.textContent = document.documentElement.lang === 'en' ? `Welcome, ${fullName}` : `Hoş geldiniz, ${fullName}`;
				loginButton.classList.add('success');

				window.location.replace('/');
			} catch {
				errorDiv.textContent = document.documentElement.lang === 'en'
					? 'A network error occurred. Please try again.'
					: 'Giriş sırasında ağ hatası oluştu. Tekrar deneyin.';
				errorDiv.classList.add('show');
				loginButton.classList.add('error');
				setButtonIdle();
			}
		});

		if (toggleBtn) {
			toggleBtn.addEventListener('click', () => {
				const isText = passwordInput.type === 'text';
				passwordInput.type = isText ? 'password' : 'text';
				toggleBtn.classList.toggle('active');
			});
		}
	}


export function initLogin(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginForm, { once: true });
  } else {
    initLoginForm();
  }
}
