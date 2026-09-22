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
			buttonText.textContent = 'Giriş Yap';
			buttonLoading.style.display = 'none';
		}

		form.addEventListener('submit', async (e) => {
			e.preventDefault();
			const username = usernameInput.value.trim();
			const password = passwordInput.value;

			if (!username || !password) {
				errorDiv.textContent = 'Lütfen tüm alanları doldurun';
				errorDiv.classList.add('show');
				loginButton.classList.remove('success');
				loginButton.classList.add('error');
				return;
			}

			errorDiv.classList.remove('show');
			loginButton.classList.remove('error', 'success');
			loginButton.disabled = true;
			buttonText.style.display = 'none';
			buttonLoading.style.display = 'inline-flex';

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
					const errorMessage = typeof data?.error === 'string'
						? data.error
						: 'Şifre hatalı veya giriş başarısız.';
					errorDiv.textContent = errorMessage;
					errorDiv.classList.add('show');
					loginButton.classList.add('error');
					setButtonIdle();
					return;
				}

				const fullName = typeof data?.user?.fullName === 'string' && data.user.fullName.trim()
					? data.user.fullName.trim()
					: username;

				buttonLoading.style.display = 'none';
				buttonText.style.display = 'inline';
				buttonText.textContent = `Hoş geldiniz, ${fullName}`;
				loginButton.classList.add('success');

				setTimeout(() => {
					window.location.href = '/';
				}, 1800);
			} catch {
				errorDiv.textContent = 'Giriş sırasında ağ hatası oluştu. Tekrar deneyin.';
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
