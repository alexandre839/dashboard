// Estado da aplicação
let appData = {
    painel: null,
    sgpay: null,
    santander: null,
    cielo_sgp: null,
    cielo_hg: null,
    chargeback: null
};

// Cache em memória
let dataCache = {};
let lastFetchTime = {};

// Carregar dados da planilha com cache
async function fetchSheetData(sheetName) {
    const cacheKey = sheetName;
    const now = Date.now();

    // Verificar cache
    if (dataCache[cacheKey] && lastFetchTime[cacheKey] && 
        (now - lastFetchTime[cacheKey]) < CONFIG.CACHE_DURATION * 60 * 1000) {
        return dataCache[cacheKey];
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${sheetName}?key=${CONFIG.SHEETS_API_KEY}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erro ao carregar ${sheetName}`);
        const data = await response.json();
        const values = data.values || [];

        // Atualizar cache
        dataCache[cacheKey] = values;
        lastFetchTime[cacheKey] = now;

        return values;
    } catch (error) {
        console.error(`Erro ao carregar ${sheetName}:`, error);
        // Retornar cache antigo se disponível
        return dataCache[cacheKey] || [];
    }
}

async function loadAllData() {
    if (!authManager.isAuthenticated()) return;

    try {
        const [painel, sgpay, santander, cielo_sgp, cielo_hg, chargeback] = await Promise.all([
            fetchSheetData('PAINEL'),
            fetchSheetData('SGPAY'),
            fetchSheetData('Santander'),
            fetchSheetData('CIELO_SGP'),
            fetchSheetData('CIELO_HG'),
            fetchSheetData('Chargeback')
        ]);

        appData = { painel, sgpay, santander, cielo_sgp, cielo_hg, chargeback };
        updateDashboard();
        document.getElementById('lastUpdate').textContent = 'Atualizado: ' + new Date().toLocaleString('pt-BR');
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
    }
}

function refreshData() {
    const btn = document.getElementById('refreshBtn');
    btn.textContent = '⏳ Atualizando...';
    btn.disabled = true;

    // Limpar cache para forçar recarga
    dataCache = {};
    lastFetchTime = {};

    loadAllData().finally(() => {
        btn.textContent = '🔄 Atualizar';
        btn.disabled = false;
    });
}

// Processamento dos dados
function updateDashboard() {
    updatePainel();
    updateSgpay();
    updateSantander();
    updateCielo('cielo_sgp', 'Sgpay');
    updateCielo('cielo_hg', 'Hg');
    updateChargeback();
}

function updatePainel() {
    const data = appData.painel;
    if (!data || data.length === 0) return;

    // Função para encontrar valor monetário em uma linha
    const findValueInRow = (row, searchText) => {
        const text = row.join(' ').toLowerCase();
        if (text.includes(searchText.toLowerCase())) {
            // Procurar por padrão de moeda
            const valueCell = row.find(cell => {
                if (typeof cell === 'string') {
                    return cell.includes('R$') || /
^
\d+[\.,]\d+
$
/.test(cell);
                }
                return typeof cell === 'number';
            });
            if (valueCell) {
                if (typeof valueCell === 'number') return valueCell;
                // Extrair número
                const match = valueCell.toString().match(/[\d.,]+/);
                if (match) {
                    return parseFloat(match[0].replace(/\./g, '').replace(',', '.'));
                }
            }
        }
        return 0;
    };

    let saldoCC = 0, investimentos = 0, saldoDisponivel = 0;
    let cieloPrevisaoSgpay = 0, cieloPrevisaoHg = 0;

    data.forEach(row => {
        const rowText = row.join(' ').toLowerCase();

        if (rowText.includes('saldo disponível em conta corrente')) {
            saldoCC = findValueInRow(row, 'saldo disponível em conta corrente');
        } else if (rowText.includes('saldo em investimentos')) {
            investimentos = findValueInRow(row, 'saldo em investimentos');
        } else if (rowText.includes('saldo disponível (d + e)')) {
            saldoDisponivel = findValueInRow(row, 'saldo disponível (d + e)');
        } else if (rowText.includes('sgpay')) {
            cieloPrevisaoSgpay = findValueInRow(row, 'sgpay');
        } else if (rowText.includes('hg wells')) {
            cieloPrevisaoHg = findValueInRow(row, 'hg wells');
        }
    });

    document.getElementById('santanderD').textContent = formatCurrency(saldoCC);
    document.getElementById('santanderE').textContent = formatCurrency(investimentos);
    document.getElementById('santanderF').textContent = formatCurrency(saldoDisponivel);
    document.getElementById('cieloSgpay').textContent = formatCurrency(cieloPrevisaoSgpay);
    document.getElementById('cieloHgwells').textContent = formatCurrency(cieloPrevisaoHg);
}

function updateSgpay() {
    const data = appData.sgpay;
    if (!data || data.length < 2) return;

    const headers = data[0].map(h => h?.toString().toLowerCase() || '');
    const rows = data.slice(1);

    const getColIndex = (name) => headers.findIndex(h => h && h.includes(name.toLowerCase()));

    const valorIdx = getColIndex('valor');
    const statusIdx = getColIndex('status');
    const dataIdx = getColIndex('data');
    const favorecidoIdx = getColIndex('favorecido');
    const solicitanteIdx = getColIndex('solicitante');
    const empresaIdx = getColIndex('empresa');

    if (valorIdx === -1 || statusIdx === -1 || dataIdx === -1) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const cincoDiasAtras = new Date(hoje);
    cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5);

    let prontasQtde = 0;
    let prontasValor = 0;
    const prontasList = [];

    let concluidasMes = 0;
    let concluidasMesAnterior = 0;
    let canceladasMes = 0;
    let canceladasMesAnterior = 0;

    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    const anoMesAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;

    rows.forEach(row => {
        const valor = parseFloat(row[valorIdx]?.toString().replace(/\./g, '').replace(',', '.')) || 0;
        const status = row[statusIdx]?.toString().toLowerCase().trim() || '';
        const dataStr = row[dataIdx]?.toString().trim();

        if (!dataStr) return;

        const parts = dataStr.split(/[\/\-]/);
        if (parts.length < 3) return;
        const data = new Date(parts[2], parts[1] - 1, parts[0]);
        if (isNaN(data.getTime())) return;

        if (status === 'pronta para envio') {
            if (data >= cincoDiasAtras && data <= hoje) {
                prontasQtde++;
                prontasValor += valor;
                prontasList.push({
                    valor,
                    favorecido: row[favorecidoIdx] || '',
                    solicitante: row[solicitanteIdx] || '',
                    empresa: row[empresaIdx] || ''
                });
            }
        } else if (status === 'concluida') {
            if (data.getMonth() === mesAtual && data.getFullYear() === anoAtual) {
                concluidasMes += valor;
            } else if (data.getMonth() === mesAnterior && data.getFullYear() === anoMesAnterior) {
                concluidasMesAnterior += valor;
            }
        } else if (status === 'cancelada') {
            if (data.getMonth() === mesAtual && data.getFullYear() === anoAtual) {
                canceladasMes += valor;
            } else if (data.getMonth() === mesAnterior && data.getFullYear() === anoMesAnterior) {
                canceladasMesAnterior += valor;
            }
        }
    });

    document.getElementById('sgpayProntasQtde').textContent = prontasQtde;
    document.getElementById('sgpayProntasValor').textContent = formatCurrency(prontasValor);
    document.getElementById('sgpayConcluidasMes').textContent = formatCurrency(concluidasMes);
    document.getElementById('sgpayConcluidasMesAnterior').textContent = formatCurrency(concluidasMesAnterior);
    document.getElementById('sgpayCanceladasMes').textContent = formatCurrency(canceladasMes);
    document.getElementById('sgpayCanceladasMesAnterior').textContent = formatCurrency(canceladasMesAnterior);

    // Drilldown Top 15
    prontasList.sort((a, b) => b.valor - a.valor);
    const top15 = prontasList.slice(0, 15);

    const drilldownHtml = top15.map((item, index) => `
        <div class="drilldown-item">
            <div>
                <span style="color:#64748b">#${index + 1}</span>
                <span class="drilldown-value">${formatCurrency(item.valor)}</span>
            </div>
            <div style="font-size:11px; color:#94a3b8">
                <div>${item.favorecido}</div>
                <div>${item.solicitante}</div>
                <div>${item.empresa}</div>
            </div>
        </div>
    `).join('');

    document.getElementById('drilldownList').innerHTML = drilldownHtml || '<div class="loading">Nenhum registro encontrado</div>';
}

function updateSantander() {
    const data = appData.santander;
    if (!data || data.length < 2) return;

    const headers = data[0].map(h => h?.toString().toLowerCase() || '');
    const rows = data.slice(1);

    const getColIndex = (name) => headers.findIndex(h => h && h.includes(name.toLowerCase()));

    const dataIdx = getColIndex('data');
    const historicoIdx = getColIndex('histórico');
    const valorIdx = getColIndex('valor');

    if (dataIdx === -1 || historicoIdx === -1 || valorIdx === -1) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    const anteontem = new Date(hoje);
    anteontem.setDate(anteontem.getDate() - 2);

    const formatDate = (date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const a = date.getFullYear();
        return `${d}/${m}/${a}`;
    };

    const hojeStr = formatDate(hoje);
    const ontemStr = formatDate(ontem);
    const anteontemStr = formatDate(anteontem);

    let creditosHojeQtde = 0, creditosHojeValor = 0;
    let creditosOntemQtde = 0, creditosOntemValor = 0;
    let creditosAnteontemQtde = 0, creditosAnteontemValor = 0;
    let creditosMesQtde = 0;

    let debitosHojeValor = 0, debitosOntemValor = 0, debitosAnteontemValor = 0;
    let tarifasHojeValor = 0, tarifasOntemValor = 0, tarifasAnteontemValor = 0;
    let pagamentosHojeValor = 0, pagamentosOntemValor = 0, pagamentosAnteontemValor = 0;

    rows.forEach(row => {
        const dataStr = row[dataIdx]?.toString().trim() || '';
        const historico = row[historicoIdx]?.toString().trim().toUpperCase() || '';
        const valor = parseFloat(row[valorIdx]?.toString().replace(/\./g, '').replace(',', '.')) || 0;

        if (!dataStr) return;

        const isHoje = dataStr === hojeStr;
        const isOntem = dataStr === ontemStr;
        const isAnteontem = dataStr === anteontemStr;

        const parts = dataStr.split('/');
        if (parts.length < 3) return;
        const dataRow = new Date(parts[2], parts[1] - 1, parts[0]);
        const isMesAtual = dataRow.getMonth() === hoje.getMonth() && 
                          dataRow.getFullYear() === hoje.getFullYear();

        if (historico.startsWith('PIX RECEBIDO')) {
            if (isHoje) { creditosHojeQtde++; creditosHojeValor += valor; }
            if (isOntem) { creditosOntemQtde++; creditosOntemValor += valor; }
            if (isAnteontem) { creditosAnteontemQtde++; creditosAnteontemValor += valor; }
            if (isMesAtual) creditosMesQtde++;
        }

        if (historico.startsWith('PIX ENVIADO') || historico.startsWith('ACERTO')) {
            if (isHoje) debitosHojeValor += valor;
            if (isOntem) debitosOntemValor += valor;
            if (isAnteontem) debitosAnteontemValor += valor;
        }

        if (historico.startsWith('TAR')) {
            if (isHoje) tarifasHojeValor += valor;
            if (isOntem) tarifasOntemValor += valor;
            if (isAnteontem) tarifasAnteontemValor += valor;
        }

        if (historico.startsWith('PAGAMENTO DE BOLETO') || historico.startsWith('DEBITO AUTOMATICO')) {
            if (isHoje) pagamentosHojeValor += valor;
            if (isOntem) pagamentosOntemValor += valor;
            if (isAnteontem) pagamentosAnteontemValor += valor;
        }
    });

    document.getElementById('creditosHojeQtde').textContent = creditosHojeQtde;
    document.getElementById('creditosHojeValor').textContent = formatCurrency(creditosHojeValor);
    document.getElementById('creditosOntemQtde').textContent = creditosOntemQtde;
    document.getElementById('creditosOntemValor').textContent = formatCurrency(creditosOntemValor);
    document.getElementById('creditosAnteontemQtde').textContent = creditosAnteontemQtde;
    document.getElementById('creditosAnteontemValor').textContent = formatCurrency(creditosAnteontemValor);
    document.getElementById('creditosMesQtde').textContent = creditosMesQtde;

    document.getElementById('debitosHojeValor').textContent = formatCurrency(debitosHojeValor);
    document.getElementById('debitosOntemValor').textContent = formatCurrency(debitosOntemValor);
    document.getElementById('debitosAnteontemValor').textContent = formatCurrency(debitosAnteontemValor);

    document.getElementById('tarifasHojeValor').textContent = formatCurrency(tarifasHojeValor);
    document.getElementById('tarifasOntemValor').textContent = formatCurrency(tarifasOntemValor);
    document.getElementById('tarifasAnteontemValor').textContent = formatCurrency(tarifasAnteontemValor);

    document.getElementById('pagamentosHojeValor').textContent = formatCurrency(pagamentosHojeValor);
    document.getElementById('pagamentosOntemValor').textContent = formatCurrency(pagamentosOntemValor);
    document.getElementById('pagamentosAnteontemValor').textContent = formatCurrency(pagamentosAnteontemValor);
}

function updateCielo(sheetKey, prefix) {
    const data = appData[sheetKey];
    if (!data || data.length < 2) return;

    const headers = data[0].map(h => h?.toString().toLowerCase() || '');
    const rows = data.slice(1);

    const getColIndex = (name) => headers.findIndex(h => h && h.includes(name.toLowerCase()));

    const dataPagamentoIdx = getColIndex('data de pagamento');
    const tipoLancamentoIdx = getColIndex('tipo de lançamento');
    const valorLiquidoIdx = getColIndex('valor líquido');

    if (dataPagamentoIdx === -1 || tipoLancamentoIdx === -1 || valorLiquidoIdx === -1) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const depoisAmanha = new Date(hoje);
    depoisAmanha.setDate(depoisAmanha.getDate() + 2);

    const formatDate = (date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const a = date.getFullYear();
        return `${d}/${m}/${a}`;
    };

    const hojeStr = formatDate(hoje);
    const amanhaStr = formatDate(amanha);
    const depoisStr = formatDate(depoisAmanha);

    let creditoHoje = 0, creditoAmanha = 0, creditoDepois = 0;
    let debitoHoje = 0, debitoAmanha = 0, debitoDepois = 0;

    rows.forEach(row => {
        const dataStr = row[dataPagamentoIdx]?.toString().trim() || '';
        const tipo = row[tipoLancamentoIdx]?.toString().trim().toLowerCase() || '';
        const valor = parseFloat(row[valorLiquidoIdx]?.toString().replace(/\./g, '').replace(',', '.')) || 0;

        const isCredito = tipo === 'venda crédito' || tipo === 'venda parcelada';
        const isDebito = tipo === 'contestação do portador do cartão' || tipo === 'cancelamento de venda';

        if (dataStr === hojeStr) {
            if (isCredito) creditoHoje += valor;
            if (isDebito) debitoHoje += valor;
        } else if (dataStr === amanhaStr) {
            if (isCredito) creditoAmanha += valor;
            if (isDebito) debitoAmanha += valor;
        } else if (dataStr === depoisStr) {
            if (isCredito) creditoDepois += valor;
            if (isDebito) debitoDepois += valor;
        }
    });

    document.getElementById(`cielo${prefix}CreditoHoje`).textContent = formatCurrency(creditoHoje);
    document.getElementById(`cielo${prefix}CreditoAmanha`).textContent = formatCurrency(creditoAmanha);
    document.getElementById(`cielo${prefix}CreditoDepois`).textContent = formatCurrency(creditoDepois);
    document.getElementById(`cielo${prefix}DebitoHoje`).textContent = formatCurrency(debitoHoje);
    document.getElementById(`cielo${prefix}DebitoAmanha`).textContent = formatCurrency(debitoAmanha);
    document.getElementById(`cielo${prefix}DebitoDepois`).textContent = formatCurrency(debitoDepois);
}

function updateChargeback() {
    const data = appData.chargeback;
    if (!data || data.length < 2) return;

    const headers = data[0].map(h => h?.toString().toLowerCase() || '');
    const rows = data.slice(1);

    const getColIndex = (name) => headers.findIndex(h => h && h.includes(name.toLowerCase()));

    const dataSolicitacaoIdx = getColIndex('data da solicitação');
    const valorChargebackIdx = getColIndex('valor do chargeback');
    const bandeiraIdx = getColIndex('bandeira');
    const statusAutorizadoraIdx = getColIndex('status autorizadora');

    if (dataSolicitacaoIdx === -1) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const formatDate = (date) => {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const a = date.getFullYear();
        return `${d}/${m}/${a}`;
    };
    const hojeStr = formatDate(hoje);

    let cbHojeQtde = 0, cbHojeValor = 0;
    let cbMesQtde = 0, cbMesValor = 0;
    let cbMesRetrasadoQtde = 0, cbMesRetrasadoValor = 0;

    const bandeirasMes = {};
    const statusCount = {};

    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const mesRetrasado = mesAtual - 2;
    const anoMesRetrasado = mesRetrasado < 0 ? anoAtual - 1 : anoAtual;
    const mesRetrasadoAjustado = mesRetrasado < 0 ? mesRetrasado + 12 : mesRetrasado;

    rows.forEach(row => {
        const dataStr = row[dataSolicitacaoIdx]?.toString().trim() || '';
        const valor = valorChargebackIdx !== -1 ? parseFloat(row[valorChargebackIdx]?.toString().replace(/\./g, '').replace(',', '.')) || 0 : 0;
        const bandeira = bandeiraIdx !== -1 ? row[bandeiraIdx]?.toString().trim() || 'Não informado' : 'Não informado';
        const status = statusAutorizadoraIdx !== -1 ? row[statusAutorizadoraIdx]?.toString().trim() || 'Não informado' : 'Não informado';

        if (!dataStr) return;

        const parts = dataStr.split(/[\/\-]/);
        if (parts.length < 3) return;
        const dataRow = new Date(parts[2], parts[1] - 1, parts[0]);
        if (isNaN(dataRow.getTime())) return;

        if (dataStr === hojeStr) {
            cbHojeQtde++;
            cbHojeValor += valor;
        }

        if (dataRow.getMonth() === mesAtual && dataRow.getFullYear() === anoAtual) {
            cbMesQtde++;
            cbMesValor += valor;
            bandeirasMes[bandeira] = (bandeirasMes[bandeira] || 0) + 1;
        }

        if (dataRow.getMonth() === mesRetrasadoAjustado && dataRow.getFullYear() === anoMesRetrasado) {
            cbMesRetrasadoQtde++;
            cbMesRetrasadoValor += valor;
        }

        statusCount[status] = (statusCount[status] || 0) + 1;
    });

    document.getElementById('cbHojeQtde').textContent = cbHojeQtde;
    document.getElementById('cbHojeValor').textContent = formatCurrency(cbHojeValor);
    document.getElementById('cbMesQtde').textContent = cbMesQtde;
    document.getElementById('cbMesValor').textContent = formatCurrency(cbMesValor);
    document.getElementById('cbMesRetrasadoQtde').textContent = cbMesRetrasadoQtde;
    document.getElementById('cbMesRetrasadoValor').textContent = formatCurrency(cbMesRetrasadoValor);

    const bandeirasHtml = Object.entries(bandeirasMes)
        .sort((a, b) => b[1] - a[1])
        .map(([bandeira, count]) => `
            <span class="badge">
                ${bandeira}
                <span class="badge-count">${count}</span>
            </span>
        `).join('');
    document.getElementById('cbBandeiras').innerHTML = bandeirasHtml || '<span style="color:#64748b">Nenhum registro</span>';

    const statusHtml = Object.entries(statusCount)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => `
            <span class="badge">
                ${status}
                <span class="badge-count">${count}</span>
            </span>
        `).join('');
    document.getElementById('cbStatus').innerHTML = statusHtml || '<span style="color:#64748b">Nenhum registro</span>';
}

// Funções auxiliares
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    const users = JSON.parse(localStorage.getItem('dashboard_users') || '[]');
users.push({
    email: 'alexandre@sge.com.br',
    password: Agf@240770, // senha codificada
    name: 'Alexandre'
});
localStorage.setItem('dashboard_users', JSON.stringify(users));
}
