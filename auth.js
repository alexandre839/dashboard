class AuthManager {
    constructor() {
        this.user = null;
        this.init();
    }

    init() {
        if (window.netlifyIdentity) {
            window.netlifyIdentity.init({
                APIUrl: CONFIG.NETLIFY_SITE_URL + '/.netlify/identity'
            });

            window.netlifyIdentity.on('init', (user) => {
                if (user) {
                    this.user = user;
                    this.showDashboard();
                    loadAllData();
                }
            });

            window.netlifyIdentity.on('login', (user) => {
                this.user = user;
                this.showDashboard();
                loadAllData();
            });

            window.netlifyIdentity.on('logout', () => {
                this.user = null;
                this.showLogin();
            });

            window.netlifyIdentity.on('error', (err) => {
                console.error('Erro Netlify Identity:', err);
                document.getElementById('loginError').textContent = 
                    'Erro de autenticação: ' + (err.message || 'Tente novamente');
            });
        }

        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
    }

    async login() {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');
        const submitBtn = document.querySelector('#loginForm button');

        errorDiv.textContent = '';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Entrando...';

        try {
            if (window.netlifyIdentity && window.netlifyIdentity.gotrue) {
                // Método 1: Usar a API diretamente
                const response = await fetch(
                    `${CONFIG.NETLIFY_SITE_URL}/.netlify/identity/token?grant_type=password`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error_description || 'E-mail ou senha inválidos');
                }

                const data = await response.json();

                // Atualizar o Identity com o token
                window.netlifyIdentity.gotrue.currentUser(data);
                window.netlifyIdentity.emit('login', data);

            } else {
                // Fallback para autenticação local
                await this.loginLocal(email, password);
            }
        } catch (error) {
            console.error('Erro no login:', error);

            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorDiv.textContent = 'Erro de conexão. Verifique se o site está online.';
            } else if (error.message.includes('invalid_grant')) {
                errorDiv.textContent = 'E-mail ou senha inválidos. Verifique suas credenciais.';
            } else {
                errorDiv.textContent = error.message || 'Erro ao fazer login. Tente novamente.';
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Entrar';
        }
    }

    async loginLocal(email, password) {
        const users = JSON.parse(localStorage.getItem('dashboard_users') || '[]');
        const user = users.find(u => u.email === email && u.password === btoa(password));

        if (!user) {
            throw new Error('E-mail ou senha inválidos');
        }

        this.user = { email: user.email, name: user.name };
        localStorage.setItem('current_user', JSON.stringify(this.user));
        this.showDashboard();
        loadAllData();
    }

    logout() {
        if (window.netlifyIdentity && window.netlifyIdentity.currentUser()) {
            window.netlifyIdentity.logout();
        } else {
            localStorage.removeItem('current_user');
            this.user = null;
            this.showLogin();
        }
    }

    showLogin() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('dashboardScreen').style.display = 'none';
    }

    showDashboard() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'block';
    }

    isAuthenticated() {
        return this.user !== null;
    }
}

const authManager = new AuthManager();

function logout() {
    authManager.logout();
}

function showRecovery() {
    const email = prompt('Digite seu e-mail para recuperar a senha:');
    if (email && window.netlifyIdentity && window.netlifyIdentity.gotrue) {
        window.netlifyIdentity.gotrue
            .recover(email)
            .then(() => alert('E-mail de recuperação enviado! Verifique sua caixa de entrada.'))
            .catch(err => alert('Erro ao enviar e-mail: ' + err.message));
    } else {
        alert('Funcionalidade disponível apenas com Netlify Identity.');
    }
}

// Verificar autenticação ao carregar
window.addEventListener('load', () => {
    const savedUser = localStorage.getItem('current_user');
    if (savedUser && !window.netlifyIdentity) {
        authManager.user = JSON.parse(savedUser);
        authManager.showDashboard();
        loadAllData();
    }
});
