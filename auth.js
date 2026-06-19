// Gerenciamento de Autenticação com Netlify Identity
class AuthManager {
    constructor() {
        this.user = null;
        this.init();
    }

    init() {
        // Inicializar Netlify Identity
        if (window.netlifyIdentity) {
            window.netlifyIdentity.init();

            // Listener para login
            window.netlifyIdentity.on('login', (user) => {
                this.user = user;
                this.showDashboard();
                loadAllData();
            });

            // Listener para logout
            window.netlifyIdentity.on('logout', () => {
                this.user = null;
                this.showLogin();
            });

            // Verificar usuário atual
            this.user = window.netlifyIdentity.currentUser();
            if (this.user) {
                this.showDashboard();
                loadAllData();
            }
        }

        // Configurar formulário de login
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });
    }

    async login() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        try {
            errorDiv.textContent = '';

            if (window.netlifyIdentity) {
                // Usar Netlify Identity
                await this.loginWithNetlify(email, password);
            } else {
                // Fallback: autenticação local simples
                await this.loginLocal(email, password);
            }
        } catch (error) {
            errorDiv.textContent = 'Erro: ' + (error.message || 'Falha na autenticação');
        }
    }

    async loginWithNetlify(email, password) {
        // Netlify Identity usa GoTrue API
        const response = await fetch(`${CONFIG.NETLIFY_SITE_URL}/.netlify/identity/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'password',
                email: email,
                password: password
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_description || 'Credenciais inválidas');
        }

        const data = await response.json();
        window.netlifyIdentity.currentUser(data);
        window.netlifyIdentity.emit('login', data);
    }

    async loginLocal(email, password) {
        // Autenticação local simples (para desenvolvimento)
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
        if (window.netlifyIdentity) {
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

// Inicializar gerenciador de autenticação
const authManager = new AuthManager();

// Funções globais
function logout() {
    authManager.logout();
}

function showRecovery() {
    const email = prompt('Digite seu e-mail para recuperar a senha:');
    if (email && window.netlifyIdentity) {
        window.netlifyIdentity.gotrue.recover(email)
            .then(() => alert('E-mail de recuperação enviado!'))
            .catch(err => alert('Erro: ' + err.message));
    }
}

// Verificar autenticação ao carregar
window.addEventListener('load', () => {
    const savedUser = localStorage.getItem('current_user');
    if (savedUser && !window.netlifyIdentity) {
        authManager.user = JSON.parse(savedUser);
        authManager.showDashboard();
        loadAllData();
  
        
const users = JSON.parse(localStorage.getItem('dashboard_users') || '[]');
users.push({
    email: 'alexandre@sge.com.br',
    password: Agf@240770, // senha codificada
    name: 'Nome do Usuário'
});
localStorage.setItem('dashboard_users', JSON.stringify(users));
    }
});
