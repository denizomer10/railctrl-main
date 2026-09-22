// Kullanıcı işlemleri istemcisi. kullanici-islemleri.astro tarafından çağrılır.
function asBool(value: unknown, defaultValue = true): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (['1', 'true', 't', 'yes', 'on'].includes(v)) return true;
      if (['0', 'false', 'f', 'no', 'off'].includes(v)) return false;
    }
    return defaultValue;
  }

  // Load profile data
  async function loadProfile() {
    try {
      const res = await fetch('/api/user/profile', { credentials: 'include' });
      const data = await res.json();

      if (data.user) {
        const fullNameInput = document.getElementById('fullName') as HTMLInputElement;
        const emailInput = document.getElementById('email') as HTMLInputElement;
        const stationInput = document.getElementById('station') as HTMLSelectElement;
        const notifyMmsInput = document.getElementById('notifyMms') as HTMLInputElement;
        const notifyCalismaInput = document.getElementById('notifyCalisma') as HTMLInputElement;
        const notifyVardiyaInput = document.getElementById('notifyVardiya') as HTMLInputElement;
        const notifyKayipEsyaInput = document.getElementById('notifyKayipEsya') as HTMLInputElement;
        const roleDisplay = document.getElementById('roleDisplay') as HTMLElement;
        const createdAtDisplay = document.getElementById('createdAtDisplay') as HTMLElement;

        if (fullNameInput) fullNameInput.value = data.user.full_name || '';
        if (emailInput) emailInput.value = data.user.email || '';
        if (stationInput) stationInput.value = data.user.istasyon || '';
        if (notifyMmsInput) notifyMmsInput.checked = asBool(data.user.notify_mms, true);
        if (notifyCalismaInput) notifyCalismaInput.checked = asBool(data.user.notify_calisma, true);
        if (notifyVardiyaInput) notifyVardiyaInput.checked = asBool(data.user.notify_vardiya, true);
        if (notifyKayipEsyaInput) notifyKayipEsyaInput.checked = asBool(data.user.notify_kayip_esya, true);

        const roleMap: Record<string, string> = { admin: 'Admin', sef: 'Şef', gar_mudur: 'Gar Müdürü', user: 'Personel', personel: 'Personel' };
        if (roleDisplay) roleDisplay.textContent = roleMap[data.user.role] || data.user.role;

        if (data.user.created_at && createdAtDisplay) {
          const date = new Date(data.user.created_at);
          createdAtDisplay.textContent = date.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
        }
      }
    } catch (err) {
      console.error('Profil yüklenemedi:', err);
      showMessage('Profil bilgileri yüklenemedi', 'error');
    }
  }

  // Password toggle
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;

      const input = document.getElementById(targetId) as HTMLInputElement;
      const eyeOpen = btn.querySelector('.eye-open') as HTMLElement;
      const eyeClosed = btn.querySelector('.eye-closed') as HTMLElement;

      if (!input || !eyeOpen || !eyeClosed) return;

      if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
      } else {
        input.type = 'password';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
      }
    });
  });

  // Form submit
  const form = document.getElementById('profileForm') as HTMLFormElement;
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  const btnText = saveBtn?.querySelector('.btn-text') as HTMLElement;
  const btnLoading = saveBtn?.querySelector('.btn-loading') as HTMLElement;

  if (!form || !saveBtn || !btnText || !btnLoading) {
    console.error('Required form elements not found');
  }

  if (form && saveBtn && btnText && btnLoading) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullNameInput = document.getElementById('fullName') as HTMLInputElement;
    const emailInput = document.getElementById('email') as HTMLInputElement;
    const stationInput = document.getElementById('station') as HTMLSelectElement;
    const notifyMmsInput = document.getElementById('notifyMms') as HTMLInputElement;
    const notifyCalismaInput = document.getElementById('notifyCalisma') as HTMLInputElement;
    const notifyVardiyaInput = document.getElementById('notifyVardiya') as HTMLInputElement;
    const notifyKayipEsyaInput = document.getElementById('notifyKayipEsya') as HTMLInputElement;
    const currentPasswordInput = document.getElementById('currentPassword') as HTMLInputElement;
    const newPasswordInput = document.getElementById('newPassword') as HTMLInputElement;
    const confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement;

    if (!fullNameInput || !emailInput || !stationInput || !notifyMmsInput || !notifyCalismaInput || !notifyVardiyaInput || !notifyKayipEsyaInput || !currentPasswordInput || !newPasswordInput || !confirmPasswordInput) {
      showMessage('Form elements not found', 'error');
      return;
    }

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const station = stationInput.value;
    const notifyMms = notifyMmsInput.checked;
    const notifyCalisma = notifyCalismaInput.checked;
    const notifyVardiya = notifyVardiyaInput.checked;
    const notifyKayipEsya = notifyKayipEsyaInput.checked;
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validation
    if (!fullName) {
      showMessage('Ad Soyad alanı zorunludur', 'error');
      return;
    }

    if (!email) {
      showMessage('E-posta alanı zorunludur', 'error');
      return;
    }

    // Password validation
    if (newPassword || confirmPassword) {
      if (!currentPassword) {
        showMessage('Şifre değiştirmek için mevcut şifrenizi girmelisiniz', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        showMessage('Yeni şifreler eşleşmiyor', 'error');
        return;
      }
      if (newPassword.length < 6) {
        showMessage('Yeni şifre en az 6 karakter olmalı', 'error');
        return;
      }
    }

    // Show loading
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
    saveBtn.disabled = true;

    try {
      const body: any = {
        full_name: fullName,
        email: email,
        istasyon: station,
        notify_mms: notifyMms,
        notify_calisma: notifyCalisma,
        notify_vardiya: notifyVardiya,
        notify_kayip_esya: notifyKayipEsya
      };

      if (newPassword) {
        body.current_password = currentPassword;
        body.new_password = newPassword;
      }

      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showMessage('Profil başarıyla güncellendi!', 'success');
        
        // Clear password fields
        const currentPasswordInput = document.getElementById('currentPassword') as HTMLInputElement;
        const newPasswordInput = document.getElementById('newPassword') as HTMLInputElement;
        const confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement;

        if (currentPasswordInput) currentPasswordInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmPasswordInput) confirmPasswordInput.value = '';

        // Reload page after 1.5 seconds to update navbar
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        showMessage(data.error || 'Güncelleme hatası', 'error');
      }
    } catch (err) {
      console.error('Güncelleme hatası:', err);
      showMessage('Sunucu hatası', 'error');
    } finally {
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      saveBtn.disabled = false;
    }
  });
  }

  function showMessage(message: string, type: string): void {
    const messageBox = document.getElementById('messageBox') as HTMLElement;
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = 'message-box ' + type;
    messageBox.style.display = 'block';

    // Auto hide after 5 seconds
    setTimeout(() => {
      if (messageBox) {
        messageBox.style.display = 'none';
      }
    }, 5000);
  }

  // Load profile on page load

export function initKullaniciIslemleri(): void {
  void loadProfile();
}
